"""In-memory store for pending close-account proposals."""


_closures: dict[str, dict] = {}


def store(proposal_id: str, data: dict) -> None:
    """Store a close-account proposal."""
    _closures[proposal_id] = data


def get(proposal_id: str) -> dict | None:
    return _closures.get(proposal_id)


def delete(proposal_id: str) -> None:
    _closures.pop(proposal_id, None)
