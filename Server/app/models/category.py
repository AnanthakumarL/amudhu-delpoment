
from pydantic import BaseModel, Field


class CategoryBase(BaseModel):
    """Base category model"""

    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    section_id: str | None = None
    parent_category_id: str | None = None
    is_active: bool = True
    order: int = Field(default=0, ge=0)
    slug: str | None = None
    image_url: str | None = None


class CategoryCreate(CategoryBase):
    """Category creation model"""

    section_id: str



class CategoryUpdate(BaseModel):
    """Category update model"""

    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    section_id: str | None = None
    parent_category_id: str | None = None
    is_active: bool | None = None
    order: int | None = Field(None, ge=0)
    slug: str | None = None
    image_url: str | None = None


class Category(CategoryBase):
    """Category response model"""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
