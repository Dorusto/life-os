"""
Chat/MCP tools for payee rename, merge and default category (#313).

Each resolves the payee(s) and category by exact case-insensitive name among
the user's own payees/categories — never fuzzy or substring
(decisions.md#operator-not-brain). Anything unresolved or ambiguous comes back
as needs_input for the model to ask about; otherwise a confirmation card is
created on the shared pending-proposal store.
"""
import json
import logging

from backend.core.finance.provider import get_provider
from backend.services import payee_service

logger = logging.getLogger(__name__)

_MAX_LISTED = 30


def _needs_input(missing: list[str], message: str) -> str:
    return json.dumps({"type": "needs_input", "missing": missing, "message": message})


def _payee_names(payees: list[dict]) -> str:
    names = [
        p["name"] for p in payees
        if p.get("name") and p["name"] != "Unnamed"
    ]
    return ", ".join(names[:_MAX_LISTED])


def _find_payees(payees: list[dict], name: str) -> list[dict]:
    """Exact case-insensitive name match among non-transfer, named payees."""
    needle = (name or "").strip().lower()
    return [
        p for p in payees
        if not p.get("transfer_account")
        and p.get("name")
        and p["name"] != "Unnamed"
        and p["name"].lower() == needle
    ]


async def propose_payee_rename(payee: str, new_name: str) -> str:
    payees = await get_provider().get_payees()
    matches = _find_payees(payees, payee)
    if not matches:
        return _needs_input(
            ["payee"],
            f"No payee named '{payee}'. Known payees: {_payee_names(payees)}",
        )
    if len(matches) > 1:
        return _needs_input(
            ["payee"],
            f"More than one payee matches '{payee}': "
            + ", ".join(p["name"] for p in matches),
        )
    target = matches[0]

    new_name = (new_name or "").strip()
    if not new_name:
        return _needs_input(["new_name"], "What should the payee be renamed to?")
    if new_name.lower() == target["name"].lower():
        return _needs_input(
            ["new_name"], f"'{new_name}' is already this payee's name."
        )
    if _find_payees(payees, new_name):
        return _needs_input(
            ["new_name"],
            f"A payee named '{new_name}' already exists — use "
            "finance__propose_payee_merge to merge them.",
        )

    return json.dumps(await payee_service.build_payee_proposal(
        "rename", target, new_name=new_name,
    ))


async def propose_payee_merge(source_payee: str, target_payee: str) -> str:
    payees = await get_provider().get_payees()

    sources = _find_payees(payees, source_payee)
    if not sources:
        return _needs_input(
            ["source_payee"],
            f"No payee named '{source_payee}'. Known payees: {_payee_names(payees)}",
        )
    if len(sources) > 1:
        return _needs_input(
            ["source_payee"],
            f"More than one payee matches '{source_payee}': "
            + ", ".join(p["name"] for p in sources),
        )
    source = sources[0]

    targets = _find_payees(payees, target_payee)
    if not targets:
        return _needs_input(
            ["target_payee"],
            f"No payee named '{target_payee}'. Known payees: {_payee_names(payees)}",
        )
    if len(targets) > 1:
        return _needs_input(
            ["target_payee"],
            f"More than one payee matches '{target_payee}': "
            + ", ".join(p["name"] for p in targets),
        )
    target = targets[0]

    if source["id"] == target["id"]:
        return _needs_input(
            ["target_payee"], "Source and target are the same payee."
        )

    return json.dumps(await payee_service.build_payee_proposal(
        "merge", source, target=target,
    ))


async def propose_payee_default_category(payee: str, category: str) -> str:
    payees = await get_provider().get_payees()
    matches = _find_payees(payees, payee)
    if not matches:
        return _needs_input(
            ["payee"],
            f"No payee named '{payee}'. Known payees: {_payee_names(payees)}",
        )
    if len(matches) > 1:
        return _needs_input(
            ["payee"],
            f"More than one payee matches '{payee}': "
            + ", ".join(p["name"] for p in matches),
        )
    target = matches[0]

    cats = await get_provider().get_categories()
    needle = (category or "").strip().lower()
    cat = next((c for c in cats if c.name.lower() == needle), None)
    if cat is None:
        names = ", ".join(c.name for c in cats[:_MAX_LISTED])
        return _needs_input(
            ["category"],
            f"No category named '{category}'. Known categories: {names}",
        )

    return json.dumps(await payee_service.build_payee_proposal(
        "default_category", target, category={"id": cat.id, "name": cat.name},
    ))
