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
                },
                "required": ["merchant", "amount", "date", "category_name", "account_id"],
            },
        },
    }
]


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    if name == "propose_transaction":
        from backend.tools.finance.actual_budget import propose_transaction
        return await propose_transaction(**arguments)

    return f"Unknown tool: {name}"
