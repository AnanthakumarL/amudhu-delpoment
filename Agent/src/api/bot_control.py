"""Bot control endpoints consumed by the Admin AI Agent panel.

These were originally served by the Node WhatsApp bridge. The Admin panel
points at the Python Agent (port 7998), so we expose them here too.
WhatsApp-specific calls (status/qr/send/logout/broadcast) proxy to the
Baileys bridge at BRIDGE_URL when available, otherwise return safe defaults
so the panel stays usable while the bridge is offline.
"""
import json
import os
import urllib.request
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api", tags=["Bot Control"])

BRIDGE_URL = os.environ.get("WHATSAPP_BRIDGE_URL", "http://localhost:7997")
BRIDGE_TIMEOUT = 3.0

GPT_MODELS = [
    {"id": "gpt-4.1-nano", "label": "GPT-4.1 Nano (cheapest)"},
    {"id": "gpt-4.1-mini", "label": "GPT-4.1 Mini"},
    {"id": "gpt-4o-mini", "label": "GPT-4o Mini"},
    {"id": "gpt-5-nano", "label": "GPT-5 Nano"},
]
DEFAULT_GPT_MODEL = "gpt-4.1-nano"
DEFAULT_PROVIDER = "auto"
VALID_PROVIDERS = {"auto", "deepseek", "gemini", "claude", "gpt"}


def _bridge_get(path: str) -> Optional[dict]:
    try:
        req = urllib.request.Request(f"{BRIDGE_URL}{path}", method="GET")
        with urllib.request.urlopen(req, timeout=BRIDGE_TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except Exception:
        return None


def _bridge_post(path: str, payload: dict) -> Optional[dict]:
    try:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            f"{BRIDGE_URL}{path}",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=BRIDGE_TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except Exception:
        return None


def _state_collection():
    return get_mongo_service().db["bot_state"]


def _get_state(key: str, default):
    doc = _state_collection().find_one({"_id": key})
    return doc["value"] if doc else default


def _set_state(key: str, value) -> None:
    _state_collection().update_one(
        {"_id": key}, {"$set": {"value": value}}, upsert=True
    )


def _normalize_phone(raw: str) -> str:
    """Reduce a WhatsApp id to a 10-digit Indian mobile number.

    Accepts forms like '9876543210', '919876543210', '+91 98765 43210',
    '9876543210@s.whatsapp.net'. WhatsApp LIDs (15-19 digit internal ids
    used when the sender hides their phone number) are rejected — they are
    NOT phone numbers and must never match the whitelist.
    """
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    # LIDs are much longer than any real phone number; bail out.
    if len(digits) > 13:
        return ""
    if len(digits) == 12 and digits.startswith("91"):
        return digits[2:]
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def is_phone_allowed(phone: str) -> bool:
    """Whitelist gate. Strict mode — empty list = nobody is allowed.

    Add numbers in the Admin > AI Agent > Allowed Users tab. Rejects LID-only
    senders (no resolvable phone) so the bot stays silent for them.
    """
    whitelist = _get_state("whitelist", []) or []
    normalized = _normalize_phone(phone)
    if not normalized or len(normalized) != 10:
        return False
    return normalized in whitelist


# ---- Bridge proxies ----------------------------------------------------------

@router.get("/status")
def status():
    data = _bridge_get("/api/status")
    if data:
        return data
    return {"connected": False, "qrPending": False, "phoneNumber": None}


@router.get("/qr")
def qr():
    data = _bridge_get("/api/qr")
    if data:
        return data
    return {"qr": None, "connected": False}


class SendBody(BaseModel):
    to: str
    text: str


@router.post("/send")
def send(body: SendBody):
    data = _bridge_post("/api/send", body.model_dump())
    if data is None:
        raise HTTPException(503, "WhatsApp bridge offline")
    return data


@router.post("/logout")
def logout():
    data = _bridge_post("/api/logout", {})
    if data is None:
        raise HTTPException(503, "WhatsApp bridge offline")
    return data


# ---- Whitelist ---------------------------------------------------------------

class WhitelistBody(BaseModel):
    phone: str


@router.get("/whitelist")
def whitelist_get():
    return _get_state("whitelist", [])


@router.post("/whitelist")
def whitelist_add(body: WhitelistBody):
    digits = "".join(ch for ch in body.phone if ch.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) != 10:
        raise HTTPException(400, "phone must be 10 digits")
    current = list(_get_state("whitelist", []))
    if digits not in current:
        current.append(digits)
        _set_state("whitelist", current)
    return current


@router.delete("/whitelist/{phone}")
def whitelist_remove(phone: str):
    current = [p for p in _get_state("whitelist", []) if p != phone]
    _set_state("whitelist", current)
    return current


# ---- Provider / GPT model ----------------------------------------------------

class ProviderBody(BaseModel):
    provider: str


@router.get("/provider")
def provider_get():
    return {"provider": _get_state("provider", DEFAULT_PROVIDER)}


@router.post("/provider")
def provider_set(body: ProviderBody):
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(400, "invalid provider")
    _set_state("provider", body.provider)
    return {"provider": body.provider}


class GptModelBody(BaseModel):
    model: str


@router.get("/gpt-model")
def gpt_model_get():
    return {
        "model": _get_state("gpt_model", DEFAULT_GPT_MODEL),
        "models": GPT_MODELS,
    }


@router.post("/gpt-model")
def gpt_model_set(body: GptModelBody):
    if body.model not in {m["id"] for m in GPT_MODELS}:
        raise HTTPException(400, "invalid model")
    _set_state("gpt_model", body.model)
    return {"model": body.model}


# ---- Analytics + chats -------------------------------------------------------

def _iso(value) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return value or None


@router.get("/analytics")
def analytics():
    mongo = get_mongo_service()
    sessions = list(mongo.get_sessions_collection().find({}))
    users_idx: dict[str, dict] = {}
    total_messages = 0

    for session in sessions:
        phone = session.get("phone") or ""
        history = session.get("conversation_history") or []
        msg_count = sum(1 for m in history if m.get("role") == "user")
        total_messages += msg_count
        last_iso = _iso(session.get("last_message_at") or session.get("updated_at"))
        bucket = users_idx.setdefault(phone, {
            "phone": phone,
            "messageCount": 0,
            "totalInputTokens": 0,
            "totalOutputTokens": 0,
            "totalCostINR": 0,
            "lastMessage": None,
        })
        bucket["messageCount"] += msg_count
        if last_iso and (not bucket["lastMessage"] or last_iso > bucket["lastMessage"]):
            bucket["lastMessage"] = last_iso

    return {
        "totalUsers": len(users_idx),
        "totalMessages": total_messages,
        "totalInputTokens": 0,
        "totalOutputTokens": 0,
        "totalCostINR": 0,
        "users": list(users_idx.values()),
    }


@router.get("/chats/{phone}")
def chats(phone: str):
    mongo = get_mongo_service()
    session = mongo.get_sessions_collection().find_one(
        {"phone": phone}, sort=[("created_at", -1)]
    )
    if not session:
        return []

    history = session.get("conversation_history") or []
    provider = _get_state("provider", DEFAULT_PROVIDER)
    model = _get_state("gpt_model", DEFAULT_GPT_MODEL)

    out, last_user = [], None
    for i, msg in enumerate(history):
        role = msg.get("role")
        if role == "user":
            last_user = msg
            continue
        if role in ("assistant", "bot") and last_user is not None:
            ts = msg.get("timestamp") or last_user.get("timestamp")
            out.append({
                "id": f"{phone}-{i}",
                "userText": last_user.get("content", ""),
                "reply": msg.get("content", ""),
                "timestamp": _iso(ts) or "",
                "inputTokens": 0,
                "outputTokens": 0,
                "costINR": 0,
                "provider": provider,
                "model": model,
            })
            last_user = None
    return out


@router.post("/chats/{phone}/clear")
def chats_clear(phone: str):
    get_mongo_service().get_sessions_collection().update_many(
        {"phone": phone}, {"$set": {"conversation_history": []}}
    )
    return {"ok": True}


# ---- Broadcast ---------------------------------------------------------------

class BroadcastBody(BaseModel):
    type: str
    text: Optional[str] = ""
    mediaBase64: Optional[str] = None
    mimeType: Optional[str] = None
    fileName: Optional[str] = None


@router.post("/broadcast")
def broadcast(body: BroadcastBody):
    phones = _get_state("whitelist", [])
    if not phones:
        raise HTTPException(400, "No allowed users configured")

    bridge_resp = _bridge_post("/api/broadcast", body.model_dump())
    if bridge_resp:
        return bridge_resp

    results, sent, failed = [], 0, 0
    text = body.text or ""
    for p in phones:
        r = _bridge_post("/api/send", {"to": p, "text": text})
        if r and not r.get("error"):
            sent += 1
            results.append({"phone": p, "success": True})
        else:
            failed += 1
            results.append({
                "phone": p,
                "success": False,
                "error": (r or {}).get("error", "bridge offline"),
            })
    return {"sent": sent, "failed": failed, "total": len(phones), "results": results}
