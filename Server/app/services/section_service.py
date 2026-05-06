from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import SectionORM
from app.models.section import Section, SectionCreate, SectionUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)


def _to_section(row: SectionORM) -> Section:
    return Section(
        id=str(row.id),
        name=row.name,
        description=row.description,
        order=row.order,
        is_active=row.is_active,
        parent_section_id=str(row.parent_section_id) if row.parent_section_id else None,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class SectionService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: SectionCreate) -> Section:
        try:
            row = SectionORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_section(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating section: {e}")
            raise DatabaseException(f"Failed to create section: {e!s}")

    def get(self, section_id: str) -> Section:
        try:
            row = self.db.query(SectionORM).filter(SectionORM.id == section_id).first()
            if not row:
                raise NotFoundException(f"Section {section_id} not found")
            return _to_section(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching section: {e}")
            raise DatabaseException(f"Failed to fetch section: {e!s}")

    def list(self, page: int = 1, page_size: int = 20) -> tuple:
        try:
            q = self.db.query(SectionORM).order_by(SectionORM.order.asc(), SectionORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_section(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing sections: {e}")
            raise DatabaseException(f"Failed to list sections: {e!s}")

    def update(self, section_id: str, item: SectionUpdate) -> Section:
        try:
            row = self.db.query(SectionORM).filter(SectionORM.id == section_id).first()
            if not row:
                raise NotFoundException(f"Section {section_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_section(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating section: {e}")
            raise DatabaseException(f"Failed to update section: {e!s}")

    def delete(self, section_id: str) -> bool:
        try:
            row = self.db.query(SectionORM).filter(SectionORM.id == section_id).first()
            if not row:
                raise NotFoundException(f"Section {section_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting section: {e}")
            raise DatabaseException(f"Failed to delete section: {e!s}")

    # Aliases expected by the endpoint layer
    def create_section(self, item): return self.create(item)
    def get_section(self, section_id): return self.get(section_id)
    def list_sections(self, page, page_size, parent_id=None): return self.list(page, page_size)
    def update_section(self, section_id, item): return self.update(section_id, item)
    def delete_section(self, section_id): return self.delete(section_id)
