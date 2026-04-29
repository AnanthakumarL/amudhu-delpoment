
from pydantic import BaseModel, Field


class SiteConfigBase(BaseModel):
    """Base site configuration model"""

    company_name: str = Field(..., min_length=1, max_length=200)
    logo_url: str | None = None
    header_text: str | None = None
    tagline: str | None = None
    primary_color: str = "#000000"
    secondary_color: str = "#FFFFFF"
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    
    # Announcement/Banner Settings
    banner_enabled: bool = False
    banner_text: str | None = None
    banner_link: str | None = None
    banner_color: str = "#0ea5e9"
    
    # Currency & Tax Settings
    currency_symbol: str = "₹"
    tax_rate: float = 18.0  # GST percentage
    free_shipping_threshold: float = 500.0  # Rupees


class SiteConfigCreate(SiteConfigBase):
    """Site configuration creation model"""



class SiteConfigUpdate(BaseModel):
    """Site configuration update model"""

    company_name: str | None = Field(None, min_length=1, max_length=200)
    logo_url: str | None = None
    header_text: str | None = None
    tagline: str | None = None
    primary_color: str | None = None
    secondary_color: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    
    # Announcement/Banner Settings
    banner_enabled: bool | None = None
    banner_text: str | None = None
    banner_link: str | None = None
    banner_color: str | None = None
    
    # Currency & Tax Settings
    currency_symbol: str | None = None
    tax_rate: float | None = None
    free_shipping_threshold: float | None = None


class SiteConfig(SiteConfigBase):
    """Site configuration response model"""

    id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
