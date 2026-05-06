import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.delivery_management import (
    DeliveryManagement,
    DeliveryManagementCreate,
    DeliveryManagementUpdate,
)
from app.services.delivery_management_service import DeliveryManagementService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return DeliveryManagementService(db)


@router.post("", response_model=DeliveryManagement, status_code=status.HTTP_201_CREATED, tags=["Admin - Delivery Management"])
async def create_delivery(
    item: DeliveryManagementCreate,
    service: DeliveryManagementService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[DeliveryManagement], tags=["Admin - Delivery Management"])
async def list_deliveries(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    order_id: str | None = None,
    service: DeliveryManagementService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, status=status, order_id=order_id)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{item_id}", response_model=DeliveryManagement, tags=["Admin - Delivery Management"])
async def get_delivery(
    item_id: str,
    service: DeliveryManagementService = Depends(get_service),
):
    return service.get(item_id)


@router.put("/{item_id}", response_model=DeliveryManagement, tags=["Admin - Delivery Management"])
async def update_delivery(
    item_id: str,
    item: DeliveryManagementUpdate,
    service: DeliveryManagementService = Depends(get_service),
):
    return service.update(item_id, item)


@router.delete("/{item_id}", response_model=MessageResponse, tags=["Admin - Delivery Management"])
async def delete_delivery(
    item_id: str,
    service: DeliveryManagementService = Depends(get_service),
):
    service.delete(item_id)
    return MessageResponse(message="Delivery deleted successfully", id=item_id)

