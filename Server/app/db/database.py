"""PostgreSQL database engine and session factory (SQLAlchemy)."""
from __future__ import annotations
import re

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Rewrite the URL to use pg8000 (pure-Python driver, no DLL required).
# Replace postgresql:// or postgresql+psycopg2:// → postgresql+pg8000://
_url = re.sub(r"^postgresql(\+psycopg2)?://", "postgresql+pg8000://", settings.DATABASE_URL)

# Use NullPool when connecting via Supabase pgbouncer/pooler (port 6543)
_use_nullpool = ":6543" in _url
engine = create_engine(
    _url,
    pool_pre_ping=True,
    **({"poolclass": NullPool} if _use_nullpool else {"pool_size": 10, "max_overflow": 20}),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """FastAPI dependency — yields a DB session and closes it afterward."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database connection check failed: {e}")
        return False
