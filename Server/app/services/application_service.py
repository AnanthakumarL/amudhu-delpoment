from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import ApplicationORM
from app.models.application import Application, ApplicationCreate, ApplicationUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_app(row) -> Application:
    return Application(
        id=str(row.id), job_id=str(row.job_id) if row.job_id else None,
        job_title=row.job_title, applicant_name=row.applicant_name,
        applicant_email=row.applicant_email, applicant_phone=row.applicant_phone,
        message=row.message, resume_url=row.resume_url, status=row.status,
        attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class ApplicationService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: ApplicationCreate) -> Application:
        try:
            row = ApplicationORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_app(row)
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to create application: {e!s}")

    def get(self, app_id: str) -> Application:
        try:
            row = self.db.query(ApplicationORM).filter(ApplicationORM.id == app_id).first()
            if not row:
                raise NotFoundException(f"Application {app_id} not found")
            return _to_app(row)
        except NotFoundException:
            raise
        except Exception as e:
            raise DatabaseException(f"Failed to fetch application: {e!s}")

    def list(self, page=1, page_size=20, job_id=None, status=None) -> tuple:
        try:
            q = self.db.query(ApplicationORM)
            if job_id:
                q = q.filter(ApplicationORM.job_id == job_id)
            if status:
                q = q.filter(ApplicationORM.status == status)
            q = q.order_by(ApplicationORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_app(r) for r in rows], total
        except Exception as e:
            raise DatabaseException(f"Failed to list applications: {e!s}")

    def update(self, app_id: str, item: ApplicationUpdate) -> Application:
        try:
            row = self.db.query(ApplicationORM).filter(ApplicationORM.id == app_id).first()
            if not row:
                raise NotFoundException(f"Application {app_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_app(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to update application: {e!s}")

    def delete(self, app_id: str) -> bool:
        try:
            row = self.db.query(ApplicationORM).filter(ApplicationORM.id == app_id).first()
            if not row:
                raise NotFoundException(f"Application {app_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to delete application: {e!s}")
