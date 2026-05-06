import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.production_user import ProductionUser, ProductionUserCreate, ProductionUserUpdate
from app.services.production_user_service import ProductionUserService

router = APIRouter()


def get_service(db=Depends(get_db)) -> ProductionUserService:
    return ProductionUserService(db)


@router.post("", response_model=ProductionUser, status_code=status.HTTP_201_CREATED, tags=["Admin - Production Users"])
async def create_production_user(
    item: ProductionUserCreate,
    service: ProductionUserService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[ProductionUser], tags=["Admin - Production Users"])
async def list_production_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
    service: ProductionUserService = Depends(get_service),
):
    items, total = service.list(
        page=page,
        page_size=page_size,
        is_active=is_active,
    )

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{user_id}", response_model=ProductionUser, tags=["Admin - Production Users"])
async def get_production_user(
    user_id: str,
    service: ProductionUserService = Depends(get_service),
):
    return service.get(user_id)


@router.put("/{user_id}", response_model=ProductionUser, tags=["Admin - Production Users"])
async def update_production_user(
    user_id: str,
    item: ProductionUserUpdate,
    service: ProductionUserService = Depends(get_service),
):
    return service.update(user_id, item)


@router.delete("/{user_id}", response_model=MessageResponse, tags=["Admin - Production Users"])
async def delete_production_user(
    user_id: str,
    service: ProductionUserService = Depends(get_service),
):
    service.delete(user_id)
    return MessageResponse(message="Production user deleted successfully", id=user_id)

