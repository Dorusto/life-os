"""In-memory store for pending transaction proposals."""
import uuid


_proposals: dict[str, dict] = {}


def create(
    merchant: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    account_name: str,
    notes: str = "",
) -> str:
    proposal_id = uuid.uuid4().hex[:8]
    _proposals[proposal_id] = {
        "merchant": merchant,
        "amount": amount,
        "date": date,
        "category_name": category_name,
        "account_id": account_id,
        "account_name": account_name,
        "notes": notes,
    }
    return proposal_id


def get(proposal_id: str) -> dict | None:
    return _proposals.get(proposal_id)


def delete(proposal_id: str) -> None:
    _proposals.pop(proposal_id, None)
