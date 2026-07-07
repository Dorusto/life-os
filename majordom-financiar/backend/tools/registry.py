"""
Tool registry — defines tools exposed to the LLM and dispatches their execution.

TOOLS: list of tool definitions in Ollama/OpenAI format.
       Passed directly in the Ollama API request body as \`tools: TOOLS\`.

execute_tool(): called by the chat endpoint when the LLM returns tool_calls.
"""
from typing import Any


TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "finance__get_accounts",
            "description": "Get all bank accounts with their current balances. Call this when the user asks about account balances or when you need account IDs to propose a transfer.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_monthly_stats",
            "description": "Get total spending for a month broken down by category. Call this when the user asks how much they spent, what their biggest expenses were, or wants a spending summary.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "description": "Month number 1-12. Omit for current month."},
                    "year": {"type": "integer", "description": "Year e.g. 2026. Omit for current year."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_budget_status",
            "description": "Get budget vs actual spending per category for a month. Call this when the user asks about their budget, how much is left in a category, or whether they are over budget.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "description": "Month number 1-12. Omit for current month."},
                    "year": {"type": "integer", "description": "Year e.g. 2026. Omit for current year."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_transactions",
            "description": "Get recent transactions, optionally filtered by category or account. Call this when the user asks to see their transactions or spending in a specific category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Filter by category name, e.g. 'Groceries'."},
                    "account": {"type": "string", "description": "Filter by account name, e.g. 'ING'."},
                    "limit": {"type": "integer", "description": "Max number of transactions to return (default 20)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_spending_history",
            "description": "Get monthly spending totals for the last N months. Call this when the user asks about spending trends or wants to compare months.",
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {"type": "integer", "description": "Number of months to look back (default 3)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_spending_chart",
            "description": "Show a visual spending chart for a month broken down by category. Call this when the user asks to see a chart, graph, or visual breakdown of their spending.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "description": "Month number 1-12. Omit for current month."},
                    "year": {"type": "integer", "description": "Year e.g. 2026. Omit for current year."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_budget_chart",
            "description": "Show a visual chart comparing budget vs actual spending per category. Call when user asks to see budget performance, how they're tracking against budget, or wants a budget overview chart.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "description": "Month number 1-12. Omit for current month."},
                    "year": {"type": "integer", "description": "Year e.g. 2026. Omit for current year."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_spending_trend",
            "description": "Show a multi-month spending and income trend chart. Call when user asks about spending trends, how their spending changed over months, or wants to see income vs expenses over time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {"type": "integer", "description": "Number of months to show (default 6, max 12). Ignored if start/end are given."},
                    "start_month": {"type": "integer", "description": "Custom range start month (1-12). Provide together with start_year/end_month/end_year."},
                    "start_year": {"type": "integer", "description": "Custom range start year, e.g. 2025."},
                    "end_month": {"type": "integer", "description": "Custom range end month (1-12), inclusive."},
                    "end_year": {"type": "integer", "description": "Custom range end year, e.g. 2026."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_goals_chart",
            "description": "Show a visual progress chart for all savings goals. Call when user asks about savings goals, goal progress, or how close they are to their financial targets.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_fire_chart",
            "description": "Show FIRE (Financial Independence, Retire Early) progress: current portfolio, target, percentage complete, and projected year to reach it. Call when the user asks about FIRE progress, retirement projections, financial independence, or the crossover point.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "system__set_notification_time",

            "description": (
                "Change the time of the daily financial summary notification. "
                "Use when the user asks to change, update, or set the notification time, "
                "e.g. 'change notification to 21:30', 'set daily message at 8am'. "
                "Executes immediately — no confirmation needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "time": {
                        "type": "string",
                        "description": "New notification time in HH:MM 24h format, e.g. '21:30', '08:00'.",
                    },
                },
                "required": ["time"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_transaction",
            "description": (
                "Propose adding a new transaction (expense OR income) to Actual Budget. "
                "Call this whenever the user mentions spending money, paying for something, "
                "receiving money, getting paid, salary, refund, cashback, or any financial transaction. "
                "Set is_expense=false for income (salary, received money). "
                "The user will confirm before it is saved — call this immediately, do not ask questions first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "payee": {
                        "type": "string",
                        "description": "The payee name — store, company, or person who paid or received money. e.g. 'Lidl', 'Shell', 'Salariu'",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Amount in EUR, always positive, e.g. 47.50",
                    },
                    "date": {
                        "type": "string",
                        "description": "Transaction date YYYY-MM-DD. Use today's date if not mentioned.",
                    },
                    "category_name": {
                        "type": "string",
                        "description": "Category name from the available categories list.",
                    },
                    "account_id": {
                        "type": "string",
                        "description": "Account ID from the available accounts list.",
                    },
                    "account_name": {
                        "type": "string",
                        "description": "Account name matching the account_id (for display).",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Any meaningful context from the user's message, e.g. 'photo services', 'electricity bill', 'birthday gift'. Leave empty for simple transactions like 'spent X at Lidl'.",
                    },
                    "is_expense": {
                        "type": "boolean",
                        "description": "True for expenses (default), False for income (money received).",
                    },
                },
                "required": ["payee", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_budget_rebalance",
            "description": (
                "Propose moving budget money from one category to another. "
                "Use this when the user wants to rebalance their budget — for example: "
                "'I overspent on Restaurants, move €50 from Personal', or "
                "'decrease Personal budget by fifty and add it to Restaurants'. "
                "The user will see a confirmation card before any change is made."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "source_category": {
                        "type": "string",
                        "description": "Category to take money FROM (must match an existing category name).",
                    },
                    "destination_category": {
                        "type": "string",
                        "description": "Category to add money TO (must match an existing category name).",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Amount in EUR to move between categories, always positive.",
                    },
                    "month": {
                        "type": "string",
                        "description": "Month to rebalance in YYYY-MM format. Omit for the current month.",
                    },
                },
                "required": ["source_category", "destination_category", "amount"],
            },
        },
    },
    # finance__propose_clarification disabled — llama3.1:8b abuses it for informational questions.
    # Re-enable when tested with a model that uses it correctly.
    {
        "type": "function",
        "function": {
            "name": "finance__propose_account_transfer",
            "description": (
                "Propose a transfer between two bank accounts in Actual Budget. "
                "Use when the user says they moved or transferred money between their own accounts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "from_account_id": {
                        "type": "string",
                        "description": "Source account ID to transfer money FROM.",
                    },
                    "to_account_id": {
                        "type": "string",
                        "description": "Destination account ID to transfer money TO.",
                    },
                    "amount": {
                        "type": "number",
                        "description": "Amount in EUR to transfer, always positive.",
                    },
                    "date": {
                        "type": "string",
                        "description": "Transfer date YYYY-MM-DD.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes about the transfer.",
                    },
                },
                "required": ["from_account_id", "to_account_id", "amount", "date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__set_account_goal",
            "description": (
                "Propose setting or updating a savings goal for an account. "
                "Use when the user says they want to save a target amount in an account, "
                "e.g. 'set goal for ING Savings to €25,000' or 'I want to save €10k in Revolut by 2030'. "
                "Returns a confirmation card — nothing is written until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account_name": {
                        "type": "string",
                        "description": "Exact account name as shown in the accounts list, e.g. 'ING savings'.",
                    },
                    "target": {
                        "type": "number",
                        "description": "Target amount in EUR, always positive, e.g. 25000.",
                    },
                    "deadline": {
                        "type": "string",
                        "description": "Optional deadline in YYYY-MM format, e.g. '2031-05'. Derive from user's stated timeframe.",
                    },
                    "note": {
                        "type": "string",
                        "description": "Optional short free-text purpose for the goal, e.g. 'trip to Scandinavia' or 'replace the car in ~5 years'. Shown in the goal card's info popup.",
                    },
                },
                "required": ["account_name", "target"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__list_categories",
            "description": (
                "Show all existing category groups and their subcategories as an editable card. "
                "Use when the user asks to see, manage, organize, or set up categories or groups "
                "(e.g. 'show me my categories', 'arată-mi categoriile', 'I want to configure categories')."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__create_category",
            "description": (
                "Propose creating a new category inside an existing group. "
                "Use when the user says 'create category X in group Y', 'add category X to group Y', "
                "'create subcategory X under Y'. "
                "Groups are the top-level buckets (e.g. Housing, Savings, Food). "
                "Categories are the items inside groups."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name for the new category.",
                    },
                    "group_name": {
                        "type": "string",
                        "description": "Name of the group to create the category in.",
                    },
                },
                "required": ["name", "group_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__delete_category",
            "description": (
                "Permanently delete a budget category. "
                "Use ONLY when the user explicitly says 'delete', 'remove', or 'get rid of' a category. "
                "Executes immediately — no confirmation needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the category to delete.",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_set_category_budget",
            "description": "Set the budgeted amount for a specific category in a given month. Use this when the user wants to assign a specific euro amount to a category budget (e.g. 'set Groceries to €300', 'put €50 in Transport for June'). Different from finance__propose_budget_rebalance which moves money between two categories.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {"type": "string", "description": "The budget category name to set the amount for."},
                    "amount": {"type": "number", "description": "The new budget amount in EUR (e.g. 300.0 for €300)."},
                    "month": {"type": "string", "description": "Month in YYYY-MM format. Omit for current month."},
                },
                "required": ["category_name", "amount"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_set_budget_carryover",
            "description": (
                "Propose enabling or disabling 'Rollover Overspending' for a category — the same "
                "toggle available in the Actual Budget UI by clicking a category's Balance. When "
                "enabled, a negative balance (overspending) carries over and reduces next month's "
                "available budget for that category, instead of resetting to zero. Use when the "
                "user asks to 'enable rollover on X', 'turn on overspending carryover for X', or "
                "similar. A confirmation card appears — nothing is written until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {"type": "string", "description": "The budget category name."},
                    "enabled": {"type": "boolean", "description": "True to enable rollover, false to disable."},
                    "month": {"type": "string", "description": "Month in YYYY-MM format. Omit for current month."},
                },
                "required": ["category_name", "enabled"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_set_fire_model",
            "description": "Update FIRE/retirement planning assumptions (return rates, horizon, contribution, desired retirement spend). All parameters optional — pass only what the user mentioned. Shows a confirmation card with all current assumptions before writing anything.",
            "parameters": {
                "type": "object",
                "properties": {
                    "years_to_transition": {
                        "type": "number",
                        "description": "Years until retirement / financial independence (accumulation phase).",
                    },
                    "years_in_retirement": {
                        "type": "number",
                        "description": "Expected years in retirement (decumulation phase).",
                    },
                    "monthly_contribution": {
                        "type": "number",
                        "description": "Monthly contribution to investment portfolio in EUR.",
                    },
                    "accumulation_return": {
                        "type": "number",
                        "description": "Expected annual return during accumulation phase, as a decimal (e.g. 8% = 0.08).",
                    },
                    "decumulation_return": {
                        "type": "number",
                        "description": "Expected annual return during decumulation/retirement phase, as a decimal (e.g. 6% = 0.06).",
                    },
                    "desired_monthly_spend": {
                        "type": "number",
                        "description": "Desired monthly spending in retirement in EUR.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_bank_resync",
            "description": (
                "Propose triggering a live bank re-sync for an account that has a real bank "
                "connection (not a manual/CSV account) — pulls fresh transactions from the bank. "
                "Use when the user asks to 'resync X', 're-sync my bank', 'refresh X account', or "
                "similar. A confirmation card appears — nothing syncs until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "account_name": {"type": "string", "description": "The bank-linked account name to resync."},
                },
                "required": ["account_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__sync_accounts",
            "description": (
                "Immediately re-sync every bank-linked account (no confirmation card — same "
                "action as the Home screen's header sync icon). Use for 'sync my accounts', "
                "'refresh everything', or similar general refresh requests. For resyncing one "
                "specific named account instead, use finance__propose_bank_resync."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_budget_copy",
            "description": (
                "Propose copying last month's budget amounts into a target month (default: "
                "current month). Use when the user asks to 'copy last month's budget', 'set up "
                "this month's budget the same as last month', or similar — this replicates what "
                "'Copy last month's budget' would do in the Actual Budget UI, without the user "
                "ever opening it. Returns a card listing every expense category with an editable "
                "amount, pre-filled from last month — nothing is written until the user confirms. "
                "Goal-template categories (annual/one-off funds) are automatically excluded from "
                "the copy, shown separately on the card."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type": "string",
                        "description": "Target month in YYYY-MM format. Omit for current month.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_budget_overview",
            "description": (
                "Show the full editable budget table for a month (default: current) — every "
                "expense category grouped, with Budgeted (editable), Spent, Balance, and Rollover "
                "overspending toggle. Use when the user asks to see, manage, or edit their budget "
                "(e.g. 'show me my budget', 'let me edit my budget', 'arata-mi bugetul') — not for "
                "checking status/progress on an existing budget, use finance__get_budget_status for that."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {
                        "type": "string",
                        "description": "Target month in YYYY-MM format. Omit for current month.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__rename_category",
            "description": (
                "Rename an existing budget category. "
                "Use when the user says 'rename category X to Y', 'change the name of X', 'call X something else'. "
                "Executes immediately — no confirmation needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "old_name": {
                        "type": "string",
                        "description": "Current name of the category to rename.",
                    },
                    "new_name": {
                        "type": "string",
                        "description": "New name for the category, exactly as the user specified.",
                    },
                },
                "required": ["old_name", "new_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_balance_adjustment",
            "description": "Propose adjusting an account balance to match the real bank balance. Use when the user says the account balance is wrong, or wants to sync/reconcile an account balance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_name": {
                        "type": "string",
                        "description": "The name of the account to adjust, e.g. 'ING' or 'Revolut'.",
                    },
                    "real_balance": {
                        "type": "number",
                        "description": "The correct real-world balance in EUR.",
                    },
                },
                "required": ["account_name", "real_balance"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_close_account",
            "description": "Propose closing an Actual Budget account. This is a DESTRUCTIVE action requiring user confirmation via a card. Use when the user asks to close, remove, or archive an account.",
            "parameters": {
                "type": "object",
                "properties": {
                    "account_name": {
                        "type": "string",
                        "description": "The name of the account to close, e.g. 'ING savings' or 'Revolut'.",
                    },
                },
                "required": ["account_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__get_vehicle_stats",
            "description": (
                "Get full vehicle profile and operational statistics: plate number, make, model, year, "
                "fuel type, APK/insurance due dates, service interval, fuel consumption, cost per km. "
                "Use when the user asks about ANY vehicle info — plate number, registration, profile, "
                "stats, average consumption, spending on fuel or maintenance, or a vehicle summary. "
                "If the user instead wants a visual chart, graph, or trend of consumption over time "
                "(e.g. 'grafic de consum', 'consumption chart'), use vehicle__get_vehicle_consumption_chart instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'kia', 'suzuki'. Leave empty if user has one vehicle.",
                    },
                    "period": {
                        "type": "string",
                        "description": "Time period: 'YYYY-MM' for a specific month, 'YYYY' for a year, or empty for all time.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__get_vehicle_consumption_chart",
            "description": (
                "Show a visual line chart of fuel consumption (L/100km) trend over time, one point per fill-up. "
                "Call this — not vehicle__get_vehicle_stats — whenever the user explicitly asks for a chart, "
                "graph, or visual/'grafic' of consumption, or how their fuel efficiency has changed over recent fill-ups. "
                "Only use vehicle__get_vehicle_stats if the user wants a single-number summary instead of a visual trend."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'kia', 'suzuki'. Leave empty if user has one vehicle.",
                    },
                    "months": {
                        "type": "integer",
                        "description": (
                            "How far back to plot, in months (default 12 = last year). "
                            "Use 60 for 'last 5 years', 24 for 'last 2 years', 0 for all time. "
                            "Measured back from the vehicle's most recent fill-up. Ignored if "
                            "start_date/end_date are given."
                        ),
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Custom range start, YYYY-MM-DD. Provide together with end_date, e.g. for 'from September to December 2023'.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Custom range end, YYYY-MM-DD. Provide together with start_date.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__get_vehicle_distance_chart",
            "description": (
                "Show a visual line chart of distance driven (km) between fill-ups over time. "
                "Call this when the user asks for a chart/graph of distance, km driven, or "
                "'grafic de km parcurși' — NOT vehicle__get_vehicle_consumption_chart, which "
                "plots L/100km efficiency instead of raw distance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'kia', 'suzuki'. Leave empty if user has one vehicle.",
                    },
                    "months": {
                        "type": "integer",
                        "description": (
                            "How far back to plot, in months (default 12 = last year). "
                            "Use 60 for 'last 5 years', 24 for 'last 2 years', 0 for all time. "
                            "Measured back from the vehicle's most recent fill-up. Ignored if "
                            "start_date/end_date are given."
                        ),
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Custom range start, YYYY-MM-DD. Provide together with end_date, e.g. for 'from September to December 2023'.",
                    },
                    "end_date": {
                        "type": "string",
                        "description": "Custom range end, YYYY-MM-DD. Provide together with start_date.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__log_refuel",
            "description": (
                "Log a vehicle refuel when the user mentions filling up with fuel. "
                "Use when user says: 'filled up', 'tanked', 'put fuel', 'alimentat', 'getankt'. "
                "A confirmation card appears — nothing is saved until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "liters": {"type": "number", "description": "Liters added, e.g. 40.5"},
                    "total_eur": {"type": "number", "description": "Total paid in EUR, e.g. 72.50"},
                    "vehicle_name": {"type": "string", "description": "Vehicle name if mentioned, e.g. 'cora', 'wabi sabi'"},
                    "odo_km": {"type": "number", "description": "Odometer in km if mentioned"},
                    "location": {"type": "string", "description": "Station name or city if mentioned"},
                    "full_tank": {"type": "boolean", "description": "True if filled to full (default), False if partial"},
                },
                "required": ["liters", "total_eur"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__set_service_interval",
            "description": (
                "Set or update the service interval for a vehicle. "
                "Use when the user says their car needs service every N km or every N months, "
                "or mentions the last service date/odometer. "
                "A confirmation card appears — nothing is saved until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name.",
                    },
                    "interval_km": {
                        "type": "integer",
                        "description": "Service interval in km, e.g. 15000.",
                    },
                    "interval_months": {
                        "type": "integer",
                        "description": "Service interval in months, e.g. 12.",
                    },
                    "last_service_km": {
                        "type": "number",
                        "description": "Odometer reading at last service.",
                    },
                    "last_service_date": {
                        "type": "string",
                        "description": "Date of last service in YYYY-MM-DD format.",
                    },
                },
                "required": ["vehicle_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__set_vehicle_reminder",
            "description": (
                "Set an APK/ITP or insurance expiry date on a vehicle. "
                "Use when the user mentions when their APK, ITP, MOT, or car insurance expires. "
                "A confirmation card appears — nothing is saved until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'cora', 'wabi sabi'.",
                    },
                    "reminder_type": {
                        "type": "string",
                        "enum": ["apk", "insurance"],
                        "description": "'apk' for APK/ITP/MOT inspection, 'insurance' for car insurance.",
                    },
                    "due_date": {
                        "type": "string",
                        "description": "Expiry date in ISO format YYYY-MM-DD. If user says 'June 2026', use 2026-06-01.",
                    },
                },
                "required": ["vehicle_name", "reminder_type", "due_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__set_vehicle_apk_required",
            "description": (
                "Mark whether a vehicle needs an APK/ITP/MOT inspection at all. "
                "Use when the user says APK/ITP/MOT doesn't apply to a vehicle "
                "(e.g. some motorcycles are exempt), or reverses that. "
                "A confirmation card appears — nothing is saved until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'wabi sabi'.",
                    },
                    "required": {
                        "type": "boolean",
                        "description": "false if APK/ITP/MOT does not apply to this vehicle, true to reverse that.",
                    },
                },
                "required": ["vehicle_name", "required"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__get_vehicle_log",
            "description": (
                "Return the last N refuel entries for a vehicle from the vehicle log. "
                "Use when the user asks to see their refuel history or recent fill-ups. "
                "Each entry shows date, odometer, liters, cost, location, and an ID for reference — the ID is only "
                "for referencing an entry if the user separately decides to delete one via vehicle__delete_vehicle_log_entry. "
                "Do not default to suggesting deletion after showing the list — most of the time the user is just "
                "reviewing history or investigating consumption. If they seem interested in consumption/efficiency, "
                "offer vehicle__get_vehicle_stats instead."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'cora', 'wabi sabi'. Leave empty if user has one vehicle.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of entries to return (default 10, max 50).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__delete_vehicle_log_entry",
            "description": (
                "Propose deleting a vehicle log entry by its ID. "
                "Use when the user asks to remove or delete a specific refuel entry. "
                "A confirmation card appears — nothing is deleted until the user confirms. "
                "Use vehicle__get_vehicle_log first to find the entry ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entry_id": {
                        "type": "integer",
                        "description": "The numeric ID of the vehicle log entry to delete (shown as 'ID #N' in vehicle__get_vehicle_log output).",
                    },
                },
                "required": ["entry_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__set_vehicle_type",
            "description": (
                "Set the type of a vehicle: 'car', 'motorcycle', or 'other'. "
                "Use when the user says a vehicle is a motorcycle or corrects the vehicle type."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Exact vehicle name, e.g. 'Wabi Sabi'.",
                    },
                    "vehicle_type": {
                        "type": "string",
                        "enum": ["car", "motorcycle", "other"],
                        "description": "Type of vehicle.",
                    },
                },
                "required": ["vehicle_name", "vehicle_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__list_vehicles",
            "description": (
                "List every vehicle, active and inactive (sold/retired), with make/model/year. "
                "Use when the user asks what vehicles they have, or before offering to mark one as sold."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vehicle__propose_set_vehicle_active",
            "description": (
                "Propose marking a vehicle as active or inactive, e.g. after it's sold. "
                "A confirmation card appears — nothing changes until the user confirms. "
                "Use vehicle__list_vehicles first if unsure of the exact name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_name": {
                        "type": "string",
                        "description": "Vehicle name or partial name, e.g. 'kia'.",
                    },
                    "active": {
                        "type": "boolean",
                        "description": "true to mark active, false to mark inactive (sold/retired).",
                    },
                },
                "required": ["vehicle_name", "active"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_uncategorized_groups",
            "description": (
                "Get all uncategorized transactions grouped by payee with suggested categories. "
                "Use when the user wants to review or categorize uncategorized transactions. "
                "Each group shows payee name, count, suggested category, and consistency info."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__get_transactions_by_tag",
            "description": (
                "Get all transactions containing a #tag in their notes, with an income/cost/net "
                "breakdown. Use for per-order or per-job costing when income and cost transactions "
                "share a tag (e.g. '#C002-GVoros' linking a YouTube payment or Printful order's "
                "income to its associated cost) — answer with net profit directly, no separate "
                "calculation needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "tag": {
                        "type": "string",
                        "description": "The tag to search for, with or without the leading '#', e.g. 'C002-GVoros'.",
                    },
                },
                "required": ["tag"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finance__propose_categorize_with_rule",
            "description": (
                "Propose bulk-categorizing all uncategorized transactions for a payee, with an "
                "optional AB rule for future auto-categorization. This is the only categorization "
                "tool — always use it whenever the user wants to set the category for past "
                "transactions from a merchant (e.g. 'categorize all TLS BV as Public transport'), "
                "whether or not they mention wanting a rule for future imports. "
                "If the user's request is conditional on the transaction's notes/description "
                "(e.g. 'if the notes contain code X, it's Car Costs'), pass that "
                "condition text as notes_contains — otherwise ALL uncategorized transactions for "
                "the payee get categorized, ignoring the condition, which can silently miscategorize "
                "transactions that don't match. "
                "A confirmation card appears showing payee, count, category, a preview of the "
                "actual affected transactions, and a rule checkbox the user can toggle — nothing "
                "is written until the user confirms."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "payee": {
                        "type": "string",
                        "description": "Payee name or partial name to match (case-insensitive), e.g. 'TLS BV'.",
                    },
                    "category_name": {
                        "type": "string",
                        "description": "Target category name, e.g. 'Public transport'.",
                    },
                    "notes_contains": {
                        "type": "string",
                        "description": (
                            "Optional: only categorize transactions whose notes/description "
                            "contain this text (case-insensitive), e.g. a bank description code. "
                            "Use whenever the user's instruction is conditional on notes content, "
                            "not just payee."
                        ),
                    },
                },
                "required": ["payee", "category_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "system__get_backup_status",
            "description": (
                "Report on the daily backup archives (date of the latest one, its size, how many are "
                "kept). Use when the user asks whether backups are running, when the last backup was, "
                "or wants reassurance their data is safe. Read-only — never triggers or deletes a backup."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    if name == "finance__get_accounts":
        from backend.tools.finance.actual_budget import get_accounts
        return await get_accounts()

    if name == "finance__get_monthly_stats":
        from backend.tools.finance.actual_budget import get_monthly_stats
        return await get_monthly_stats(**arguments)

    if name == "finance__get_budget_status":
        from backend.tools.finance.actual_budget import get_budget_status
        return await get_budget_status(**arguments)

    if name == "finance__get_transactions":
        from backend.tools.finance.actual_budget import get_transactions
        return await get_transactions(**arguments)

    if name == "finance__get_spending_history":
        from backend.tools.finance.actual_budget import get_spending_history
        return await get_spending_history(**arguments)

    if name == "finance__get_spending_chart":
        from backend.tools.finance.actual_budget import get_spending_chart
        return await get_spending_chart(**arguments)

    if name == "finance__get_budget_chart":
        from backend.tools.finance.actual_budget import get_budget_chart
        return await get_budget_chart(**arguments)

    if name == "finance__get_spending_trend":
        from backend.tools.finance.actual_budget import get_spending_trend
        return await get_spending_trend(**arguments)

    if name == "finance__get_goals_chart":
        from backend.tools.finance.actual_budget import get_goals_chart
        return await get_goals_chart()

    if name == "finance__get_fire_chart":
        from backend.tools.finance.actual_budget import get_fire_chart
        return await get_fire_chart()

    if name == "finance__propose_transaction":

        from backend.tools.finance.actual_budget import propose_transaction
        return await propose_transaction(**arguments)

    if name == "finance__propose_budget_rebalance":
        from backend.tools.finance.actual_budget import propose_budget_rebalance
        return await propose_budget_rebalance(**arguments)

    if name == "finance__propose_clarification":
        from backend.tools.finance.actual_budget import propose_clarification
        return await propose_clarification(**arguments)

    if name == "finance__propose_account_transfer":
        from backend.tools.finance.actual_budget import propose_account_transfer
        return await propose_account_transfer(**arguments)

    if name == "finance__propose_balance_adjustment":
        from backend.tools.finance.actual_budget import propose_balance_adjustment
        return await propose_balance_adjustment(**arguments)

    if name == "finance__propose_close_account":
        from backend.tools.finance.actual_budget import propose_close_account
        return await propose_close_account(**arguments)

    if name == "finance__set_account_goal":
        from backend.tools.finance.actual_budget import set_account_goal
        return await set_account_goal(**arguments)

    if name == "finance__list_categories":
        from backend.tools.finance.actual_budget import list_categories
        return await list_categories()

    if name == "finance__create_category":
        from backend.tools.finance.actual_budget import create_category
        return await create_category(**arguments)

    if name == "finance__delete_category":
        from backend.tools.finance.actual_budget import delete_category
        return await delete_category(**arguments)

    if name == "finance__propose_set_category_budget":
        from backend.tools.finance.actual_budget import propose_set_category_budget
        return await propose_set_category_budget(**arguments)

    if name == "finance__propose_budget_copy":
        from backend.tools.finance.actual_budget import propose_budget_copy
        return await propose_budget_copy(**arguments)

    if name == "finance__get_budget_overview":
        from backend.tools.finance.actual_budget import get_budget_overview
        return await get_budget_overview(**arguments)

    if name == "finance__propose_bank_resync":
        from backend.tools.finance.actual_budget import propose_bank_resync
        return await propose_bank_resync(**arguments)

    if name == "finance__sync_accounts":
        from backend.tools.finance.actual_budget import sync_accounts
        return await sync_accounts()

    if name == "finance__propose_set_budget_carryover":
        from backend.tools.finance.actual_budget import propose_set_budget_carryover
        return await propose_set_budget_carryover(**arguments)

    if name == "finance__propose_set_fire_model":
        from backend.tools.finance.actual_budget import propose_set_fire_model
        return await propose_set_fire_model(**arguments)

    if name == "finance__rename_category":
        from backend.tools.finance.actual_budget import rename_category
        return await rename_category(**arguments)

    if name == "system__set_notification_time":
        from backend.tools.settings.notifications import set_notification_time
        return await set_notification_time(**arguments)

    if name == "vehicle__get_vehicle_stats":
        from backend.tools.finance.vehicle import get_vehicle_stats
        return await get_vehicle_stats(**arguments)

    if name == "vehicle__get_vehicle_consumption_chart":
        from backend.tools.finance.vehicle import get_vehicle_consumption_chart
        return await get_vehicle_consumption_chart(**arguments)

    if name == "vehicle__get_vehicle_distance_chart":
        from backend.tools.finance.vehicle import get_vehicle_distance_chart
        return await get_vehicle_distance_chart(**arguments)

    if name == "vehicle__log_refuel":
        from backend.tools.finance.vehicle import log_refuel
        return await log_refuel(**arguments)

    if name == "vehicle__set_vehicle_reminder":
        from backend.tools.finance.vehicle import set_vehicle_reminder
        return await set_vehicle_reminder(**arguments)

    if name == "vehicle__set_service_interval":
        from backend.tools.finance.vehicle import set_service_interval
        return await set_service_interval(**arguments)

    if name == "vehicle__set_vehicle_apk_required":
        from backend.tools.finance.vehicle import set_vehicle_apk_required
        return await set_vehicle_apk_required(**arguments)

    if name == "vehicle__get_vehicle_log":
        from backend.tools.finance.vehicle import get_vehicle_log
        return await get_vehicle_log(**arguments)

    if name == "vehicle__delete_vehicle_log_entry":
        from backend.tools.finance.vehicle import delete_vehicle_log_entry
        return await delete_vehicle_log_entry(**arguments)

    if name == "vehicle__set_vehicle_type":
        from backend.tools.finance.vehicle import set_vehicle_type
        return await set_vehicle_type(**arguments)

    if name == "vehicle__list_vehicles":
        from backend.tools.finance.vehicle import list_vehicles
        return await list_vehicles()

    if name == "vehicle__propose_set_vehicle_active":
        from backend.tools.finance.vehicle import propose_set_vehicle_active
        return await propose_set_vehicle_active(**arguments)

    if name == "finance__get_uncategorized_groups":
        from backend.tools.finance.actual_budget import get_uncategorized_groups
        return await get_uncategorized_groups()

    if name == "finance__get_transactions_by_tag":
        from backend.tools.finance.actual_budget import get_transactions_by_tag
        return await get_transactions_by_tag(**arguments)

    if name == "finance__propose_categorize_with_rule":
        from backend.tools.finance.actual_budget import propose_categorize_with_rule
        return await propose_categorize_with_rule(**arguments)
    if name == "system__get_backup_status":
        from backend.tools.ops import get_backup_status
        return await get_backup_status()
    return f"Unknown tool: {name}"

