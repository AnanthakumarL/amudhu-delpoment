"""
Session Management API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


class CollectedDataUpdate(BaseModel):
    field: str
    value: str


@router.get("/")
async def list_active_sessions():
    """Get all active sessions with user data"""
    mongo = get_mongo_service()
    sessions = mongo.get_all_active_sessions()

    result = []
    for session in sessions:
        phone = session.get("phone")
        user = mongo.get_user_by_phone(phone) or {}

        session_data = {
            "phone": phone,
            "current_step": session.get("current_step"),
            "collected_data": session.get("collected_data", {}),
            "conversation_history": session.get("conversation_history", []),
            "is_active": session.get("is_active"),
            "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
            "last_message_at": session.get("last_message_at").isoformat() if session.get("last_message_at") else None,
            "user_name": user.get("name"),
            "user_email": user.get("email"),
        }

        if "_id" in session:
            session_data["session_id"] = str(session["_id"])

        result.append(session_data)

    return {"sessions": result, "count": len(result)}


@router.get("/{phone}")
async def get_session(phone: str):
    """Get session for a phone"""
    mongo = get_mongo_service()
    session = mongo.get_session_by_phone(phone)

    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    user = mongo.get_user_by_phone(phone) or {}

    result = {
        "phone": phone,
        "current_step": session.get("current_step"),
        "collected_data": session.get("collected_data", {}),
        "conversation_history": session.get("conversation_history", []),
        "is_active": session.get("is_active"),
        "created_at": session.get("created_at").isoformat() if session.get("created_at") else None,
        "last_message_at": session.get("last_message_at").isoformat() if session.get("last_message_at") else None,
        "user_name": user.get("name"),
        "user_email": user.get("email"),
    }

    if "_id" in session:
        result["session_id"] = str(session["_id"])

    return result


@router.put("/{phone}/collected-data")
async def update_collected_data(phone: str, data_update: CollectedDataUpdate):
    """Update collected data for a session"""
    mongo = get_mongo_service()
    session = mongo.get_session_by_phone(phone)

    if not session:
        raise HTTPException(status_code=404, detail="No active session found")

    collected_data = session.get("collected_data", {})
    collected_data[data_update.field] = data_update.value

    updated_session = mongo.update_session_step(phone, session.get("current_step"), collected_data)

    if not updated_session:
        raise HTTPException(status_code=500, detail="Failed to update session")

    return {
        "status": "success",
        "collected_data": updated_session.get("collected_data", {})
    }


@router.post("/{phone}/reset")
async def reset_session(phone: str):
    """Reset session to beginning"""
    mongo = get_mongo_service()

    mongo.end_session(phone)
    new_session = mongo.create_session(phone)

    if "_id" in new_session:
        new_session["_id"] = str(new_session["_id"])

    return {"status": "success", "message": "Session reset", "session": new_session}


@router.post("/{phone}/send-message")
async def send_test_message(phone: str, message: str):
    """Send a test message to simulate user input"""
    from src.services.flow_engine import get_flow_engine

    flow_engine = get_flow_engine()
    response = flow_engine.process_message(phone, message)

    return {
        "status": "success",
        "response": response
    }
