from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class MessageResponse(BaseModel):
    """Generic message response"""

    message: str
    id: str | None = None


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response model"""

    total: int
    page: int
    page_size: int
    total_pages: int
    data: list[T]


class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    version: str
    weaviate_connected: bool
