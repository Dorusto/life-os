"""
Request-scoped actor identity.

Who is acting in the current request — a PWA username (set by the chat
endpoint) or an MCP member name (set by the MCP server). Proposal creation
reads this to record a creator, so only that member can later confirm.

A ContextVar, not a global: concurrent requests each get their own value.
"""
from contextvars import ContextVar

current_actor: ContextVar[str | None] = ContextVar("current_actor", default=None)


def set_actor(name: str | None) -> None:
    """Set the acting member for the current request context."""
    current_actor.set(name)


def get_actor() -> str | None:
    """Return the acting member for the current request context, or None."""
    return current_actor.get()
