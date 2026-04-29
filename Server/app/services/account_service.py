from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import AccountORM
from app.models.account import Account, AccountCreate, AccountUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)


def _to_account(row: AccountORM) -> Account:
    return Account(
        id=str(row.id),
        name=row.name,
        email=row.email,
        role=row.role,
        is_active=row.is_active,
        attributes=row.attributes or {},
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class AccountService:
    def __init__(self, db: Session):
        self.db = db

    def create(self, item: AccountCreate) -> Account:
        try:
            row = AccountORM(**item.model_dump())
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_account(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating account: {e}")
            raise DatabaseException(f"Failed to create account: {e!s}")

    def get_by_phone(self, phone: str) -> Account | None:
        try:
            rows = self.db.query(AccountORM).filter(AccountORM.is_active == True).all()
            for row in rows:
                attrs = row.attributes or {}
                if attrs.get("phone") == phone:
                    return _to_account(row)
            return None
        except Exception as e:
            logger.error(f"Error fetching account by phone: {e}")
            raise DatabaseException(f"Failed to fetch account: {e!s}")

    def get(self, account_id: str) -> Account:
        try:
            row = self.db.query(AccountORM).filter(AccountORM.id == account_id).first()
            if not row:
                raise NotFoundException(f"Account with ID {account_id} not found")
            return _to_account(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching account: {e}")
            raise DatabaseException(f"Failed to fetch account: {e!s}")

    def list(self, page: int = 1, page_size: int = 20) -> tuple:
        try:
            q = self.db.query(AccountORM).order_by(AccountORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_account(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing accounts: {e}")
            raise DatabaseException(f"Failed to list accounts: {e!s}")

    def update(self, account_id: str, item: AccountUpdate) -> Account:
        try:
            row = self.db.query(AccountORM).filter(AccountORM.id == account_id).first()
            if not row:
                raise NotFoundException(f"Account with ID {account_id} not found")
            for k, v in filter_none_values(item.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_account(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating account: {e}")
            raise DatabaseException(f"Failed to update account: {e!s}")

    def delete(self, account_id: str) -> bool:
        try:
            row = self.db.query(AccountORM).filter(AccountORM.id == account_id).first()
            if not row:
                raise NotFoundException(f"Account with ID {account_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting account: {e}")
            raise DatabaseException(f"Failed to delete account: {e!s}")
