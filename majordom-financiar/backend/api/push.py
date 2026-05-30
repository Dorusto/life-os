from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.api.auth import get_current_user
from backend.core.config import settings
from backend.core.memory.database import MemoryDB
from backend.services.push_service import get_push_service

router = APIRouter(prefix="/push", tags=["push"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str
    user_agent: str = ""


@router.get("/vapid-public-key")
async def vapid_public_key():
    """Returns the VAPID public key needed by the browser to create a push subscription."""
    return {"public_key": get_push_service().public_key}


@router.post("/subscribe", status_code=204)
async def subscribe(req: SubscribeRequest, _user=Depends(get_current_user)):
    db = MemoryDB(settings.memory.db_path)
    db.save_push_subscription(
        user_id="default",
        endpoint=req.endpoint,
        p256dh=req.p256dh,
        auth=req.auth,
        user_agent=req.user_agent,
    )


@router.delete("/subscribe", status_code=204)
async def unsubscribe(endpoint: str, _user=Depends(get_current_user)):
    MemoryDB(settings.memory.db_path).delete_push_subscription(endpoint)


@router.post("/test", status_code=204)
async def test_push(_user=Depends(get_current_user)):
    """Sends a test push to all subscriptions for the default user. Used during setup verification."""
    await get_push_service().send_to_all(
        user_id="default",
        title="Majordom",
        body="Notificările funcționează corect.",
        url="/chat",
    )
