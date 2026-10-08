"""
CategoryStructureService — the write logic for confirmed category-structure
proposals (category_create, category_rename, category_delete).

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "category_create", "category_rename" and
"category_delete" handlers on the shared pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_category_create(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed category_create proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    create_category stored) when they are not None/empty. The name and group are
    re-validated here — the card is editable, so the tool's checks are not
    enough (CLAUDE.md rule 5).

    Returns {"message": <result text>, "errors": []}.
    """
    cat_name = overrides.get("category_name") or payload["category_name"]
    grp_name = overrides.get("group_name") or payload["group_name"]

    if not cat_name:
        raise ValueError("Category name must not be empty")

    provider = get_provider()
    cats = await provider.get_categories()
    if any(c.name.lower() == cat_name.lower() for c in cats):
        raise ValueError(f"Category already exists: {cat_name!r}")

    groups = await provider.get_category_groups()
    if grp_name not in groups:
        # A new group is only allowed when the caller explicitly asked for it
        # and the card didn't change the group name away from the proposed one.
        if not (payload.get("create_group") and grp_name == payload["group_name"]):
            raise ValueError(f"Category group not found: {grp_name!r}")

    await provider.create_category(cat_name, grp_name)
    return {"message": f"Category created: '{cat_name}' in group '{grp_name}'", "errors": []}


async def confirm_category_rename(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed category_rename proposal.

    Returns {"message": <result text>, "errors": []}.
    """
    old_name = payload["category_name"]
    new_name = payload["new_name"]
    await get_provider().rename_category(old_name, new_name)
    return {"message": f"Category renamed: '{old_name}' → '{new_name}'", "errors": []}


async def confirm_category_delete(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed category_delete proposal.

    Returns {"message": <result text>, "errors": []}.
    """
    name = payload["category_name"]
    await get_provider().delete_category(name)
    return {"message": f"Category deleted: '{name}'", "errors": []}


pending_proposals.register_handler("category_create", confirm_category_create)
pending_proposals.register_handler("category_rename", confirm_category_rename)
pending_proposals.register_handler("category_delete", confirm_category_delete)
