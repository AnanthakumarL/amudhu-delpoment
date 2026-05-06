"""
Collected Data API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api/collection-config", tags=["Collection Config"])


class CollectionConfigUpdate(BaseModel):
    sections: list


@router.get("/")
async def get_collection_config():
    """Get collection configuration"""
    from src.models.schemas import CollectedOrderData

    config = {
        "sections": [
            {
                "id": "customer_profile",
                "title": "Customer Profile",
                "description": "Personal details to identify the customer",
                "icon": "user",
                "fields": [
                    {
                        "id": "name",
                        "label": "Full Name",
                        "icon": "user",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "May I have your full name?",
                        "hint": "Core field — always collected",
                    },
                    {
                        "id": "phone",
                        "label": "Phone Number",
                        "icon": "phone",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "autoFilled": True,
                        "question": "",
                        "hint": "Auto-filled from WhatsApp — never asked",
                    },
                    {
                        "id": "email",
                        "label": "Email Address",
                        "icon": "mail",
                        "required": False,
                        "enabled": True,
                        "locked": False,
                        "question": "Could you share your email address? (optional)",
                        "hint": "",
                    },
                ],
            },
            {
                "id": "order_details",
                "title": "Order Details",
                "description": "What the customer wants to order",
                "icon": "cart",
                "fields": [
                    {
                        "id": "product",
                        "label": "Product / Flavour",
                        "icon": "package",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "Which ice cream would you like?",
                        "hint": "Core field — always collected",
                    },
                    {
                        "id": "quantity",
                        "label": "Quantity",
                        "icon": "hash",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "How many would you like?",
                        "hint": "Core field — always collected",
                    },
                    {
                        "id": "special_notes",
                        "label": "Special Instructions",
                        "icon": "note",
                        "required": False,
                        "enabled": True,
                        "locked": False,
                        "question": "Any special instructions for your order?",
                        "hint": "",
                    },
                ],
            },
            {
                "id": "delivery_info",
                "title": "Delivery Information",
                "description": "Where and when the order should be delivered",
                "icon": "map",
                "fields": [
                    {
                        "id": "address",
                        "label": "Delivery Address",
                        "icon": "map",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "What is your full delivery address (street, area, city)?",
                        "hint": "Core field — always collected",
                    },
                    {
                        "id": "delivery_date",
                        "label": "Delivery Date",
                        "icon": "calendar",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "Which date would you like the delivery?",
                        "hint": "Core field — always collected",
                    },
                    {
                        "id": "delivery_time",
                        "label": "Delivery Time",
                        "icon": "clock",
                        "required": True,
                        "enabled": True,
                        "locked": True,
                        "question": "What time would you prefer for delivery?",
                        "hint": "Core field — always collected",
                    },
                ],
            },
        ],
    }

    return config


@router.post("/")
async def save_collection_config(config_data: CollectionConfigUpdate):
    """Save collection configuration"""
    # In a real implementation, this would persist to MongoDB
    # For now, this is a placeholder endpoint
    return {"status": "success", "message": "Configuration saved"}
