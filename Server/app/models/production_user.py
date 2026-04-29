from typing import Any

from pydantic import BaseModel, Field


class ProductionUserBase(BaseModel):
    """Base production user model."""

    name: str = Field(..., min_length=1, max_length=200)
    identifier: str = Field(..., min_length=3, max_length=320)
    production_address: str = Field(..., min_length=1, max_length=2000)
    is_active: bool = True
    attributes: dict[str, Any] = {}


class ProductionUserCreate(ProductionUserBase):
    """Production user creation model."""

    password: str = Field(..., min_length=6, max_length=255)


class ProductionUserUpdate(BaseModel):
    """Production user update model."""

    name: str | None = Field(None, min_length=1, max_length=200)
    identifier: str | None = Field(None, min_length=3, max_length=320)
    production_address: str | None = Field(None, min_length=1, max_length=2000)
    is_active: bool | None = None
    attributes: dict[str, Any] | None = None


class ProductionUser(ProductionUserBase):
    """Production user response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
