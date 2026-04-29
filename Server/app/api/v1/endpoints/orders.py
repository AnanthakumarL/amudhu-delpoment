import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.order import (
    Order,
    OrderCreate,
    OrderStatistics,
    OrderStatus,
    OrderUpdate,
)
from app.services.order_service import OrderService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return OrderService(db)


@router.post("", response_model=Order, status_code=status.HTTP_201_CREATED, tags=["Admin - Orders"])
async def create_order(
    order: OrderCreate,
    service: OrderService = Depends(get_service),
):
    """Create a new order"""
    return service.create_order(order)


@router.get("", response_model=PaginatedResponse[Order], tags=["Admin - Orders"])
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: OrderStatus | None = Query(None, alias="status"),
    customer_email: str | None = None,
    customer_identifier: str | None = None,
    production_identifier: str | None = None,
    production_assigned: bool | None = None,
    service: OrderService = Depends(get_service),
):
    """List all orders with pagination and filters"""
    orders, total = service.list_orders(
        page,
        page_size,
        status_filter,
        customer_email,
        customer_identifier,
        production_identifier,
        production_assigned,
    )

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=orders,
    )


@router.get("/statistics", response_model=OrderStatistics, tags=["Admin - Orders"])
async def get_order_statistics(service: OrderService = Depends(get_service)):
    """Get order statistics"""
    return service.get_statistics()


@router.get("/number/{order_number}", response_model=Order, tags=["Admin - Orders"])
async def get_order_by_number(
    order_number: str,
    service: OrderService = Depends(get_service),
):
    """Get order by order number"""
    return service.get_order_by_number(order_number)


@router.get("/{order_id}", response_model=Order, tags=["Admin - Orders"])
async def get_order(
    order_id: str,
    service: OrderService = Depends(get_service),
):
    """Get order by ID"""
    return service.get_order(order_id)


@router.put("/{order_id}", response_model=Order, tags=["Admin - Orders"])
async def update_order(
    order_id: str,
    order: OrderUpdate,
    service: OrderService = Depends(get_service),
):
    """Update order"""
    return service.update_order(order_id, order)


@router.delete("/{order_id}", response_model=MessageResponse, tags=["Admin - Orders"])
async def delete_order(
    order_id: str,
    service: OrderService = Depends(get_service),
):
    """Delete order"""
    service.delete_order(order_id)
    return MessageResponse(message="Order deleted successfully", id=order_id)

