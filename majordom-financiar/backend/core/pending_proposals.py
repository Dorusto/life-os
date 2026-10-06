"""
Shared server-side store for pending proposals (confirmation cards).

One store, one id, one confirm path — so any door (PWA card, plain HTTP,
MCP tool) can confirm the same proposal. Each entry records who created it;
only that member may confirm or reject.

In memory on purpose: no financial data in SQLite (architecture rule 5).
Losing pending proposals on restart is accepted.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable

from backend.core.actor import get_actor

logger = logging.getLogger(__name__)

PROPOSAL_TTL = timedelta(hours=24)

_proposals: dict[str, dict] = {}
_handlers: dict[str, Callable[[dict, dict, str], Awaitable[dict]]] = {}
_reject_handlers: dict[str, Callable[[dict, str], Awaitable[None]]] = {}


class ProposalNotFound(Exception):
    """No such proposal, or it has expired."""


class ProposalForbidden(Exception):
    """The caller is not the member who created the proposal."""


def _purge_expired() -> None:
    now = datetime.now(timezone.utc)
    expired = [
        pid for pid, p in _proposals.items()
        if now - p["created_at"] > PROPOSAL_TTL
    ]
    for pid in expired:
        _proposals.pop(pid, None)


def create(type: str, payload: dict, created_by: str | None) -> str:
    """Store a new pending proposal and return its id.

    Falls back to the request-scoped actor when created_by is None; every
    door must set one, so a missing actor is a programming error.
    """
    _purge_expired()
    actor = created_by or get_actor()
    if actor is None:
        raise ValueError("proposal has no creator")
    proposal_id = uuid.uuid4().hex[:8]
    _proposals[proposal_id] = {
        "type": type,
        "payload": payload,
        "created_by": actor,
        "created_at": datetime.now(timezone.utc),
    }
    return proposal_id


def get(proposal_id: str) -> dict | None:
    """Return the proposal, or None when missing or expired."""
    _purge_expired()
    return _proposals.get(proposal_id)


def register_handler(
    type: str,
    fn: Callable[[dict, dict, str], Awaitable[dict]],
    on_reject: Callable[[dict, str], Awaitable[None]] | None = None,
) -> None:
    """Register the async confirm handler for a proposal type.

    `on_reject` is an optional async hook run after a proposal of this type is
    discarded — e.g. to dismiss the Inbox finding that created it.
    """
    _handlers[type] = fn
    if on_reject is not None:
        _reject_handlers[type] = on_reject


async def confirm(proposal_id: str, overrides: dict | None, confirmed_by: str) -> dict:
    """Confirm a proposal: run its type's handler, then delete it.

    The proposal survives when the handler reports a possible_match — the
    user must still choose attach/force_new. If the handler raises, the
    proposal is kept so the user can retry.
    """
    proposal = get(proposal_id)
    if proposal is None:
        raise ProposalNotFound(proposal_id)
    if proposal["created_by"] != confirmed_by:
        raise ProposalForbidden(proposal_id)

    handler = _handlers.get(proposal["type"])
    if handler is None:
        raise ValueError(f"No handler registered for proposal type '{proposal['type']}'")

    result = await handler(proposal["payload"], overrides or {}, confirmed_by)

    if not result.get("possible_match"):
        _proposals.pop(proposal_id, None)

    logger.info(
        "Proposal %s (%s) confirmed by %s", proposal_id, proposal["type"], confirmed_by
    )
    return result


async def reject(proposal_id: str, rejected_by: str) -> None:
    """Discard a proposal without executing it.

    Runs the type's optional on_reject hook after the proposal is removed. A
    hook failure is logged, not re-raised — the proposal is already discarded.
    """
    proposal = get(proposal_id)
    if proposal is None:
        raise ProposalNotFound(proposal_id)
    if proposal["created_by"] != rejected_by:
        raise ProposalForbidden(proposal_id)
    _proposals.pop(proposal_id, None)
    logger.info(
        "Proposal %s (%s) rejected by %s", proposal_id, proposal["type"], rejected_by
    )
    on_reject = _reject_handlers.get(proposal["type"])
    if on_reject is not None:
        try:
            await on_reject(proposal["payload"], rejected_by)
        except Exception as e:
            logger.warning(
                "on_reject hook failed for proposal %s (%s): %s",
                proposal_id, proposal["type"], e,
            )
