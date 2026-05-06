from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import ProductionUserORM
from app.models.production_user import ProductionUser, ProductionUserCreate, ProductionUserUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_pu(row) -> ProductionUser:
    return ProductionUser(
        id=str(row.id), name=row.name, identifier=row.identifier,
        production_address=row.production_address, is_active=row.is_active,
        attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class ProductionUserService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: ProductionUserCreate) -> ProductionUser:
        try:
            data = item.model_dump()
            if data.get("password"):
                from app.core.security import hash_password
                data["password_hash"] = hash_password(data.pop("password"))
            else:
                data.pop("password", None)
            row = ProductionUserORM(**data)
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_pu(row)
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to create production user: {e!s}")

    def get(self, uid: str) -> ProductionUser:
        try:
            row = self.db.query(ProductionUserORM).filter(ProductionUserORM.id == uid).first()
            if not row:
                raise NotFoundException(f"Production user {uid} not found")
            return _to_pu(row)
        except NotFoundException:
            raise
        except Exception as e:
            raise DatabaseException(f"Failed to fetch production user: {e!s}")

    def list(self, page=1, page_size=20) -> tuple:
        try:
            q = self.db.query(ProductionUserORM).order_by(ProductionUserORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_pu(r) for r in rows], total
        except Exception as e:
            raise DatabaseException(f"Failed to list production users: {e!s}")

    def update(self, uid: str, item: ProductionUserUpdate) -> ProductionUser:
        try:
            row = self.db.query(ProductionUserORM).filter(ProductionUserORM.id == uid).first()
            if not row:
                raise NotFoundException(f"Production user {uid} not found")
            data = filter_none_values(item.model_dump())
            if data.get("password"):
                from app.core.security import hash_password
                data["password_hash"] = hash_password(data.pop("password"))
            for k, v in data.items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_pu(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to update production user: {e!s}")

    def delete(self, uid: str) -> bool:
        try:
            row = self.db.query(ProductionUserORM).filter(ProductionUserORM.id == uid).first()
            if not row:
                raise NotFoundException(f"Production user {uid} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            raise DatabaseException(f"Failed to delete production user: {e!s}")
