from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import UserORM
from app.models.auth import AuthUserOut

logger = get_logger(__name__)

def _to_user(row) -> AuthUserOut:
    return AuthUserOut(
        id=str(row.id), name=row.name, identifier=row.identifier,
        is_active=row.is_active,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class UserService:
    def __init__(self, db: Session):
        self.db = db

    def list_users(self, page: int = 1, page_size: int = 20) -> tuple:
        try:
            q = self.db.query(UserORM).order_by(UserORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_user(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing users: {e}")
            raise DatabaseException(f"Failed to list users: {e!s}")
