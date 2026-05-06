"""
Order Management API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.services.mongo_service import get_mongo_service

router = APIRouter(prefix="/api/orders", tags=["Orders"])


class OrderUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None


class CollectedDataUpdate(BaseModel):
    field: str
    value: str


@router.get("/")
async def list_orders(status: Optional[str] = None):
    """Get all orders"""
    mongo = get_mongo_service()
    orders = mongo.get_all_orders(status=status)

    for order in orders:
        if "_id" in order:
            order["_id"] = str(order["_id"])
        for key in ["created_at", "updated_at"]:
            if key in order and order[key]:
                order[key] = order[key].isoformat() if hasattr(order[key], "isoformat") else str(order[key])

    return {"orders": orders, "count": len(orders)}


@router.get("/{order_id}")
async def get_order(order_id: str):
    """Get order by ID"""
    mongo = get_mongo_service()
    order = mongo.get_order_by_id(order_id)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if "_id" in order:
        order["_id"] = str(order["_id"])
    for key in ["created_at", "updated_at"]:
        if key in order and order[key]:
            order[key] = order[key].isoformat() if hasattr(order[key], "isoformat") else str(order[key])

    return order


@router.put("/{order_id}/status")
async def update_order_status(order_id: str, status_update: OrderUpdate):
    """Update order status"""
    mongo = get_mongo_service()

    valid_statuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    if status_update.status and status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    order = mongo.update_order_status(order_id, status_update.status)

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if "_id" in order:
        order["_id"] = str(order["_id"])
    for key in ["created_at", "updated_at"]:
        if key in order and order[key]:
            order[key] = order[key].isoformat() if hasattr(order[key], "isoformat") else str(order[key])

    return order


@router.delete("/{order_id}")
async def delete_order(order_id: str):
    """Delete order"""
    mongo = get_mongo_service()

    success = mongo.delete_order(order_id)

    if not success:
        raise HTTPException(status_code=404, detail="Order not found")

    return {"status": "success", "message": "Order deleted"}
