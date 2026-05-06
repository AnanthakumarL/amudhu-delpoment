"""
WhatsApp Webhook API Routes
"""

import base64
import io
import tempfile
import os
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
    message: str = ""
    audio_base64: Optional[str] = None
    audio_mime: Optional[str] = None


def _transcribe_audio(audio_b64: str, mime_type: str) -> Optional[str]:
    """Transcribe base64-encoded audio using OpenAI Whisper. Returns transcript or None."""
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        print("[voice] No OPENAI_API_KEY — cannot transcribe")
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        audio_bytes = base64.b64decode(audio_b64)
        # Determine file extension from mime type
        ext = "ogg"
        if "mp4" in mime_type or "aac" in mime_type:
            ext = "mp4"
        elif "mpeg" in mime_type or "mp3" in mime_type:
            ext = "mp3"
        elif "webm" in mime_type:
            ext = "webm"
        elif "wav" in mime_type:
            ext = "wav"
        # Write to a temp file (Whisper API requires a file-like with a name)
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as f:
                result = client.audio.transcriptions.create(
                    model=settings.OPENAI_TRANSCRIPTION_MODEL,
                    file=f,
                    language="en",
                )
            transcript = (result.text or "").strip()
            print(f"[voice] Transcribed: {transcript[:120]}")
            return transcript if transcript else None
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        print(f"[voice] Transcription error: {e}")
        return None


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

    Handles both text and voice messages. Voice is transcribed via Whisper
    before being passed to the flow engine — so the rest of the pipeline
    sees plain text regardless of input type.
    """
    from src.api.bot_control import is_phone_allowed, _normalize_phone
    from src.services.flow_engine import get_flow_engine

    if not is_phone_allowed(payload.phone):
        print(f"[whitelist] blocked {payload.phone} (normalized {_normalize_phone(payload.phone)})")
        return {"phone": payload.phone, "reply": "", "blocked": True}
    print(f"[whitelist] allowed {payload.phone}")

    message = payload.message or ""

    # Voice message — transcribe first
    if payload.audio_base64:
        transcript = _transcribe_audio(
            payload.audio_base64,
            payload.audio_mime or "audio/ogg; codecs=opus"
        )
        if transcript:
            message = transcript
            print(f"[voice] Using transcript as message: {transcript[:100]}")
        else:
            return {
                "phone": payload.phone,
                "reply": "Sorry, I couldn't understand your voice message. Please try typing instead.",
                "messages": ["Sorry, I couldn't understand your voice message. Please try typing instead."],
                "action": "voice_error",
                "next_step": None,
            }

    if not message:
        return {"phone": payload.phone, "reply": "", "messages": [], "action": None, "next_step": None}

    flow_engine = get_flow_engine()
    response = flow_engine.process_message(payload.phone, message)

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
