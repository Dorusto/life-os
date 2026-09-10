"""In-memory store for pending vehicle reminder proposals (set APK / insurance date)."""
from backend.tools._action_store import InMemoryActionStore

_store = InMemoryActionStore()
store = _store.store
get = _store.get
delete = _store.delete
