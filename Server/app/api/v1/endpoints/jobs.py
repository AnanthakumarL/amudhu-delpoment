import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.job import Job, JobCreate, JobUpdate
from app.services.job_service import JobService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return JobService(db)


@router.post("", response_model=Job, status_code=status.HTTP_201_CREATED, tags=["Admin - Jobs"])
async def create_job(
    item: JobCreate,
    service: JobService = Depends(get_service),
):
    return service.create(item)


@router.get("", response_model=PaginatedResponse[Job], tags=["Admin - Jobs"])
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    service: JobService = Depends(get_service),
):
    items, total = service.list(page=page, page_size=page_size, status=status)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=items,
    )


@router.get("/{job_id}", response_model=Job, tags=["Admin - Jobs"])
async def get_job(
    job_id: str,
    service: JobService = Depends(get_service),
):
    return service.get(job_id)


@router.put("/{job_id}", response_model=Job, tags=["Admin - Jobs"])
async def update_job(
    job_id: str,
    item: JobUpdate,
    service: JobService = Depends(get_service),
):
    return service.update(job_id, item)


@router.delete("/{job_id}", response_model=MessageResponse, tags=["Admin - Jobs"])
async def delete_job(
    job_id: str,
    service: JobService = Depends(get_service),
):
    service.delete(job_id)
    return MessageResponse(message="Job deleted successfully", id=job_id)

