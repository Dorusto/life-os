"""
MCP server for external agents (#323).

Exposes a curated subset of Majordom's existing tools over the Model Context
Protocol, so external agents (e.g. the user's Hermes agent over Telegram) can
answer money and vehicle questions with exactly the same numbers as the
Majordom chat — instead of re-implementing any logic.

Mostly read-only: the "Read, text result" group from
docs/architecture.md#mcp-exposure is exposed, plus the two proposal
confirm/reject tools. Confirming a server-side proposal is the one write path
— always after the user's explicit yes, and only by the member who created it.

Tool descriptions and parameter schemas are taken verbatim from
backend/tools/registry.py — never re-described here.
"""
import json
import logging

import anyio
import mcp.types as types
from mcp.server.lowlevel import Server
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from starlette.responses import JSONResponse

from backend.core import mcp_auth, pending_proposals
from backend.core.actor import set_actor
from backend.tools import registry
from backend.tools.registry import execute_tool

logger = logging.getLogger(__name__)


# The "Read, text result" group from docs/architecture.md#mcp-exposure, plus
# the proposal tools (#322). Exactly these tools are visible and callable
# over MCP; everything else is invisible and refused.
MCP_TOOLS: frozenset[str] = frozenset({
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
    "finance__suggest_category",
    "vehicle__list_vehicles",
    "vehicle__get_vehicle_stats",
    "vehicle__get_vehicle_log",
    "system__get_backup_status",
    # Write, proposal (#322): these create a proposal only; the write happens on
    # system__confirm_proposal
    "vehicle__log_refuel",
    "finance__propose_transaction",
    "finance__propose_categorize_with_rule",
    "finance__propose_set_category_budget",
    "finance__propose_budget_copy",
    "finance__propose_budget_rebalance",
    "finance__propose_account_transfer",
    "finance__propose_balance_adjustment",
    "finance__propose_set_budget_carryover",
    "finance__propose_set_category_goal",
    "finance__set_account_goal",
    "finance__create_category",
    "finance__rename_category",
    "finance__delete_category",
    "finance__propose_close_account",
    "finance__propose_transfer_conversion",
    "finance__propose_classify_income",
    "finance__propose_set_tag_goal",
    "finance__propose_clear_reached_goals",
    "finance__propose_set_fire_model",
    "finance__propose_tag_transaction",
    "finance__propose_bank_resync",
})


def _registry_tool_names() -> set[str]:
    # registry.TOOLS entries are nested: t["function"]["name"].
    return {t["function"]["name"] for t in registry.TOOLS}


# Fail loudly at import time if a name drifts out of the registry — never
# silently expose fewer tools than intended.
_missing = MCP_TOOLS - _registry_tool_names()
if _missing:
    raise RuntimeError(
        "MCP_TOOLS references tools missing from registry.TOOLS: "
        + ", ".join(sorted(_missing))
    )


# The one write path over MCP: confirming/rejecting a server-side proposal.
# Defined here, not in registry.TOOLS — the PWA chat LLM must never be able to
# confirm its own proposals; the PWA confirms through its card.
MCP_WRITE_TOOLS: frozenset[str] = frozenset({
    "system__confirm_proposal",
    "system__reject_proposal",
})

MCP_CONFIRM_TOOL = types.Tool(
    name="system__confirm_proposal",
    description=(
        "Confirm a pending proposal by id and execute the write. Call ONLY after "
        "the user explicitly said yes to that exact proposal in this conversation. "
        "If the result contains possible_match, show it and ask whether to attach to "
        "that existing transaction (attach_to=<its id>) or create a new one "
        "(force_new=true), then call again."
    ),
    inputSchema={
        "type": "object",
        "properties": {
            "proposal_id": {"type": "string", "description": "The pending proposal's id."},
            "attach_to": {
                "type": "string",
                "description": "financial_id of an existing transaction to attach to instead of creating a new one.",
            },
            "force_new": {
                "type": "boolean",
                "description": "Skip the near-duplicate check and always create a new transaction.",
            },
        },
        "required": ["proposal_id"],
    },
)

MCP_REJECT_TOOL = types.Tool(
    name="system__reject_proposal",
    description="Discard a pending proposal by id. Call when the user says no or wants to change it.",
    inputSchema={
        "type": "object",
        "properties": {
            "proposal_id": {"type": "string", "description": "The pending proposal's id."},
        },
        "required": ["proposal_id"],
    },
)


def _build_tool_list() -> list[types.Tool]:
    """Build the MCP tool list from registry.TOOLS, preserving registry order.
    Descriptions and parameter schemas are passed through unchanged."""
    tools: list[types.Tool] = []
    for t in registry.TOOLS:
        fn = t["function"]
        if fn["name"] in MCP_TOOLS:
            tools.append(
                types.Tool(
                    name=fn["name"],
                    description=fn.get("description", ""),
                    inputSchema=fn.get(
                        "parameters", {"type": "object", "properties": {}}
                    ),
                )
            )
    tools.append(MCP_CONFIRM_TOOL)
    tools.append(MCP_REJECT_TOOL)
    return tools


server = Server("majordom-finance")


@server.list_tools()
async def _list_tools() -> list[types.Tool]:
    return _build_tool_list()


def _current_member() -> str | None:
    """Read the member resolved by MCPEndpoint from the request scope."""
    try:
        request = server.request_context.request
    except LookupError:
        # No request context (e.g. a direct in-process call) — the caller
        # refuses the call rather than falling back to an anonymous actor.
        logger.debug("No MCP request context; cannot identify caller")
        return None
    if request is None:
        return None
    return getattr(request.state, "mcp_member", None)


async def _confirm_proposal(arguments: dict, member: str) -> str:
    proposal_id = arguments.get("proposal_id", "")
    overrides: dict = {}
    if arguments.get("attach_to"):
        overrides["attach_to"] = arguments["attach_to"]
    if arguments.get("force_new") is not None:
        overrides["force_new"] = arguments["force_new"]
    try:
        result = await pending_proposals.confirm(
            proposal_id, overrides=overrides, confirmed_by=member
        )
    except pending_proposals.ProposalNotFound:
        return json.dumps({"error": "Proposal not found or expired"})
    except pending_proposals.ProposalForbidden:
        return json.dumps(
            {"error": "Only the household member who created this proposal can confirm it"}
        )
    except Exception as e:
        logger.warning("MCP confirm_proposal failed for %s: %s", proposal_id, e)
        return json.dumps({"error": str(e)})
    return json.dumps(result)


async def _reject_proposal(arguments: dict, member: str) -> str:
    proposal_id = arguments.get("proposal_id", "")
    try:
        await pending_proposals.reject(proposal_id, rejected_by=member)
    except pending_proposals.ProposalNotFound:
        return json.dumps({"error": "Proposal not found or expired"})
    except pending_proposals.ProposalForbidden:
        return json.dumps(
            {"error": "Only the household member who created this proposal can reject it"}
        )
    except Exception as e:
        logger.warning("MCP reject_proposal failed for %s: %s", proposal_id, e)
        return json.dumps({"error": str(e)})
    return json.dumps({"rejected": True})


@server.call_tool()
async def _call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name not in MCP_TOOLS and name not in MCP_WRITE_TOOLS:
        raise ValueError(f"Tool not available over MCP: {name}")

    member = _current_member()
    if member is None:
        raise ValueError("Unidentified MCP caller")
    set_actor(member)

    # Log the tool name and member only — never arguments or results (financial data).
    logger.info("MCP tool call: %s by %s", name, member)

    if name == "system__confirm_proposal":
        return [types.TextContent(type="text", text=await _confirm_proposal(arguments or {}, member))]
    if name == "system__reject_proposal":
        return [types.TextContent(type="text", text=await _reject_proposal(arguments or {}, member))]

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
        if not mcp_auth.mcp_enabled():
            response = JSONResponse(
                {"detail": "MCP disabled: MCP_TOKENS/MCP_TOKEN not set"}, status_code=503
            )
            await response(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"")
        member = mcp_auth.resolve_member(auth)
        if member is None:
            response = JSONResponse({"detail": "Unauthorized"}, status_code=401)
            await response(scope, receive, send)
            return

        # The transport builds a Starlette Request from this same scope, so
        # _call_tool can read the member back off request.state.
        scope.setdefault("state", {})["mcp_member"] = member
        await session_manager.handle_request(scope, receive, send)
