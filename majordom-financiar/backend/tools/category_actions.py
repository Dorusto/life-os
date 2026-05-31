"""In-memory store for pending category action proposals (rename / delete)."""

_actions: dict[str, dict] = {}


def store(action_id: str, data: dict) -> None:
    _actions[action_id] = data


def get(action_id: str) -> dict | None:
    return _actions.get(action_id)


def delete(action_id: str) -> None:
    _actions.pop(action_id, None)
