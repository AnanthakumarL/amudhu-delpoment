from __future__ import annotations

from datetime import datetime

from pymongo.database import Database

from app.core.logging import get_logger

logger = get_logger(__name__)


def ensure_indexes(db: Database) -> None:
    """Create minimal indexes used by queries."""
    db["orders"].create_index("order_number", unique=True)
    db["orders"].create_index("customer_identifier")
    db["orders"].create_index("customer_email")
    db["orders"].create_index("production_identifier")
    db["categories"].create_index("parent_category_id")
    db["sections"].create_index("parent_section_id")
    db["products"].create_index("category_id")
    db["products"].create_index("section_id")
    db["products"].create_index("is_active")
    db["products"].create_index("featured")
    db["accounts"].create_index("email", unique=True)
    db["accounts"].create_index("role")
    db["accounts"].create_index("is_active")
    db["accounts"].create_index("created_at")
    db["users"].create_index("identifier", unique=True)
    db["users"].create_index("created_at")
    db["production_users"].create_index("identifier", unique=True)
    db["production_users"].create_index("is_active")
    db["production_users"].create_index("created_at")
    db["otp_requests"].create_index("purpose")
    db["otp_requests"].create_index("identifier")
    db["otp_requests"].create_index("expires_at")
    db["otp_requests"].create_index("created_at")
    db["jobs"].create_index("status")
    db["jobs"].create_index("scheduled_at")
    db["jobs"].create_index("created_at")
    db["applications"].create_index("job_id")
    db["applications"].create_index("status")
    db["applications"].create_index("applicant_email")
    db["applications"].create_index("created_at")
    db["production_managements"].create_index("status")
    db["production_managements"].create_index("production_date")
    db["delivery_managements"].create_index("status")
    # Delivery list queries filter by status and sort by created_at.
    db["delivery_managements"].create_index([("created_at", -1)])
    db["delivery_managements"].create_index([("status", 1), ("created_at", -1)])
    db["delivery_managements"].create_index("delivery_date")
    db["delivery_managements"].create_index("order_id")


def initialize_default_site_config(db: Database) -> None:
    """Insert a default site config document if none exists."""
    collection = db["site_config"]
    existing = collection.find_one({})
    if existing is not None:
        return

    now = datetime.utcnow().isoformat()
    collection.insert_one(
        {
            "company_name": "My E-Commerce Store",
            "logo_url": "",
            "header_text": "Welcome to Our Store",
            "tagline": "Quality Products at Great Prices",
            "primary_color": "#1a73e8",
            "secondary_color": "#ffffff",
            "contact_email": "info@mystore.com",
            "contact_phone": "+1-234-567-8900",
            "address": "123 Main Street, City, Country",
            "banner_enabled": False,
            "banner_text": None,
            "banner_link": None,
            "banner_color": "#0ea5e9",
            "currency_symbol": "₹",
            "tax_rate": 18.0,
            "free_shipping_threshold": 500.0,
            "created_at": now,
            "updated_at": now,
        }
    )
    logger.info("Default site configuration created")
