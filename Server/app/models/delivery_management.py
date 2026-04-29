from typing import Any

from pydantic import BaseModel, Field


class DeliveryManagementBase(BaseModel):
    """Base delivery management model."""

    order_id: str | None = None
    tracking_number: str | None = Field(None, max_length=100)
    delivery_date: str | None = None
    status: str = Field(default="pending", max_length=50)
    contact_name: str | None = Field(None, max_length=200)
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    notes: str | None = None

    # Assignment (for Delivery app)
    delivery_identifier: str | None = Field(default=None, min_length=1, max_length=320)
    delivery_assigned_at: str | None = None

    attributes: dict[str, Any] = {}


class DeliveryManagementCreate(DeliveryManagementBase):
    """Delivery management creation model."""


class DeliveryManagementUpdate(BaseModel):
    """Delivery management update model."""

    order_id: str | None = None
    tracking_number: str | None = Field(None, max_length=100)
    delivery_date: str | None = None
    status: str | None = Field(None, max_length=50)
    contact_name: str | None = Field(None, max_length=200)
    contact_phone: str | None = Field(None, max_length=50)
    address: str | None = None
    notes: str | None = None

    delivery_identifier: str | None = Field(default=None, min_length=1, max_length=320)
    delivery_assigned_at: str | None = None

    attributes: dict[str, Any] | None = None


class DeliveryManagement(DeliveryManagementBase):
    """Delivery management response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
