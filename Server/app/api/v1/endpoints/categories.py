import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.category import Category, CategoryCreate, CategoryUpdate
from app.models.common import MessageResponse, PaginatedResponse
from app.services.category_service import CategoryService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return CategoryService(db)


@router.post("", response_model=Category, status_code=status.HTTP_201_CREATED, tags=["Admin - Categories"])
async def create_category(
    category: CategoryCreate,
    service: CategoryService = Depends(get_service),
):
    """Create a new category"""
    return service.create_category(category)


@router.get("", response_model=PaginatedResponse[Category], tags=["Admin - Categories"])
async def list_categories(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    parent_id: str | None = None,
    service: CategoryService = Depends(get_service),
):
    """List all categories with pagination"""
    categories, total = service.list_categories(page, page_size, parent_id)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=categories,
    )


@router.get("/{category_id}", response_model=Category, tags=["Admin - Categories"])
async def get_category(
    category_id: str,
    service: CategoryService = Depends(get_service),
):
    """Get category by ID"""
    return service.get_category(category_id)


@router.put("/{category_id}", response_model=Category, tags=["Admin - Categories"])
async def update_category(
    category_id: str,
    category: CategoryUpdate,
    service: CategoryService = Depends(get_service),
):
    """Update category"""
    return service.update_category(category_id, category)


@router.delete("/{category_id}", response_model=MessageResponse, tags=["Admin - Categories"])
async def delete_category(
    category_id: str,
    service: CategoryService = Depends(get_service),
):
    """Delete category"""
    service.delete_category(category_id)
    return MessageResponse(message="Category deleted successfully", id=category_id)

