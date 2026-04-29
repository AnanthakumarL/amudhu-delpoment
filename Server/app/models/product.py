from typing import Any

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    """Base product model"""

    name: str = Field(..., min_length=1, max_length=300)
    description: str | None = None
    price: float = Field(..., gt=0)
    compare_at_price: float | None = None
    cost: float | None = None
    category_id: str | None = None
    section_id: str | None = None
    sku: str | None = Field(None, max_length=100)
    inventory_quantity: int = Field(default=0, ge=0)
    image_url: str | None = None
    is_active: bool = True
    featured: bool = False
    discount_percentage: float = Field(default=0.0, ge=0, le=100)
    attributes: dict[str, Any] = {}
    slug: str | None = None


class ProductCreate(ProductBase):
    """Product creation model"""



class ProductUpdate(BaseModel):
    """Product update model"""

    name: str | None = Field(None, min_length=1, max_length=300)
    description: str | None = None
    price: float | None = Field(None, gt=0)
    compare_at_price: float | None = None
    cost: float | None = None
    category_id: str | None = None
    section_id: str | None = None
    sku: str | None = Field(None, max_length=100)
    inventory_quantity: int | None = Field(None, ge=0)
    image_url: str | None = None
    is_active: bool | None = None
    featured: bool | None = None
    discount_percentage: float | None = Field(None, ge=0, le=100)
    attributes: dict[str, Any] | None = None
    slug: str | None = None


class Product(ProductBase):
    """Product response model"""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
