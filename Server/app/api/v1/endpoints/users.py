import math

from fastapi import APIRouter, Depends, Query

from app.db.database import get_db
from app.models.auth import AuthUserOut
from app.models.common import PaginatedResponse
from app.services.user_service import UserService

router = APIRouter()


def get_service(db=Depends(get_db)) -> UserService:
    return UserService(db)


@router.get("", response_model=PaginatedResponse[AuthUserOut], tags=["Admin - Users"])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
    production_only: bool = False,
    service: UserService = Depends(get_service),
):
    items, total = service.list(
        page=page,
        page_size=page_size,
        is_active=is_active,
        production_only=production_only,
    )

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )

