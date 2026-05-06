"""
WhatsApp Webhook API Routes
"""

from typing import Optional
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
import json

from src.webhook.whatsapp import get_whatsapp_webhook
from src.core.config import get_settings

router = APIRouter(prefix="/webhook", tags=["Webhook"])


class BridgeMessage(BaseModel):
    phone: str
    message: str


@router.get("/whatsapp")
async def verify_webhook(
    hub_mode: str = Query(...),
    hub_verify_token: str = Query(...),
    hub_challenge: str = Query(...)
):
    """WhatsApp webhook verification"""
    webhook = get_whatsapp_webhook()
    challenge = webhook.verify_webhook(hub_mode, hub_verify_token, hub_challenge)
    return PlainTextResponse(challenge)


@router.post("/whatsapp")
async def handle_whatsapp_webhook(request: Request):
    """Handle incoming WhatsApp messages"""
    try:
        data = await request.json()
        webhook = get_whatsapp_webhook()
        result = await webhook.handle_incoming_message(data)
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/test-message")
async def send_test_message(
    phone: str = Query(...),
    message: str = Query(...)
):
    """Send a test message to simulate incoming WhatsApp message"""
    from src.services.flow_engine import get_flow_engine

    flow_engine = get_flow_engine()
    response = flow_engine.process_message(phone, message)

    return {
        "status": "success",
        "phone": phone,
        "input_message": message,
        "response": response
    }


@router.post("/bridge")
async def bridge_inbound(payload: BridgeMessage):
    """Inbound message from the WhatsApp bridge (Baileys/Node).

    The bridge POSTs each user message here and uses the returned `reply`
    text as the WhatsApp response. We drop messages from numbers not on the
    whitelist by returning an empty reply (the bridge then sends nothing).
    """
    from src.api.bot_control import is_phone_allowed, _normalize_phone
    from src.services.flow_engine import get_flow_engine

    if not is_phone_allowed(payload.phone):
        print(f"[whitelist] blocked {payload.phone} (normalized {_normalize_phone(payload.phone)})")
        return {"phone": payload.phone, "reply": "", "blocked": True}
    print(f"[whitelist] allowed {payload.phone}")

    flow_engine = get_flow_engine()
    response = flow_engine.process_message(payload.phone, payload.message)

    reply_text = response.get("message") if isinstance(response, dict) else str(response)
    messages = response.get("messages") if isinstance(response, dict) else None
    if not messages:
        messages = [reply_text] if reply_text else []
    messages = [m for m in messages if m]

    return {
        "phone": payload.phone,
        "reply": reply_text or "",
        "messages": messages,
        "action": response.get("action") if isinstance(response, dict) else None,
        "next_step": response.get("next_step") if isinstance(response, dict) else None,
    }
