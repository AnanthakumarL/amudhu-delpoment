"""
User Management API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api/users", tags=["Users"])


class UserCreate(BaseModel):
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
async def list_users(active_only: bool = False):
    """Get all WhatsApp users"""
    mongo = get_mongo_service()
    users = mongo.get_all_users(active_only=active_only)

    # Convert ObjectId to string
    for user in users:
        if "_id" in user:
            user["_id"] = str(user["_id"])
        # Convert datetime to ISO format
        for key in ["created_at", "updated_at", "last_message_at"]:
            if key in user and user[key]:
                user[key] = user[key].isoformat() if hasattr(user[key], "isoformat") else str(user[key])

    return {"users": users, "count": len(users)}


@router.get("/{phone}")
async def get_user(phone: str):
    """Get user by phone number"""
    mongo = get_mongo_service()
    user = mongo.get_user_by_phone(phone)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "_id" in user:
        user["_id"] = str(user["_id"])
    for key in ["created_at", "updated_at", "last_message_at"]:
        if key in user and user[key]:
            user[key] = user[key].isoformat() if hasattr(user[key], "isoformat") else str(user[key])

    return user


@router.post("/")
async def create_user(user_data: UserCreate):
    """Create new WhatsApp user"""
    mongo = get_mongo_service()

    # Check if user exists
    existing = mongo.get_user_by_phone(user_data.phone)
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    user = mongo.create_user(user_data.phone, user_data.name)

    if "_id" in user:
        user["_id"] = str(user["_id"])

    return user


@router.put("/{phone}")
async def update_user(phone: str, update_data: UserUpdate):
    """Update user data"""
    mongo = get_mongo_service()

    # Filter out None values
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}

    if not update_dict:
        raise HTTPException(status_code=400, detail="No data to update")

    user = mongo.update_user(phone, update_dict)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "_id" in user:
        user["_id"] = str(user["_id"])
    for key in ["created_at", "updated_at", "last_message_at"]:
        if key in user and user[key]:
            user[key] = user[key].isoformat() if hasattr(user[key], "isoformat") else str(user[key])

    return user


@router.delete("/{phone}")
async def delete_user(phone: str):
    """Delete user"""
    mongo = get_mongo_service()

    success = mongo.delete_user(phone)

    if not success:
        raise HTTPException(status_code=404, detail="User not found")

    return {"status": "success", "message": "User deleted"}


@router.get("/{phone}/orders")
async def get_user_orders(phone: str):
    """Get all orders for a user"""
    mongo = get_mongo_service()

    orders = mongo.get_orders_by_phone(phone)

    for order in orders:
        if "_id" in order:
            order["_id"] = str(order["_id"])
        for key in ["created_at", "updated_at"]:
            if key in order and order[key]:
                order[key] = order[key].isoformat() if hasattr(order[key], "isoformat") else str(order[key])

    return {"orders": orders, "count": len(orders)}
