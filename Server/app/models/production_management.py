from typing import Any

from pydantic import BaseModel, Field


class ProductionManagementBase(BaseModel):
    """Base production management model."""

    name: str = Field(..., min_length=1, max_length=300)
    production_date: str | None = None
    status: str = Field(default="planned", max_length=50)
    quantity: int = Field(default=0, ge=0)
    product_id: str | None = None
    notes: str | None = None
    attributes: dict[str, Any] = {}


class ProductionManagementCreate(ProductionManagementBase):
    """Production management creation model."""


class ProductionManagementUpdate(BaseModel):
    """Production management update model."""

    name: str | None = Field(None, min_length=1, max_length=300)
    production_date: str | None = None
    status: str | None = Field(None, max_length=50)
    quantity: int | None = Field(None, ge=0)
    product_id: str | None = None
    notes: str | None = None
    attributes: dict[str, Any] | None = None


class ProductionManagement(ProductionManagementBase):
    """Production management response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
