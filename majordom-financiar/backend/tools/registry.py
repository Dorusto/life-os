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
            "name": "get_accounts",
            "description": "Get all bank accounts with their current balances. Call this when the user asks about account balances or when you need account IDs to propose a transfer.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_monthly_stats",
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
            "name": "get_budget_status",
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
            "name": "get_transactions",
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
            "name": "get_spending_history",
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
            "name": "set_notification_time",
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
            "name": "propose_transaction",
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
            "name": "propose_budget_rebalance",
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
    # propose_clarification disabled — llama3.1:8b abuses it for informational questions.
    # Re-enable when tested with a model that uses it correctly.
    {
        "type": "function",
        "function": {
            "name": "propose_account_transfer",
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
            "name": "set_account_goal",
            "description": (
                "Set or update a savings goal for an account. "
                "Use when the user says they want to save a target amount in an account, "
                "e.g. 'set goal for ING Savings to €25,000' or 'I want to save €10k in Revolut by 2030'. "
                "Executes immediately — no confirmation needed."
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
                },
                "required": ["account_name", "target"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "setup_default_groups",
            "description": (
                "Propose creating the 7 standard category groups (Housing, Daily Living, Transport, Health, Lifestyle, Finance, Unexpected) "
                "with their default subcategories. Skips groups that already exist. "
                "Use when the user asks to set up default categories or standard groups."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_category",
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
            "name": "delete_category",
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
            "name": "propose_set_category_budget",
            "description": "Set the budgeted amount for a specific category in a given month. Use this when the user wants to assign a specific euro amount to a category budget (e.g. 'set Groceries to €300', 'put €50 in Transport for June'). Different from propose_budget_rebalance which moves money between two categories.",
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
            "name": "rename_category",
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
            "name": "propose_balance_adjustment",
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
            "name": "get_vehicle_stats",
            "description": (
                "Get full vehicle profile and operational statistics: plate number, make, model, year, "
                "fuel type, APK/insurance due dates, service interval, fuel consumption, cost per km. "
                "Use when the user asks about ANY vehicle info — plate number, registration, profile, "
                "stats, average consumption, spending on fuel or maintenance, or a vehicle summary."
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
            "name": "log_refuel",
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
            "name": "set_service_interval",
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
            "name": "set_vehicle_reminder",
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
            "name": "get_vehicle_log",
            "description": (
                "Return the last N refuel entries for a vehicle from the vehicle log. "
                "Use when the user asks to see their refuel history, recent fill-ups, or wants to find an entry to delete. "
                "Each entry shows date, odometer, liters, cost, location, and an ID for reference."
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
            "name": "delete_vehicle_log_entry",
            "description": (
                "Propose deleting a vehicle log entry by its ID. "
                "Use when the user asks to remove or delete a specific refuel entry. "
                "A confirmation card appears — nothing is deleted until the user confirms. "
                "Use get_vehicle_log first to find the entry ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entry_id": {
                        "type": "integer",
                        "description": "The numeric ID of the vehicle log entry to delete (shown as 'ID #N' in get_vehicle_log output).",
                    },
                },
                "required": ["entry_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_vehicle_type",
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
            "name": "propose_categorize_by_payee",
            "description": (
                "Propose bulk-categorizing all uncategorized transactions for a specific payee. "
                "Use when the user wants to set the category for all past transactions from a merchant "
                "(e.g. 'categorize all TLS BV as Public transport'). "
                "A confirmation card appears showing how many transactions will be affected — "
                "nothing is written until the user confirms."
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
                },
                "required": ["payee", "category_name"],
            },
        },
    },
]

async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    if name == "get_accounts":
        from backend.tools.finance.actual_budget import get_accounts
        return await get_accounts()

    if name == "get_monthly_stats":
        from backend.tools.finance.actual_budget import get_monthly_stats
        return await get_monthly_stats(**arguments)

    if name == "get_budget_status":
        from backend.tools.finance.actual_budget import get_budget_status
        return await get_budget_status(**arguments)

    if name == "get_transactions":
        from backend.tools.finance.actual_budget import get_transactions
        return await get_transactions(**arguments)

    if name == "get_spending_history":
        from backend.tools.finance.actual_budget import get_spending_history
        return await get_spending_history(**arguments)

    if name == "propose_transaction":
        from backend.tools.finance.actual_budget import propose_transaction
        return await propose_transaction(**arguments)

    if name == "propose_budget_rebalance":
        from backend.tools.finance.actual_budget import propose_budget_rebalance
        return await propose_budget_rebalance(**arguments)

    if name == "propose_clarification":
        from backend.tools.finance.actual_budget import propose_clarification
        return await propose_clarification(**arguments)

    if name == "propose_account_transfer":
        from backend.tools.finance.actual_budget import propose_account_transfer
        return await propose_account_transfer(**arguments)

    if name == "propose_balance_adjustment":
        from backend.tools.finance.actual_budget import propose_balance_adjustment
        return await propose_balance_adjustment(**arguments)

    if name == "set_account_goal":
        from backend.tools.finance.actual_budget import set_account_goal
        return await set_account_goal(**arguments)

    if name == "setup_default_groups":
        from backend.tools.finance.actual_budget import setup_default_groups
        return await setup_default_groups()

    if name == "create_category":
        from backend.tools.finance.actual_budget import create_category
        return await create_category(**arguments)

    if name == "delete_category":
        from backend.tools.finance.actual_budget import delete_category
        return await delete_category(**arguments)

    if name == "propose_set_category_budget":
        from backend.tools.finance.actual_budget import propose_set_category_budget
        return await propose_set_category_budget(**arguments)

    if name == "rename_category":
        from backend.tools.finance.actual_budget import rename_category
        return await rename_category(**arguments)

    if name == "set_notification_time":
        from backend.tools.settings.notifications import set_notification_time
        return await set_notification_time(**arguments)

    if name == "get_vehicle_stats":
        from backend.tools.finance.vehicle import get_vehicle_stats
        return await get_vehicle_stats(**arguments)

    if name == "log_refuel":
        from backend.tools.finance.vehicle import log_refuel
        return await log_refuel(**arguments)

    if name == "set_vehicle_reminder":
        from backend.tools.finance.vehicle import set_vehicle_reminder
        return await set_vehicle_reminder(**arguments)

    if name == "set_service_interval":
        from backend.tools.finance.vehicle import set_service_interval
        return await set_service_interval(**arguments)

    if name == "get_vehicle_log":
        from backend.tools.finance.vehicle import get_vehicle_log
        return await get_vehicle_log(**arguments)

    if name == "delete_vehicle_log_entry":
        from backend.tools.finance.vehicle import delete_vehicle_log_entry
        return await delete_vehicle_log_entry(**arguments)

    if name == "set_vehicle_type":
        from backend.tools.finance.vehicle import set_vehicle_type
        return await set_vehicle_type(**arguments)
    if name == "propose_categorize_by_payee":
        from backend.tools.finance.actual_budget import propose_categorize_by_payee
        return await propose_categorize_by_payee(**arguments)
    return f"Unknown tool: {name}"

