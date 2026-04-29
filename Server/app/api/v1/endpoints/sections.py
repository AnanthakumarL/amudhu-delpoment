import math

from fastapi import APIRouter, Depends, Query, status

from app.db.database import get_db
from app.models.common import MessageResponse, PaginatedResponse
from app.models.section import Section, SectionCreate, SectionUpdate
from app.services.section_service import SectionService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return SectionService(db)


@router.post("", response_model=Section, status_code=status.HTTP_201_CREATED, tags=["Admin - Sections"])
async def create_section(
    section: SectionCreate,
    service: SectionService = Depends(get_service),
):
    """Create a new section"""
    return service.create_section(section)


@router.get("", response_model=PaginatedResponse[Section], tags=["Admin - Sections"])
async def list_sections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    parent_id: str | None = None,
    service: SectionService = Depends(get_service),
):
    """List all sections with pagination"""
    sections, total = service.list_sections(page, page_size, parent_id)

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=sections,
    )


@router.get("/{section_id}", response_model=Section, tags=["Admin - Sections"])
async def get_section(
    section_id: str,
    service: SectionService = Depends(get_service),
):
    """Get section by ID"""
    return service.get_section(section_id)


@router.put("/{section_id}", response_model=Section, tags=["Admin - Sections"])
async def update_section(
    section_id: str,
    section: SectionUpdate,
    service: SectionService = Depends(get_service),
):
    """Update section"""
    return service.update_section(section_id, section)


@router.delete("/{section_id}", response_model=MessageResponse, tags=["Admin - Sections"])
async def delete_section(
    section_id: str,
    service: SectionService = Depends(get_service),
):
    """Delete section"""
    service.delete_section(section_id)
    return MessageResponse(message="Section deleted successfully", id=section_id)

