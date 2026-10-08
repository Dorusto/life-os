"""
IncomeClassificationService — the write logic for a confirmed classify_income
proposal.

Moved out of the FastAPI handler in backend/api/category_actions.py so the same
code runs whether the confirmation came from the PWA card, a plain HTTP call, or
an MCP tool. Registered as the "classify_income" handler on the shared
pending-proposal store at import time.
"""
import logging

from backend.core import pending_proposals
from backend.core.finance.provider import get_provider

logger = logging.getLogger(__name__)


async def confirm_classify_income(payload: dict, overrides: dict, confirmed_by: str) -> dict:
    """Execute a confirmed classify_income proposal.

    `overrides` (the PWA card's edited fields) win over `payload` (what
    propose_classify_income stored) when truthy.

    Returns {"message": <result text>, "errors": []}.
    """
    cat_name = overrides.get("category_name") or payload["category_name"]
    income_type = overrides.get("income_type") or payload["income_type"]

    if income_type not in ("passive", "semi-passive", "active"):
        raise ValueError(
            f"Invalid income_type: {income_type!r}. Must be one of passive, semi-passive, active."
        )

    await get_provider().set_income_classification(cat_name, income_type)
    return {"message": f"'{cat_name}' classified as {income_type} income.", "errors": []}


pending_proposals.register_handler("classify_income", confirm_classify_income)
