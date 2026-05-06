import re
from datetime import datetime
from typing import Any


def generate_slug(text: str) -> str:
    """Generate a URL-friendly slug from text"""
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text


def get_current_timestamp() -> str:
    """Get current UTC timestamp in ISO format"""
    return datetime.utcnow().isoformat()


def filter_none_values(data: dict[str, Any]) -> dict[str, Any]:
    """Remove None values from dictionary"""
    return {k: v for k, v in data.items() if v is not None}
