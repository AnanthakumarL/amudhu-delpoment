from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import DeliveryManagementORM
from app.models.delivery_management import DeliveryManagement, DeliveryManagementCreate, DeliveryManagementUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_dm(row) -> DeliveryManagement:
    return DeliveryManagement(
        id=str(row.id), order_id=str(row.order_id) if row.order_id else None,
        tracking_number=row.tracking_number,
        delivery_date=row.delivery_date.isoformat() if row.delivery_date else None,
        status=row.status, contact_name=row.contact_name, contact_phone=row.contact_phone,
        address=row.address, delivery_identifier=row.delivery_identifier,
        delivery_assigned_at=row.delivery_assigned_at.isoformat() if row.delivery_assigned_at else None,
        notes=row.notes, attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class DeliveryManagementService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: DeliveryManagementCreate) -> DeliveryManagement:
        try:
            row = DeliveryManagementORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_dm(row)
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to create delivery management: {e!s}")

    def get(self, dm_id: str) -> DeliveryManagement:
        try:
            row = self.db.query(DeliveryManagementORM).filter(DeliveryManagementORM.id == dm_id).first()
            if not row:
                raise NotFoundException(f"Delivery management {dm_id} not found")
            return _to_dm(row)
        except NotFoundException:
            raise
        except Exception as e:
            raise DatabaseException(f"Failed to fetch delivery management: {e!s}")

    def list(self, page=1, page_size=20, status=None, delivery_identifier=None) -> tuple:
        try:
            q = self.db.query(DeliveryManagementORM)
            if status:
                q = q.filter(DeliveryManagementORM.status == status)
            if delivery_identifier:
                q = q.filter(DeliveryManagementORM.delivery_identifier == delivery_identifier)
            q = q.order_by(DeliveryManagementORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_dm(r) for r in rows], total
        except Exception as e:
            raise DatabaseException(f"Failed to list delivery managements: {e!s}")

    def update(self, dm_id: str, item: DeliveryManagementUpdate) -> DeliveryManagement:
        try:
            row = self.db.query(DeliveryManagementORM).filter(DeliveryManagementORM.id == dm_id).first()
            if not row:
                raise NotFoundException(f"Delivery management {dm_id} not found")
            data = filter_none_values(item.model_dump())
            if "delivery_identifier" in data and data["delivery_identifier"]:
                data["delivery_assigned_at"] = datetime.utcnow()
            for k, v in data.items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_dm(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to update delivery management: {e!s}")

    def delete(self, dm_id: str) -> bool:
        try:
            row = self.db.query(DeliveryManagementORM).filter(DeliveryManagementORM.id == dm_id).first()
            if not row:
                raise NotFoundException(f"Delivery management {dm_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to delete delivery management: {e!s}")
