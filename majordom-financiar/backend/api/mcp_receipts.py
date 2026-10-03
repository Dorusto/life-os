"""
MCP receipt upload endpoint (#322).

Lets an external agent (e.g. Hermes over Telegram) send a fuel-receipt photo
to Majordom. The image is read with the same vision path as the PWA
(ReceiptService().process_image()) — the door never extracts numbers itself.

Auth is the MCP bearer token, not the PWA JWT: one token per household member.
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from backend.api.receipts import save_and_extract
from backend.core import mcp_auth

logger = logging.getLogger(__name__)
router = APIRouter()


async def _require_member(request: Request) -> str:
    """Resolve the household member from the MCP bearer token."""
    if not mcp_auth.mcp_enabled():
        raise HTTPException(
            status_code=503, detail="MCP disabled: MCP_TOKENS/MCP_TOKEN not set"
        )
    header = request.headers.get("authorization", "")
    member = mcp_auth.resolve_member(header.encode())
    if member is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return member


@router.post("/mcp/receipts")
async def upload_mcp_receipt(
    file: UploadFile = File(...),
    member: str = Depends(_require_member),
):
    """Upload a receipt photo over MCP; returns what was read and the next step."""
    receipt_id, result = await save_and_extract(file)

    # Log the member and receipt id only — never amounts or payees.
    logger.info("MCP receipt upload by %s: %s", member, receipt_id)

    receipt_type = result.get("receipt_type", "grocery")
    if receipt_type == "fuel":
        next_step = "Call vehicle__log_refuel with this receipt_id and the odometer km."
    else:
        next_step = "Not a fuel receipt — only fuel receipts are supported from this endpoint."

    return {
        "receipt_id": receipt_id,
        "receipt_type": receipt_type,
        "merchant": result.get("merchant"),
        "amount": result.get("amount"),
        "liters": result.get("liters"),
        "date": result.get("date"),
        "next_step": next_step,
    }
