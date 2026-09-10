"""
Encrypted storage for user-entered Actual Budget connection credentials
(url/password/sync_id), used by the AB setup wizard (#190).

Key management: a Fernet key is generated once and stored in a gitignored
file next to memory.db (the same host-mounted `data/` volume) — not derived
from a user passphrase (zero extra friction for a single-user self-hosted
install) and not hardcoded (never sits in source control). Losing the key
file just means the stored credentials become undecryptable and the user
re-runs the wizard — an acceptable trade-off here.

Functions here take `db_path` as an explicit argument rather than reading it
from the `settings` singleton — this module is used from
`ActualBudgetConfig.__post_init__()`, which runs *while* the enclosing
`Settings()` singleton is still being constructed (its `memory` field isn't
built yet at that point in field-declaration order).
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

PREFERENCE_KEY = "ab_credentials_encrypted"


def _data_dir(db_path: str) -> Path:
    return Path(db_path).parent


def _key_path(db_path: str) -> Path:
    return _data_dir(db_path) / ".ab_credentials.key"


def _get_or_create_key(db_path: str) -> bytes:
    path = _key_path(db_path)
    if path.exists():
        return path.read_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    path.write_bytes(key)
    os.chmod(path, 0o600)
    return key


def encrypt_credentials(db_path: str, url: str, password: str, sync_id: str) -> str:
    """Encrypt AB connection credentials to a single string blob."""
    fernet = Fernet(_get_or_create_key(db_path))
    payload = json.dumps({"url": url, "password": password, "sync_id": sync_id}).encode()
    return fernet.encrypt(payload).decode()


def decrypt_credentials(db_path: str, blob: str) -> dict:
    """Decrypt a blob produced by encrypt_credentials() back to a dict."""
    fernet = Fernet(_get_or_create_key(db_path))
    payload = fernet.decrypt(blob.encode())
    return json.loads(payload.decode())


def load_saved_credentials(db_path: str) -> dict | None:
    """Return {"url", "password", "sync_id"} if the wizard has saved
    credentials before, else None (never asked / key or blob unreadable)."""
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(db_path=db_path)
    blob = db.get_preference(PREFERENCE_KEY)
    if not blob:
        return None
    try:
        return decrypt_credentials(db_path, blob)
    except Exception as e:
        # Corrupt blob or missing/rotated key file — treat as "not configured"
        # rather than crashing Settings() construction on every app start, but
        # log it since it means the user will unexpectedly see the setup
        # wizard again despite having saved credentials before.
        logger.warning("Could not decrypt saved AB credentials, treating as unconfigured: %s", e)
        return None


def save_credentials(db_path: str, url: str, password: str, sync_id: str) -> None:
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(db_path=db_path)
    db.set_preference(PREFERENCE_KEY, encrypt_credentials(db_path, url, password, sync_id))


def has_saved_credentials(db_path: str) -> bool:
    from backend.core.memory.database import MemoryDB

    db = MemoryDB(db_path=db_path)
    return bool(db.get_preference(PREFERENCE_KEY))
