from fastapi import APIRouter, Depends, status

from app.db.database import get_db
from app.models.site_config import SiteConfig, SiteConfigCreate, SiteConfigUpdate
from app.services.site_config_service import SiteConfigService

router = APIRouter()


def get_service(db=Depends(get_db)):
    return SiteConfigService(db)


@router.get("", response_model=SiteConfig, tags=["Admin - Site Config"])
async def get_site_config(service: SiteConfigService = Depends(get_service)):
    """Get site configuration"""
    return service.get_config()


@router.post("", response_model=SiteConfig, status_code=status.HTTP_201_CREATED, tags=["Admin - Site Config"])
async def create_site_config(
    config: SiteConfigCreate,
    service: SiteConfigService = Depends(get_service),
):
    """Create site configuration (only if none exists)"""
    return service.create_config(config)


@router.put("", response_model=SiteConfig, tags=["Admin - Site Config"])
async def update_site_config(
    config: SiteConfigUpdate,
    service: SiteConfigService = Depends(get_service),
):
    """Update site configuration"""
    return service.update_config(config)

