from fastapi import APIRouter
from app.core.config import get_settings
from app.db.database import check_db_connection
from app.models.common import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    settings = get_settings()
    db_ok = check_db_connection()
    return HealthResponse(
        status="healthy" if db_ok else "degraded",
        version=settings.APP_VERSION,
        weaviate_connected=db_ok,
    )
