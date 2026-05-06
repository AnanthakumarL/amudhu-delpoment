from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.database import check_db_connection, engine
from app.db.orm_models import Base

logger = get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting application...")
    try:
        Base.metadata.create_all(bind=engine)
        if check_db_connection():
            logger.info("PostgreSQL (Supabase) connected and tables ensured")
        else:
            logger.warning("PostgreSQL connection check failed — running in degraded mode")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

    yield

    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="E-commerce backend API powered by Supabase (PostgreSQL)",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": f"{settings.API_V1_PREFIX}/health",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=settings.DEBUG)
