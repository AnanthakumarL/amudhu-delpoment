from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import ProductionManagementORM
from app.models.production_management import ProductionManagement, ProductionManagementCreate, ProductionManagementUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_pm(row) -> ProductionManagement:
    return ProductionManagement(
        id=str(row.id), name=row.name,
        production_date=row.production_date.isoformat() if row.production_date else None,
        status=row.status, quantity=row.quantity,
        product_id=str(row.product_id) if row.product_id else None,
        notes=row.notes, attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class ProductionManagementService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: ProductionManagementCreate) -> ProductionManagement:
        try:
            row = ProductionManagementORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_pm(row)
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to create production management: {e!s}")

    def get(self, pm_id: str) -> ProductionManagement:
        try:
            row = self.db.query(ProductionManagementORM).filter(ProductionManagementORM.id == pm_id).first()
            if not row:
                raise NotFoundException(f"Production management {pm_id} not found")
            return _to_pm(row)
        except NotFoundException:
            raise
        except Exception as e:
            raise DatabaseException(f"Failed to fetch production management: {e!s}")

    def list(self, page=1, page_size=20, status=None) -> tuple:
        try:
            q = self.db.query(ProductionManagementORM)
            if status:
                q = q.filter(ProductionManagementORM.status == status)
            q = q.order_by(ProductionManagementORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_pm(r) for r in rows], total
        except Exception as e:
            raise DatabaseException(f"Failed to list production managements: {e!s}")

    def update(self, pm_id: str, item: ProductionManagementUpdate) -> ProductionManagement:
        try:
            row = self.db.query(ProductionManagementORM).filter(ProductionManagementORM.id == pm_id).first()
            if not row:
                raise NotFoundException(f"Production management {pm_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_pm(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to update production management: {e!s}")

    def delete(self, pm_id: str) -> bool:
        try:
            row = self.db.query(ProductionManagementORM).filter(ProductionManagementORM.id == pm_id).first()
            if not row:
                raise NotFoundException(f"Production management {pm_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to delete production management: {e!s}")
