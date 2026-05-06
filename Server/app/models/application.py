from typing import Any

from pydantic import BaseModel, EmailStr, Field


class ApplicationBase(BaseModel):
    """Base job application model."""

    job_id: str | None = None
    job_title: str | None = None

    applicant_name: str = Field(..., min_length=1, max_length=200)
    applicant_email: EmailStr | None = None
    applicant_phone: str | None = None

    message: str | None = None
    resume_url: str | None = None

    status: str = Field(default="new", max_length=50)
    attributes: dict[str, Any] = {}


class ApplicationCreate(ApplicationBase):
    """Application creation model."""


class ApplicationUpdate(BaseModel):
    """Application update model."""

    job_id: str | None = None
    job_title: str | None = None

    applicant_name: str | None = Field(None, min_length=1, max_length=200)
    applicant_email: EmailStr | None = None
    applicant_phone: str | None = None

    message: str | None = None
    resume_url: str | None = None

    status: str | None = Field(None, max_length=50)
    attributes: dict[str, Any] | None = None


class Application(ApplicationBase):
    """Application response model."""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
