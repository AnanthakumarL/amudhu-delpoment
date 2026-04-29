"""Supabase Storage client for product images."""
from __future__ import annotations

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
settings = get_settings()

_supabase_client = None


def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        from supabase import create_client
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client


def upload_product_image(product_id: str, image_bytes: bytes, mime_type: str, filename: str | None = None) -> str:
    """Upload image bytes to Supabase Storage and return public URL."""
    client = get_supabase()
    ext = (filename or "image").rsplit(".", 1)[-1] if filename and "." in (filename or "") else _mime_to_ext(mime_type)
    path = f"{product_id}.{ext}"
    bucket = settings.SUPABASE_STORAGE_BUCKET

    # upsert so re-uploading replaces existing file
    client.storage.from_(bucket).upload(
        path,
        image_bytes,
        {"content-type": mime_type, "upsert": "true"},
    )

    result = client.storage.from_(bucket).get_public_url(path)
    return result


def delete_product_image(product_id: str) -> None:
    try:
        client = get_supabase()
        bucket = settings.SUPABASE_STORAGE_BUCKET
        # Try common extensions
        for ext in ("jpg", "jpeg", "png", "webp", "gif"):
            try:
                client.storage.from_(bucket).remove([f"{product_id}.{ext}"])
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"Failed to delete image for product {product_id}: {e}")


def _mime_to_ext(mime_type: str) -> str:
    mapping = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    return mapping.get(mime_type, "jpg")
