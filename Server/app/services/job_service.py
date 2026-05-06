from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import JobORM
from app.models.job import Job, JobCreate, JobUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_job(row) -> Job:
    return Job(
        id=str(row.id), title=row.title, status=row.status,
        scheduled_at=row.scheduled_at.isoformat() if row.scheduled_at else None,
        started_at=row.started_at.isoformat() if row.started_at else None,
        finished_at=row.finished_at.isoformat() if row.finished_at else None,
        notes=row.notes, attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class JobService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: JobCreate) -> Job:
        try:
            row = JobORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_job(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating job: {e}")
            raise DatabaseException(f"Failed to create job: {e!s}")

    def get(self, job_id: str) -> Job:
        try:
            row = self.db.query(JobORM).filter(JobORM.id == job_id).first()
            if not row:
                raise NotFoundException(f"Job {job_id} not found")
            return _to_job(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching job: {e}")
            raise DatabaseException(f"Failed to fetch job: {e!s}")

    def list(self, page=1, page_size=20, status=None) -> tuple:
        try:
            q = self.db.query(JobORM)
            if status:
                q = q.filter(JobORM.status == status)
            q = q.order_by(JobORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_job(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing jobs: {e}")
            raise DatabaseException(f"Failed to list jobs: {e!s}")

    def update(self, job_id: str, item: JobUpdate) -> Job:
        try:
            row = self.db.query(JobORM).filter(JobORM.id == job_id).first()
            if not row:
                raise NotFoundException(f"Job {job_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_job(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to update job: {e!s}")

    def delete(self, job_id: str) -> bool:
        try:
            row = self.db.query(JobORM).filter(JobORM.id == job_id).first()
            if not row:
                raise NotFoundException(f"Job {job_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to delete job: {e!s}")
