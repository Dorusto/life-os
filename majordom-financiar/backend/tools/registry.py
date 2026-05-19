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
            "name": "propose_transaction",
            "description": (
                "Propose adding a new expense or income to Actual Budget. "
                "Use this when the user says they spent money at a store or received money. "
                "The user will confirm or cancel before it is actually saved."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "merchant": {
                        "type": "string",
                        "description": "Store or merchant name, e.g. 'Lidl', 'Shell', 'Albert Heijn'",
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
                        "description": "Optional notes.",
                    },
                    "is_expense": {
                        "type": "boolean",
                        "description": "True for expenses (default), False for income (money received).",
                    },
                },
                "required": ["merchant", "amount"],
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
]


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
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

    return f"Unknown tool: {name}"
