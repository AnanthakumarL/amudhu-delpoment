from typing import Any

from pydantic import BaseModel, Field


class DeliveryUser(BaseModel):
    """Delivery user response model.

    This is designed to be compatible with delivery app documents stored in the
    `delivery_users` collection (often created by the Delivery app backend).
    """

    id: str

    # Common fields
    name: str = ""
    identifier: str = ""  # usually phone or login id
    is_active: bool = True

    # Delivery app fields (optional)
    phone: str | None = None
    login_id: str | None = None
    email: str | None = None
    is_production_account: bool = False
    last_login: str | None = None

    created_at: str | None = None
    updated_at: str | None = None

    attributes: dict[str, Any] = {}


class DeliveryUserCreate(BaseModel):
    """Delivery user creation model (not used by admin UI currently)."""

    name: str = Field(..., min_length=1, max_length=200)
    identifier: str = Field(..., min_length=3, max_length=320)
    is_active: bool = True
    password: str = Field(..., min_length=6, max_length=255)
    attributes: dict[str, Any] = {}


class DeliveryUserUpdate(BaseModel):
    """Delivery user update model (not used by admin UI currently)."""

    name: str | None = Field(None, min_length=1, max_length=200)
    identifier: str | None = Field(None, min_length=3, max_length=320)
    is_active: bool | None = None
    attributes: dict[str, Any] | None = None
