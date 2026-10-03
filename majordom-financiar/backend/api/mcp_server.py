"""
Read-only MCP server for external agents (#323).

Exposes a curated subset of Majordom's existing tools over the Model Context
Protocol, so external agents (e.g. the user's Hermes agent over Telegram) can
answer money and vehicle questions with exactly the same numbers as the
Majordom chat — instead of re-implementing any logic.

Read-only on purpose: only the "Read, text result" group from
docs/architecture.md#mcp-exposure is exposed. Write tools (proposals, cards,
direct writes) become reachable only after #322 gives proposals a server-side
id any door can confirm.

Tool descriptions and parameter schemas are taken verbatim from
backend/tools/registry.py — never re-described here.
"""
import hmac
import logging

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import JSONResponse

from backend.core.config import settings
from backend.tools import registry
from backend.tools.registry import execute_tool

logger = logging.getLogger(__name__)


# The "Read, text result" group from docs/architecture.md#mcp-exposure.
# Exactly these tools are visible and callable over MCP; everything else is
# invisible and refused.
MCP_READ_TOOLS: frozenset[str] = frozenset({
    "finance__get_accounts",
    "finance__get_monthly_stats",
    "finance__get_budget_status",
    "finance__get_transactions",
    "finance__get_untagged_transactions",
    "finance__get_transactions_by_tag",
    "finance__get_spending_history",
    "finance__get_budget_pacing_status",
    "finance__get_tag_goal_progress",
    "finance__get_unprotected_goals",
    "finance__get_reached_goals",
    "finance__get_recurring_schedules_summary",
    "finance__get_income_classifications",
    "finance__get_expense_coverage",
    "finance__get_reconciliation_suspects",
    "finance__get_uncategorized_groups",
    "vehicle__list_vehicles",
    "vehicle__get_vehicle_stats",
    "vehicle__get_vehicle_log",
    "system__get_backup_status",
})


def _registry_tool_names() -> set[str]:
    # registry.TOOLS entries are nested: t["function"]["name"].
    return {t["function"]["name"] for t in registry.TOOLS}


# Fail loudly at import time if a name drifts out of the registry — never
# silently expose fewer tools than intended.
_missing = MCP_READ_TOOLS - _registry_tool_names()
if _missing:
    raise RuntimeError(
        "MCP_READ_TOOLS references tools missing from registry.TOOLS: "
        + ", ".join(sorted(_missing))
    )


def _build_tool_list() -> list[types.Tool]:
    """Build the MCP tool list from registry.TOOLS, preserving registry order.
    Descriptions and parameter schemas are passed through unchanged."""
    tools: list[types.Tool] = []
    for t in registry.TOOLS:
        fn = t["function"]
        if fn["name"] in MCP_READ_TOOLS:
            tools.append(
                types.Tool(
                    name=fn["name"],
                    description=fn.get("description", ""),
                    inputSchema=fn.get(
                        "parameters", {"type": "object", "properties": {}}
                    ),
                )
            )
    return tools


server = Server("majordom-finance")


@server.list_tools()
async def _list_tools() -> list[types.Tool]:
    return _build_tool_list()


@server.call_tool()
async def _call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name not in MCP_READ_TOOLS:
        raise ValueError(f"Tool not available over MCP (read-only): {name}")
    # Log the tool name only — never arguments or results (financial data).
    logger.info("MCP tool call: %s", name)
    result = await execute_tool(name, arguments or {})
    return [types.TextContent(type="text", text=result)]


session_manager = StreamableHTTPSessionManager(
    app=server,
    stateless=True,
    json_response=True,
)


class _MessageRouterNoiseFilter(logging.Filter):
    """mcp 1.12.4 in stateless JSON mode logs an 'Error in message router'
    traceback (anyio.ClosedResourceError) once per request although the
    response is correct — known upstream bug. Drop only that exact record;
    nothing else is filtered."""

    def filter(self, record: logging.LogRecord) -> bool:
        if record.getMessage() != "Error in message router":
            return True
        exc = record.exc_info[1] if record.exc_info else None
        return not isinstance(exc, anyio.ClosedResourceError)


logging.getLogger("mcp.server.streamable_http").addFilter(_MessageRouterNoiseFilter())


class MCPEndpoint:
    """Raw ASGI endpoint for /api/mcp.

    Registered via app.add_route (not a mount) so the path is exact — a mount
    would redirect /api/mcp -> /api/mcp/.
    """

    async def __call__(self, scope, receive, send) -> None:
        if not settings.mcp_token:
            response = JSONResponse(
                {"detail": "MCP disabled: MCP_TOKEN not set"}, status_code=503
            )
            await response(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"").decode("latin-1")
        expected = f"Bearer {settings.mcp_token}"
        if not hmac.compare_digest(auth, expected):
            response = JSONResponse({"detail": "Unauthorized"}, status_code=401)
            await response(scope, receive, send)
            return

        await session_manager.handle_request(scope, receive, send)
