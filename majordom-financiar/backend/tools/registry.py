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
            "name": "add_transaction",
            "description": (
                "Add a new expense or income to Actual Budget. "
                "Use this when the user says they spent money at a store or received money. "
                "Always confirm the details before calling if any field is ambiguous."
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
                        "description": (
                            "Transaction date in YYYY-MM-DD format. "
                            "Use today's date if the user did not specify one."
                        ),
                    },
                    "category_name": {
                        "type": "string",
                        "description": (
                            "Category name — must match exactly one of the available categories "
                            "listed in the system prompt."
                        ),
                    },
                    "account_id": {
                        "type": "string",
                        "description": (
                            "Account ID — must match exactly one of the available account IDs "
                            "listed in the system prompt."
                        ),
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes about the transaction.",
                    },
                },
                "required": ["merchant", "amount", "date", "category_name", "account_id"],
            },
        },
    }
]


async def execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """
    Dispatch a tool call by name. Returns a human-readable result string
    that is appended to the conversation as a tool message before the
    LLM generates its final reply.
    """
    if name == "add_transaction":
        from backend.tools.finance.actual_budget import add_transaction
        return await add_transaction(**arguments)

    return f"Unknown tool: {name}"
