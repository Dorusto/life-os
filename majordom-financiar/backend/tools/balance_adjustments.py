"""In-memory store for pending balance adjustment proposals."""
import uuid


_adjustments: dict[str, dict] = {}


def store(proposal_id: str, data: dict) -> None:
    """Store a balance adjustment proposal."""
    _adjustments[proposal_id] = data


def get(proposal_id: str) -> dict | None:
    return _adjustments.get(proposal_id)


def delete(proposal_id: str) -> None:
    _adjustments.pop(proposal_id, None)
