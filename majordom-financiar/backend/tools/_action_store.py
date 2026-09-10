class InMemoryActionStore:
    """Simple in‑memory key‑value store for pending action proposals."""

    def __init__(self) -> None:
        self._actions: dict[str, dict] = {}

    def store(self, action_id: str, data: dict) -> None:
        self._actions[action_id] = data

    def get(self, action_id: str) -> dict | None:
        return self._actions.get(action_id)

    def delete(self, action_id: str) -> None:
        self._actions.pop(action_id, None)
