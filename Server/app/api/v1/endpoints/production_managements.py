import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.production_management import (
    ProductionManagement,
    ProductionManagementCreate,
    ProductionManagementUpdate,
)
from app.services.production_management_service import ProductionManagementService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return ProductionManagementService(db)


@router.post("", response_model=ProductionManagement, status_code=status.HTTP_201_CREATED, tags=["Admin - Production Management"])
async def create_production_management(
    item: ProductionManagementCreate,
    service: ProductionManagementService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[ProductionManagement], tags=["Admin - Production Management"])
async def list_production_managements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    service: ProductionManagementService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, status=status)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{item_id}", response_model=ProductionManagement, tags=["Admin - Production Management"])
async def get_production_management(
    item_id: str,
    service: ProductionManagementService = Depends(get_service),
):
    return service.get(item_id)


@router.put("/{item_id}", response_model=ProductionManagement, tags=["Admin - Production Management"])
async def update_production_management(
    item_id: str,
    item: ProductionManagementUpdate,
    service: ProductionManagementService = Depends(get_service),
):
    return service.update(item_id, item)


@router.delete("/{item_id}", response_model=MessageResponse, tags=["Admin - Production Management"])
async def delete_production_management(
    item_id: str,
    service: ProductionManagementService = Depends(get_service),
):
    service.delete(item_id)
    return MessageResponse(message="Production management deleted successfully", id=item_id)

