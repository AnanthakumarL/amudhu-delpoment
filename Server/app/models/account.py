from typing import Any

from pydantic import BaseModel, Field


class AccountBase(BaseModel):
    """Base account model."""

    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    role: str = Field(default="user", max_length=50)
    is_active: bool = True
    attributes: dict[str, Any] = {}


class AccountCreate(AccountBase):
    """Account creation model."""


class AccountUpdate(BaseModel):
    """Account update model."""

    name: str | None = Field(None, min_length=1, max_length=200)
    email: str | None = Field(None, min_length=3, max_length=320)
    role: str | None = Field(None, max_length=50)
    is_active: bool | None = None
    attributes: dict[str, Any] | None = None


class Account(AccountBase):
    """Account response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
