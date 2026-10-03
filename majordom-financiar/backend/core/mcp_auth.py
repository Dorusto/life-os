"""
MCP bearer-token authentication — one token per household member.

Each configured token identifies exactly one member, so a proposal created
over MCP records that member as its creator and only they can confirm it.
"""
import hmac

from backend.core.config import settings


def mcp_enabled() -> bool:
    """True when at least one MCP token is configured."""
    return bool(settings.mcp_tokens)


def resolve_member(auth_header: bytes) -> str | None:
    """Return the member name for a valid `Authorization: Bearer <token>`
    header, or None.

    Compares bytes with bytes — hmac.compare_digest raises TypeError on a
    non-ASCII str, which would turn a malformed header into a 500.
    """
    for token, member in settings.mcp_tokens.items():
        expected = b"Bearer " + token.encode()
        if hmac.compare_digest(auth_header, expected):
            return member
    return None
