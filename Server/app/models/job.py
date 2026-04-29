from typing import Any

from pydantic import BaseModel, Field


class JobBase(BaseModel):
    """Base job model."""

    title: str = Field(..., min_length=1, max_length=300)
    status: str = Field(default="pending", max_length=50)
    scheduled_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    notes: str | None = None
    attributes: dict[str, Any] = {}


class JobCreate(JobBase):
    """Job creation model."""


class JobUpdate(BaseModel):
    """Job update model."""

    title: str | None = Field(None, min_length=1, max_length=300)
    status: str | None = Field(None, max_length=50)
    scheduled_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    notes: str | None = None
    attributes: dict[str, Any] | None = None


class Job(JobBase):
    """Job response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
