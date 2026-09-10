"""In-memory store for pending vehicle status proposals (activate/deactivate)."""
from backend.tools._action_store import InMemoryActionStore

_store = InMemoryActionStore()
store = _store.store
get = _store.get
delete = _store.delete
