"""In-memory store for pending transaction proposals."""
import uuid


_proposals: dict[str, dict] = {}


def create(
    payee: str,
    amount: float,
    date: str,
    category_name: str,
    account_id: str,
    account_name: str,
    notes: str = "",
    is_expense: bool = True,
    notes_category_match: bool = False,
) -> str:
    proposal_id = uuid.uuid4().hex[:8]
    _proposals[proposal_id] = {
        "payee": payee,
        "amount": amount,
        "date": date,
        "category_name": category_name,
        "account_id": account_id,
        "account_name": account_name,
        "notes": notes,
        "is_expense": is_expense,
        "notes_category_match": notes_category_match,
    }
    return proposal_id


def get(proposal_id: str) -> dict | None:
    return _proposals.get(proposal_id)


def delete(proposal_id: str) -> None:
    _proposals.pop(proposal_id, None)
