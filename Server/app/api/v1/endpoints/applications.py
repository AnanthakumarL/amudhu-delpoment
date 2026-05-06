import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.application import Application, ApplicationCreate, ApplicationUpdate
from app.models.common import MessageResponse, PaginatedResponse
from app.services.application_service import ApplicationService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return ApplicationService(db)


@router.post("", response_model=Application, status_code=status.HTTP_201_CREATED, tags=["Admin - Applications"])
async def create_application(
    item: ApplicationCreate,
    service: ApplicationService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[Application], tags=["Admin - Applications"])
async def list_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    job_id: str | None = None,
    status: str | None = None,
    service: ApplicationService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, job_id=job_id, status=status)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{application_id}", response_model=Application, tags=["Admin - Applications"])
async def get_application(
    application_id: str,
    service: ApplicationService = Depends(get_service),
):
    return service.get(application_id)


@router.put("/{application_id}", response_model=Application, tags=["Admin - Applications"])
async def update_application(
    application_id: str,
    item: ApplicationUpdate,
    service: ApplicationService = Depends(get_service),
):
    return service.update(application_id, item)


@router.delete("/{application_id}", response_model=MessageResponse, tags=["Admin - Applications"])
async def delete_application(
    application_id: str,
    service: ApplicationService = Depends(get_service),
):
    service.delete(application_id)
    return MessageResponse(message="Application deleted successfully", id=application_id)

