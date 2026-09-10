"""In-memory store for pending category action proposals (rename / delete)."""
from backend.tools._action_store import InMemoryActionStore

_store = InMemoryActionStore()
store = _store.store
get = _store.get
delete = _store.delete
