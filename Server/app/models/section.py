
from pydantic import BaseModel, Field


class SectionBase(BaseModel):
    """Base section model"""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    order: int = Field(default=0, ge=0)
    is_active: bool = True
    parent_section_id: str | None = None


class SectionCreate(SectionBase):
    """Section creation model"""



class SectionUpdate(BaseModel):
    """Section update model"""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    order: int | None = Field(None, ge=0)
    is_active: bool | None = None
    parent_section_id: str | None = None


class Section(SectionBase):
    """Section response model"""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
