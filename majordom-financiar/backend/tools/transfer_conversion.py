"""In-memory store for pending transaction→transfer conversion proposals (#144)."""

_proposals: dict[str, dict] = {}


def store(proposal_id: str, data: dict) -> None:
    """Store a transfer-conversion proposal."""
    _proposals[proposal_id] = data


def get(proposal_id: str) -> dict | None:
    return _proposals.get(proposal_id)


def delete(proposal_id: str) -> None:
    _proposals.pop(proposal_id, None)
