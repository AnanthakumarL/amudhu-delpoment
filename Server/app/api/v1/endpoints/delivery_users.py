import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.delivery_user import DeliveryUser, DeliveryUserCreate, DeliveryUserUpdate
from app.services.delivery_user_service import DeliveryUserService

router = APIRouter()


def get_service(db=Depends(get_db)) -> DeliveryUserService:
    return DeliveryUserService(db)


@router.post("", response_model=DeliveryUser, status_code=status.HTTP_201_CREATED, tags=["Admin - Delivery Users"])
async def create_delivery_user(
    item: DeliveryUserCreate,
    service: DeliveryUserService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[DeliveryUser], tags=["Admin - Delivery Users"])
async def list_delivery_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
    service: DeliveryUserService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, is_active=is_active)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{user_id}", response_model=DeliveryUser, tags=["Admin - Delivery Users"])
async def get_delivery_user(
    user_id: str,
    service: DeliveryUserService = Depends(get_service),
):
    return service.get(user_id)


@router.put("/{user_id}", response_model=DeliveryUser, tags=["Admin - Delivery Users"])
async def update_delivery_user(
    user_id: str,
    item: DeliveryUserUpdate,
    service: DeliveryUserService = Depends(get_service),
):
    return service.update(user_id, item)


@router.delete("/{user_id}", response_model=MessageResponse, tags=["Admin - Delivery Users"])
async def delete_delivery_user(
    user_id: str,
    service: DeliveryUserService = Depends(get_service),
):
    service.delete(user_id)
    return MessageResponse(message="Delivery user deleted successfully", id=user_id)

