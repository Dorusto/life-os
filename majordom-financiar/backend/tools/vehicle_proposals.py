"""In-memory store for pending refuel proposals (from chat text input)."""
import uuid

_refuels: dict[str, dict] = {}


def create(**kwargs) -> str:
    pid = uuid.uuid4().hex[:8]
    _refuels[pid] = kwargs
    return pid


def get(pid: str) -> dict | None:
    return _refuels.get(pid)


def delete(pid: str) -> None:
    _refuels.pop(pid, None)
