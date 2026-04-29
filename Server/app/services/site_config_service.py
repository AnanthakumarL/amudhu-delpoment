from datetime import datetime
from sqlalchemy.orm import Session
from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import SiteConfigORM
from app.models.site_config import SiteConfig, SiteConfigUpdate
from app.utils.helpers import filter_none_values

logger = get_logger(__name__)

def _to_config(row) -> SiteConfig:
    return SiteConfig(
        id=str(row.id), company_name=row.company_name, logo_url=row.logo_url,
        header_text=row.header_text, tagline=row.tagline,
        primary_color=row.primary_color, secondary_color=row.secondary_color,
        contact_email=row.contact_email, contact_phone=row.contact_phone, address=row.address,
        banner_enabled=row.banner_enabled, banner_text=row.banner_text,
        banner_link=row.banner_link, banner_color=row.banner_color,
        currency_symbol=row.currency_symbol, tax_rate=float(row.tax_rate or 0),
        free_shipping_threshold=float(row.free_shipping_threshold or 0),
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )

class SiteConfigService:
    def __init__(self, db: Session):
        self.db = db

    def get_config(self) -> SiteConfig:
        try:
            row = self.db.query(SiteConfigORM).first()
            if not row:
                raise NotFoundException("Site config not found")
            return _to_config(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching site config: {e}")
            raise DatabaseException(f"Failed to fetch site config: {e!s}")

    def update_config(self, update: SiteConfigUpdate) -> SiteConfig:
        try:
            row = self.db.query(SiteConfigORM).first()
            if not row:
                raise NotFoundException("Site config not found")
            for k, v in filter_none_values(update.model_dump()).items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_config(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating site config: {e}")
            raise DatabaseException(f"Failed to update site config: {e!s}")
