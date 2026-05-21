"""
Onboarding service — state machine for the conversational onboarding flow.

Phase 1 (Discovery): collect answers to 15 questions grouped in blocks A–G.
Phase 2 (AB Config): create accounts, categories, budgets, and schedules in Actual Budget.

The LLM is NOT used to drive the flow — only to parse free-form answers into structured data.
"""
import json
import logging
from typing import Any

import httpx

from backend.core.config import settings
from backend.core.memory.database import MemoryDB

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Question definitions
# ---------------------------------------------------------------------------

# Each question is a dict with:
#   num: int (1-15)
#   key: str (JSON key in answers)
#   text: str (question to show the user)
#   block: str (A-G for skip logic grouping)
#   schema: dict (JSON schema for LLM parsing)
#   skip_if: callable(answers) -> bool | None (None = always ask)

QUESTIONS: list[dict] = [
    # --- Block A — Budgeting style ---
    {
        "num": 1,
        "key": "budgeting_style",
        "block": "A",
        "text": (
            "Let's start! How would you like to manage your budget?\n\n"
            "**Envelope budgeting** — you allocate specific amounts to categories "
            "(groceries, transport, etc.) and track how much is left.\n\n"
            "**Tracking budgeting** — you just want to track your spending without "
            "strict limits, and see where your money goes.\n\n"
            "Which approach sounds right for you?"
        ),
        "options": ["Envelope", "Tracking"],
        "parse_prompt": (
            'Extract the budgeting style from the user reply. '
            'Return JSON: {"budgeting_style": "envelope" | "tracking"}'
        ),
        "schema": {"type": "object", "properties": {"budgeting_style": {"type": "string", "enum": ["envelope", "tracking"]}}, "required": ["budgeting_style"]},
    },
    # --- Block B — Household & income ---
    {
        "num": 2,
        "key": "household_size",
        "block": "B",
        "text": "How many people are in your household (including yourself)? Please enter a number.",
        "parse_prompt": 'Extract the number of people in the household. Return JSON: {"household_size": int}',
        "schema": {"type": "object", "properties": {"household_size": {"type": "integer", "minimum": 1}}, "required": ["household_size"]},
    },
    {
        "num": 3,
        "key": "monthly_income",
        "block": "B",
        "text": "What's your total monthly take-home pay (in EUR)? Please enter an amount.",
        "parse_prompt": 'Extract the monthly income amount in EUR. Return JSON: {"monthly_income": float}',
        "schema": {"type": "object", "properties": {"monthly_income": {"type": "number", "minimum": 0}}, "required": ["monthly_income"]},
    },
    {
        "num": 4,
        "key": "income_type",
        "block": "B",
        "text": "Is your income stable (same amount each month) or variable (changes month to month)?",
        "options": ["Stable", "Variable"],
        "parse_prompt": (
            'Extract the income type. If variable, also extract the minimum monthly income. '
            'Return JSON: {"income_type": "stable" | "variable"} '
            'If variable, also include: "income_minimum": float (minimum monthly income)'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "income_type": {"type": "string", "enum": ["stable", "variable"]},
                "income_minimum": {"type": "number", "minimum": 0},
            },
            "required": ["income_type"],
        },
    },
    {
        "num": 5,
        "key": "has_partner",
        "block": "B",
        "text": "Do you manage finances with a partner?",
        "options": ["Yes", "No"],
        "parse_prompt": (
            'Extract whether the user manages finances with a partner. '
            'If yes, also extract the partner\'s monthly income. '
            'Return JSON: {"has_partner": bool}. '
            'If has_partner is true, also include: "partner_income": float'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "has_partner": {"type": "boolean"},
                "partner_income": {"type": "number", "minimum": 0},
            },
            "required": ["has_partner"],
        },
    },
    # --- Block C — Accounts ---
    {
        "num": 6,
        "key": "accounts",
        "block": "C",
        "text": (
            "Let's set up your accounts. Please list all your bank accounts "
            "and their current balances.\n\n"
            "For example: 'ING checking: €3,200, Revolut savings: €5,000, "
            "Trade Republic investment: €12,000'\n\n"
            "Include any accounts you use regularly — checking, savings, "
            "investment accounts, or even cash."
        ),
        "parse_prompt": (
            'Extract the list of bank accounts from the user reply. '
            'Auto-classify: "investment" or "pension" in the name → off_budget: true, '
            'rest → off_budget: false. '
            'Return JSON: {"accounts": [{"name": str, "balance": float, '
            '"type": "checking" | "savings" | "investment" | "cash", '
            '"off_budget": bool}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "accounts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "balance": {"type": "number"},
                            "type": {"type": "string", "enum": ["checking", "savings", "investment", "cash"]},
                            "off_budget": {"type": "boolean"},
                        },
                        "required": ["name", "balance", "type", "off_budget"],
                    },
                }
            },
            "required": ["accounts"],
        },
    },
    {
        "num": 7,
        "key": "credit_cards",
        "block": "C",
        "text": (
            "Do you have any credit cards? If yes, please list them with their "
            "current balance and whether you pay them in full each month.\n\n"
            "For example: 'Revolut credit card: €500, paid in full'\n\n"
            "If you don't have any credit cards, just say 'no'."
        ),
        "parse_prompt": (
            'Extract credit card information. If the user says no/none, '
            'return {"credit_cards": []}. '
            'Otherwise return JSON: {"credit_cards": [{"name": str, '
            '"balance": float, "pays_full": bool}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "credit_cards": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "balance": {"type": "number"},
                            "pays_full": {"type": "boolean"},
                        },
                        "required": ["name", "balance", "pays_full"],
                    },
                }
            },
            "required": ["credit_cards"],
        },
    },
    {
        "num": 8,
        "key": "foreign_currencies",
        "block": "C",
        "text": (
            "Do you have any transactions in currencies other than EUR? "
            "If yes, which currencies and what exchange rate do you use?\n\n"
            "For example: 'USD, rate 1.05'\n\n"
            "If not, just say 'no'."
        ),
        "parse_prompt": (
            'Extract foreign currency information. If the user says no/none, '
            'return {"foreign_currencies": []}. '
            'Otherwise return JSON: {"foreign_currencies": [{"currency": str, '
            '"rate": float}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "foreign_currencies": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "currency": {"type": "string"},
                            "rate": {"type": "number", "minimum": 0},
                        },
                        "required": ["currency", "rate"],
                    },
                }
            },
            "required": ["foreign_currencies"],
        },
    },
    # --- Block D — Fixed obligations ---
    {
        "num": 9,
        "key": "schedules",
        "block": "D",
        "text": (
            "Let's talk about recurring payments. What regular monthly payments "
            "do you have? This includes rent/mortgage, subscriptions, insurance, "
            "utilities, and your salary deposit.\n\n"
            "For example: 'Rent €1200 on the 1st, Netflix €15 on the 15th, "
            "Salary €3500 on the 25th, Gym €50 on the 5th'\n\n"
            "If you have no recurring payments, just say 'none'."
        ),
        "parse_prompt": (
            'Extract recurring monthly payments/schedules. '
            'Each item has a name, amount, day of month, and type (expense or income). '
            'If the user says none/no, return {"schedules": []}. '
            'Return JSON: {"schedules": [{"name": str, "amount": float, '
            '"day_of_month": int, "type": "expense" | "income"}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "schedules": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "amount": {"type": "number", "minimum": 0},
                            "day_of_month": {"type": "integer", "minimum": 1, "maximum": 31},
                            "type": {"type": "string", "enum": ["expense", "income"]},
                        },
                        "required": ["name", "amount", "day_of_month", "type"],
                    },
                }
            },
            "required": ["schedules"],
        },
    },
    {
        "num": 10,
        "key": "loans",
        "block": "D",
        "text": (
            "Do you have any loans or debts (besides mortgage)? If yes, please "
            "list them with the monthly payment and remaining balance.\n\n"
            "For example: 'Car loan: €300/month, €8,000 remaining'\n\n"
            "If you have no loans or debts, just say 'none'."
        ),
        "parse_prompt": (
            'Extract loan/debt information. If the user says no/none, '
            'return {"loans": []}. '
            'Otherwise return JSON: {"loans": [{"name": str, '
            '"monthly_payment": float, "balance": float}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "loans": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "monthly_payment": {"type": "number", "minimum": 0},
                            "balance": {"type": "number", "minimum": 0},
                        },
                        "required": ["name", "monthly_payment", "balance"],
                    },
                }
            },
            "required": ["loans"],
        },
        # Skip Q10 if Q9 has no schedules
        "skip_if": lambda a: not a.get("schedules"),
    },
    # --- Block E — Goals ---
    {
        "num": 11,
        "key": "goals",
        "block": "E",
        "text": (
            "What are your financial goals? You can select multiple.\n\n"
            "Supported goals:\n"
            "- Emergency fund\n"
            "- Vacation\n"
            "- Car\n"
            "- House\n"
            "- Financial independence (FIRE)\n"
            "- Debt payoff\n"
            "- Other (please describe)\n\n"
            "For each goal, please tell me the target amount and when you'd "
            "like to achieve it.\n\n"
            "For example: 'Emergency fund: €10,000 in 12 months, "
            "Vacation: €3,000 in 6 months'"
        ),
        "parse_prompt": (
            'Extract financial goals from the user reply. '
            'Supported types: emergency_fund, vacation, car, house, fire, '
            'debt_payoff, other. '
            'Return JSON: {"goals": [{"type": str, "amount": float, '
            '"target_date": str (YYYY-MM or free text), '
            '"monthly_contribution": float}]}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "goals": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {"type": "string"},
                            "amount": {"type": "number", "minimum": 0},
                            "target_date": {"type": "string"},
                            "monthly_contribution": {"type": "number", "minimum": 0},
                        },
                        "required": ["type", "amount"],
                    },
                }
            },
            "required": ["goals"],
        },
    },
    # --- Block F — End of month ---
    {
        "num": 12,
        "key": "eom_strategy",
        "block": "F",
        "text": (
            "What should happen to leftover money at the end of the month?\n\n"
            "- **Roll over** — keep it in the category for next month\n"
            "- **Send to emergency fund** — automatically move to emergency savings\n"
            "- **Split** — part to emergency, part to a savings goal\n"
            "- **Manual** — I'll decide each month\n\n"
            "Which do you prefer?"
        ),
        "options": ["Roll over", "Send to emergency fund", "Split", "Manual"],
        "parse_prompt": (
            'Extract the end-of-month strategy. '
            'Return JSON: {"eom_strategy": "rollover" | "sink_emergency" | '
            '"sink_split" | "manual"}'
        ),
        "schema": {
            "type": "object",
            "properties": {
                "eom_strategy": {"type": "string", "enum": ["rollover", "sink_emergency", "sink_split", "manual"]}
            },
            "required": ["eom_strategy"],
        },
    },
    {
        "num": 13,
        "key": "wants_buffer",
        "block": "F",
        "text": (
            "Would you like to keep a one-month buffer in your checking account? "
            "This means you'll always have one month's expenses available before "
            "spending from the current month's budget. Yes or no?"
        ),
        "options": ["Yes", "No"],
        "parse_prompt": (
            'Extract whether the user wants a one-month buffer. '
            'Return JSON: {"wants_buffer": bool}'
        ),
        "schema": {"type": "object", "properties": {"wants_buffer": {"type": "boolean"}}, "required": ["wants_buffer"]},
    },
    # --- Block G — Historical data ---
    {
        "num": 14,
        "key": "wants_historical_import",
        "block": "G",
        "text": (
            "Do you have past bank statements you'd like to import? "
            "I can help you import CSV files from your bank to see your "
            "historical spending patterns.\n\n"
            "You can do this later too, so no pressure. Would you like to "
            "import historical data now?"
        ),
        "options": ["Yes", "No, later"],
        "parse_prompt": (
            'Extract whether the user wants to import historical transactions. '
            'Return JSON: {"wants_historical_import": bool}'
        ),
        "schema": {"type": "object", "properties": {"wants_historical_import": {"type": "boolean"}}, "required": ["wants_historical_import"]},
    },
    {
        "num": 15,
        "key": "transfer_detection_acknowledged",
        "block": "G",
        "text": (
            "Great! When you import your transactions, I'll automatically detect "
            "transfers between your accounts (e.g., moving money from checking "
            "to savings) so they don't get counted as income or expenses.\n\n"
            "Just so you know, this transfer detection runs automatically after import. "
            "Sound good?"
        ),
        "options": ["Sounds good!", "I'll set it up later"],
        "parse_prompt": (
            'Extract whether the user acknowledges the transfer detection info. '
            'Return JSON: {"transfer_detection_acknowledged": bool}'
        ),
        "schema": {"type": "object", "properties": {"transfer_detection_acknowledged": {"type": "boolean"}}, "required": ["transfer_detection_acknowledged"]},
        # Skip Q15 if Q14 = false
        "skip_if": lambda a: not a.get("wants_historical_import"),
    },
]

# ---------------------------------------------------------------------------
# Question text map (for display/streaming)
# ---------------------------------------------------------------------------

QUESTION_TEXTS: dict[int, str] = {q["num"]: q["text"] for q in QUESTIONS}

# ---------------------------------------------------------------------------
# Phase 2 — AB Configuration helpers
# ---------------------------------------------------------------------------

SUGGESTED_CATEGORIES: dict[str, list[str]] = {
    "Living": ["Rent / Mortgage", "Groceries", "Utilities", "Insurance"],
    "Transport": ["Fuel", "Public Transport", "Car Maintenance"],
    "Personal": ["Clothing", "Health", "Personal Money"],
    "Leisure": ["Restaurants", "Entertainment", "Vacation"],
    "Financial": ["Investments & Savings", "Emergency Fund"],
    "Income": ["Salary"],
}

SUGGESTED_CHILDREN_CATEGORIES: dict[str, list[str]] = {
    "Children": ["Childcare", "School", "Kids Activities"],
}


def _get_category_groups(answers: dict) -> dict[str, list[str]]:
    """Build category groups based on household profile."""
    groups = dict(SUGGESTED_CATEGORIES)

    household_size = answers.get("household_size", 1)
    # If household has more than 1 adult (has_partner or household > 1), add Personal Money per person
    if household_size > 1:
        # Replace Personal Money with per-person amounts
        personal_items = []
        for i in range(household_size):
            personal_items.append(f"Personal Money — Person {i + 1}")
        groups["Personal"] = ["Clothing", "Health"] + personal_items

    # Add Children group if household seems to have kids (household > 2 and has partner)
    has_partner = answers.get("has_partner", False)
    if household_size > 1 and has_partner and household_size > 2:
        groups.update(SUGGESTED_CHILDREN_CATEGORIES)

    return groups


def _compute_budget_allocations(answers: dict, groups: dict[str, list[str]]) -> dict[str, float]:
    """Compute simple budget allocations based on monthly income."""
    monthly_income = answers.get("monthly_income", 0)
    allocations: dict[str, float] = {}

    if monthly_income <= 0:
        return allocations

    # Flatten category list
    all_cats = [cat for group_cats in groups.values() for cat in group_cats]

    # Income categories get the full income amount
    for cat in all_cats:
        if cat == "Salary":
            allocations[cat] = monthly_income

    # Expense categories — simple heuristic
    # Groceries: 15%
    allocations["Groceries"] = round(monthly_income * 0.15, 2)

    # Savings/Emergency: 10%
    allocations["Investments & Savings"] = round(monthly_income * 0.05, 2)
    allocations["Emergency Fund"] = round(monthly_income * 0.05, 2)

    # Personal Money: 5% × household_size
    household_size = answers.get("household_size", 1)
    personal_money_total = round(monthly_income * 0.05 * household_size, 2)
    if household_size > 1:
        # Distribute among Personal Money — Person X entries
        personal_keys = [k for k in all_cats if k.startswith("Personal Money")]
        if personal_keys:
            per_person = round(personal_money_total / len(personal_keys), 2)
            for pk in personal_keys:
                allocations[pk] = per_person
    else:
        allocations["Personal Money"] = personal_money_total

    # Remaining categories — distribute leftover proportionally
    allocated_so_far = sum(allocations.values())
    remaining = monthly_income - allocated_so_far

    if remaining > 0:
        other_cats = [c for c in all_cats if c not in allocations and c != "Salary"]
        if other_cats:
            # Give Rent a bigger share if it exists
            rent_share = 0.25
            if "Rent / Mortgage" in other_cats:
                allocations["Rent / Mortgage"] = round(remaining * rent_share, 2)
                remaining -= allocations["Rent / Mortgage"]
                other_cats = [c for c in other_cats if c != "Rent / Mortgage"]

            # Distribute rest evenly-ish
            if other_cats:
                per_cat = round(remaining / len(other_cats), 2)
                for cat in other_cats:
                    allocations[cat] = per_cat

    return allocations


# ---------------------------------------------------------------------------
# OnboardingService
# ---------------------------------------------------------------------------


class OnboardingService:
    """State machine for the onboarding flow."""

    def __init__(self, memory_db: MemoryDB):
        self.memory_db = memory_db
        self.ollama_url = settings.ollama.url
        self.model = settings.ollama.chat_model or "qwen2.5:7b"

    # ── State management ──────────────────────────────────────────────

    def get_state(self, user_id: str = "default") -> dict | None:
        return self.memory_db.get_onboarding_state(user_id)

    def _save_state(self, user_id: str, state: dict):
        self.memory_db.save_onboarding_state(user_id, state)

    def clear_state(self, user_id: str = "default"):
        self.memory_db.clear_onboarding_state(user_id)

    def create_new_state(self, user_id: str = "default") -> dict:
        state = {
            "user_id": user_id,
            "current_question": 1,
            "answers": {},
            "phase": 1,
            "completed_at": None,
        }
        self._save_state(user_id, state)
        return state

    # ── LLM parsing ───────────────────────────────────────────────────

    async def _parse_with_llm(self, question: dict, user_reply: str) -> dict | None:
        """Call Ollama to parse the user's free-form reply into structured JSON."""
        prompt = f"""{question['parse_prompt']}

Question: {question['text']}

User reply: {user_reply}

Return ONLY valid JSON matching this schema: {json.dumps(question['schema'])}
"""

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "think": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 256,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                response = await client.post(f"{self.ollama_url}/api/chat", json=payload)
                if response.status_code != 200:
                    logger.warning("LLM parsing failed: HTTP %d", response.status_code)
                    return None
                data = response.json()
                content = data.get("message", {}).get("content", "").strip()
                logger.debug("LLM parse raw response: %s", content[:200])
                json_start = content.find("{")
                json_end = content.rfind("}")
                if json_start != -1 and json_end != -1:
                    json_str = content[json_start:json_end + 1]
                    parsed = json.loads(json_str)
                    if self._validate_parsed(question["schema"], parsed):
                        return parsed
                    logger.warning("LLM parse validation failed: %s", parsed)
                else:
                    logger.warning("LLM parse: no JSON found in: %s", content[:200])
                return None
        except httpx.ConnectError as e:
            logger.warning("LLM parsing connection error: %s", e)
            return None
        except json.JSONDecodeError as e:
            logger.warning("LLM parsing JSON decode error: %s", e)
            return None
        except Exception as e:
            logger.warning("LLM parsing error: %s", e, exc_info=True)
            return None

    def _validate_parsed(self, schema: dict, parsed: dict) -> bool:
        """Basic validation of parsed JSON against schema."""
        required = schema.get("required", [])
        for field in required:
            if field not in parsed:
                return False
        return True

    # ── Skip logic ────────────────────────────────────────────────────

    def _should_skip(self, question_num: int, answers: dict) -> bool:
        """Check if a question should be skipped based on current answers."""
        question = self._get_question(question_num)
        if question and "skip_if" in question:
            skip_fn = question["skip_if"]
            try:
                return skip_fn(answers)
            except Exception:
                return False
        return False

    def _get_question(self, question_num: int) -> dict | None:
        return next((q for q in QUESTIONS if q["num"] == question_num), None)

    def _get_next_question(self, current: int, answers: dict) -> int | None:
        """Return the next non-skipped question number, or None if all done."""
        next_num = current + 1
        while next_num <= 15:
            if not self._should_skip(next_num, answers):
                return next_num
            next_num += 1
        return None

    # ── Phase 2 — AB Configuration ────────────────────────────────────

    async def _phase2_configure(self, user_id: str, answers: dict) -> list[str]:
        """
        Run Phase 2 — create accounts, categories, budgets, and schedules in AB.
        Returns a list of status messages to stream to the user.
        """
        from backend.core.actual_client.client import ActualBudgetClient

        actual = ActualBudgetClient(
            url=settings.actual.url,
            password=settings.actual.password,
            sync_id=settings.actual.sync_id,
        )

        messages: list[str] = []
        messages.append("🔄 **Phase 2: Setting up your budget in Actual Budget...**\n")

        # Step 1: Create accounts
        accounts = answers.get("accounts", [])
        if accounts:
            messages.append(f"\n**Creating {len(accounts)} account(s)...**")
            for acc in accounts:
                try:
                    created = await actual.create_account(
                        name=acc["name"],
                        initial_balance=acc["balance"],
                        off_budget=acc.get("off_budget", False),
                    )
                    # Store the created account ID for later use
                    acc["_id"] = created.id
                    messages.append(f"  ✅ Account '{acc['name']}' created (€{acc['balance']:,.2f})")
                except Exception as e:
                    messages.append(f"  ❌ Could not create account '{acc['name']}': {e}")

        # Step 2: Create category groups and categories
        messages.append(f"\n**Creating budget categories...**")
        groups = _get_category_groups(answers)
        created_categories: dict[str, str] = {}  # name -> id

        for group_name, cat_names in groups.items():
            try:
                group_id = await actual.create_category_group(group_name)
                messages.append(f"  📁 Category group '{group_name}' created")
                for cat_name in cat_names:
                    try:
                        cat = await actual.create_category(cat_name, group_name)
                        created_categories[cat_name] = cat.id
                        messages.append(f"    - {cat_name}")
                    except Exception as e:
                        messages.append(f"    ❌ Could not create category '{cat_name}': {e}")
            except Exception as e:
                messages.append(f"  ❌ Could not create group '{group_name}': {e}")

        # Step 3: Monthly budget allocations
        messages.append(f"\n**Setting up monthly budget allocations...**")
        allocations = _compute_budget_allocations(answers, groups)
        if allocations:
            from datetime import date
            today = date.today()
            target_month = today.replace(day=1)

            for cat_name, amount in allocations.items():
                if amount <= 0:
                    continue
                try:
                    await actual.set_budget_amount(cat_name, amount, target_month)
                    messages.append(f"  💰 {cat_name}: €{amount:,.2f}")
                except Exception as e:
                    messages.append(f"  ❌ Could not set budget for '{cat_name}': {e}")

        # Step 4: Schedules
        schedules = answers.get("schedules", [])
        if schedules:
            messages.append(f"\n**Creating {len(schedules)} recurring schedule(s)...**")
            # Get first account ID for schedules
            first_account_id = None
            for acc in accounts:
                if acc.get("_id"):
                    first_account_id = acc["_id"]
                    break

            if first_account_id:
                for sched in schedules:
                    try:
                        await actual.create_schedule(
                            name=sched["name"],
                            amount=sched["amount"],
                            day_of_month=sched["day_of_month"],
                            account_id=first_account_id,
                            is_income=(sched.get("type") == "income"),
                        )
                        messages.append(f"  📅 {sched['name']}: €{sched['amount']:,.2f} on day {sched['day_of_month']}")
                    except Exception as e:
                        messages.append(f"  ❌ Could not create schedule '{sched['name']}': {e}")

        # Note about loans (Q10) — out of scope for schedule creation
        loans = answers.get("loans", [])
        if loans:
            messages.append(f"\n📝 **Note:** {len(loans)} loan(s) recorded but schedule creation for loans is not yet implemented (TODO).")

        # Final summary
        num_accounts = len(accounts)
        num_groups = len(groups)
        num_cats = len(created_categories)
        num_schedules = len(schedules)

        messages.append(f"""
---

**✅ Setup complete!**
- {num_accounts} account(s) created
- {num_groups} category group(s), {num_cats} categories
- Budget allocated for {today.strftime('%B %Y')}
- {num_schedules} recurring schedule(s) set up

You can now start using Majordom. Try: *"How am I doing this month?"*
""")

        return messages

    # ── Main entry point ──────────────────────────────────────────────

    async def process_message(self, user_id: str, text: str) -> dict:
        """
        Process a user message during onboarding.

        Returns a dict with:
            type: "question" | "complete" | "cancelled" | "parse_error"
            question_num?: int
            total?: int
            text?: str
            summary?: str
        """
        # Normalize
        text_lower = text.lower().strip()

        # Check for cancel
        if text_lower in {"stop", "cancel", "exit", "quit"}:
            self.clear_state(user_id)
            return {
                "type": "cancelled",
                "text": "Onboarding cancelled. You can restart anytime by saying 'set up my budget'.",
            }

        # Load state
        state = self.get_state(user_id)
        if not state:
            return {"type": "error", "text": "No active onboarding session. Start fresh with 'set up my budget'."}

        current_question_num = state["current_question"]
        answers = state.get("answers", {})
        phase = state.get("phase", 1)

        if phase == 1:
            # ── Phase 1: Discovery ──
            question = self._get_question(current_question_num)
            if not question:
                return {"type": "error", "text": "Unknown question. Please restart onboarding."}

            # Parse the user's answer via LLM
            parsed = await self._parse_with_llm(question, text)
            if parsed is None:
                return {
                    "type": "parse_error",
                    "text": (
                        "I couldn't quite understand that. Could you please rephrase?\n\n"
                        f"_{question['text']}_"
                    ),
                    "question_num": current_question_num,
                    "total": 15,
                }

            # Store the answer
            # For simple key/value, store directly. For complex (list), handle specially
            key = question["key"]
            if key in parsed:
                answers[key] = parsed[key]
            else:
                # If the key is a top-level key but parsed has sub-keys, store them all
                answers[key] = parsed.get(key)
                # Also store any extra fields from the parse
                for k, v in parsed.items():
                    if k not in ("skip_if", "parse_prompt"):
                        answers[k] = v

            # Also copy any sibling fields (like income_minimum, partner_income)
            for k, v in parsed.items():
                if k != key:
                    answers[k] = v

            # Determine next question
            next_num = self._get_next_question(current_question_num, answers)

            if next_num is None:
                # All questions done — transition to Phase 2
                state["current_question"] = 15
                state["answers"] = answers
                state["phase"] = 2
                self._save_state(user_id, state)

                # Run Phase 2
                config_messages = await self._phase2_configure(user_id, answers)

                # Mark as completed
                state["completed_at"] = "now"  # will be set by SQLite
                self.clear_state(user_id)

                summary = "\n".join(config_messages)
                return {
                    "type": "complete",
                    "summary": summary,
                }
            else:
                # Advance to next question
                state["current_question"] = next_num
                state["answers"] = answers
                self._save_state(user_id, state)

                next_q = self._get_question(next_num)
                return {
                    "type": "question",
                    "question_num": next_num,
                    "total": 15,
                    "text": next_q["text"],
                    "options": next_q.get("options"),
                }

        elif phase == 2:
            # Phase 2 already triggered — run it
            config_messages = await self._phase2_configure(user_id, answers)
            state["completed_at"] = "now"
            self.clear_state(user_id)

            summary = "\n".join(config_messages)
            return {
                "type": "complete",
                "summary": summary,
            }

        return {"type": "error", "text": "Unexpected state. Please restart onboarding."}

    async def get_first_question(self, user_id: str = "default") -> dict:
        """Initialize a new onboarding session and return the first question."""
        state = self.create_new_state(user_id)
        first_q = self._get_question(1)
        return {
            "type": "question",
            "question_num": 1,
            "total": 15,
            "text": first_q["text"],
            "options": first_q.get("options"),
        }
