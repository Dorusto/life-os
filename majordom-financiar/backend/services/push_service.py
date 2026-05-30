"""
Web Push notification service.

VAPID keys are generated automatically on first startup and saved to
/app/data/vapid_private.pem + /app/data/vapid_public.txt (Docker volume).
No manual key generation needed — the service self-provisions on any fresh install.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

PRIVATE_KEY_PATH = Path("/app/data/vapid_private.pem")
PUBLIC_KEY_PATH = Path("/app/data/vapid_public.txt")
VAPID_CONTACT = "mailto:dorusto@gmail.com"

_instance: PushService | None = None


def get_push_service() -> PushService:
    global _instance
    if _instance is None:
        from backend.core.config import settings
        from backend.core.memory.database import MemoryDB
        _instance = PushService(MemoryDB(settings.memory.db_path))
    return _instance


class PushService:
    def __init__(self, db):
        self.db = db
        # _private_key stores the file path — pywebpush reads PEM directly,
        # avoiding any string serialization issues.
        self._private_key_path, self._public_key = self._load_or_generate_keys()

    def _load_or_generate_keys(self) -> tuple[str, str]:
        if PRIVATE_KEY_PATH.exists() and PUBLIC_KEY_PATH.exists():
            public_key = PUBLIC_KEY_PATH.read_text().strip()
            logger.info("VAPID keys loaded from %s", PRIVATE_KEY_PATH)
            return str(PRIVATE_KEY_PATH), public_key

        from py_vapid import Vapid
        import base64
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

        v = Vapid()
        v.generate_keys()

        PRIVATE_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
        PRIVATE_KEY_PATH.write_bytes(v.private_pem())

        pub_bytes = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        public_key = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()
        PUBLIC_KEY_PATH.write_text(public_key)

        logger.info("VAPID keys generated and saved to %s", PRIVATE_KEY_PATH)
        return str(PRIVATE_KEY_PATH), public_key

    @property
    def public_key(self) -> str:
        return self._public_key

    async def send_to_all(self, user_id: str, title: str, body: str, url: str = "/chat"):
        subscriptions = self.db.get_push_subscriptions(user_id)
        if not subscriptions:
            logger.debug("No push subscriptions for user %s", user_id)
            return
        for sub in subscriptions:
            await self._send_one(sub, title, body, url)

    async def _send_one(self, sub: dict, title: str, body: str, url: str):
        from pywebpush import webpush, WebPushException

        payload = json.dumps({"title": title, "body": body, "url": url})
        endpoint_short = sub["endpoint"][:60]
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=self._private_key_path,
                    vapid_claims={"sub": VAPID_CONTACT},
                ),
            )
            logger.info("Push sent → %s…", endpoint_short)
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code == 410:
                logger.info("Subscription expired (410), removing: %s…", endpoint_short)
                self.db.delete_push_subscription(sub["endpoint"])
            else:
                logger.warning("Push failed for %s…: %s", endpoint_short, exc)
        except Exception as exc:
            logger.warning("Push error for %s…: %s", endpoint_short, exc)
