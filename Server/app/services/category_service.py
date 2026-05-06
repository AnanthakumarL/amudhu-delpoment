from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import CategoryORM
from app.models.category import Category, CategoryCreate, CategoryUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)


def _to_category(row: CategoryORM) -> Category:
    return Category(
        id=str(row.id),
        name=row.name,
        description=row.description,
        section_id=str(row.section_id) if row.section_id else None,
        parent_category_id=str(row.parent_category_id) if row.parent_category_id else None,
        is_active=row.is_active,
        order=row.order,
        slug=row.slug,
        image_url=row.image_url,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class CategoryService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: CategoryCreate) -> Category:
        try:
            row = CategoryORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_category(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating category: {e}")
            raise DatabaseException(f"Failed to create category: {e!s}")

    def get(self, category_id: str) -> Category:
        try:
            row = self.db.query(CategoryORM).filter(CategoryORM.id == category_id).first()
            if not row:
                raise NotFoundException(f"Category {category_id} not found")
            return _to_category(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching category: {e}")
            raise DatabaseException(f"Failed to fetch category: {e!s}")

    def list(self, page: int = 1, page_size: int = 20, section_id: str | None = None) -> tuple:
        try:
            q = self.db.query(CategoryORM)
            if section_id:
                q = q.filter(CategoryORM.section_id == section_id)
            q = q.order_by(CategoryORM.order.asc(), CategoryORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_category(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing categories: {e}")
            raise DatabaseException(f"Failed to list categories: {e!s}")

    def update(self, category_id: str, item: CategoryUpdate) -> Category:
        try:
            row = self.db.query(CategoryORM).filter(CategoryORM.id == category_id).first()
            if not row:
                raise NotFoundException(f"Category {category_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_category(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating category: {e}")
            raise DatabaseException(f"Failed to update category: {e!s}")

    def delete(self, category_id: str) -> bool:
        try:
            row = self.db.query(CategoryORM).filter(CategoryORM.id == category_id).first()
            if not row:
                raise NotFoundException(f"Category {category_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting category: {e}")
            raise DatabaseException(f"Failed to delete category: {e!s}")

    # Aliases expected by the endpoint layer
    def create_category(self, item): return self.create(item)
    def get_category(self, category_id): return self.get(category_id)
    def list_categories(self, page, page_size, parent_id=None): return self.list(page, page_size)
    def update_category(self, category_id, item): return self.update(category_id, item)
    def delete_category(self, category_id): return self.delete(category_id)
