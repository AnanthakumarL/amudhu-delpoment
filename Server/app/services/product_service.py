from datetime import datetime

from sqlalchemy.orm import Session

from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import ProductORM
from app.db.storage import delete_product_image, upload_product_image
from app.models.product import Product, ProductCreate, ProductUpdate
from app.utils.helpers import filter_none_values, generate_slug

logger = get_logger(__name__)


def _to_product(row: ProductORM) -> Product:
    return Product(
        id=str(row.id),
        name=row.name,
        description=row.description,
        price=float(row.price),
        compare_at_price=float(row.compare_at_price) if row.compare_at_price is not None else None,
        cost=float(row.cost) if row.cost is not None else None,
        category_id=str(row.category_id) if row.category_id else None,
        section_id=str(row.section_id) if row.section_id else None,
        sku=row.sku,
        inventory_quantity=row.inventory_quantity or 0,
        image_url=row.image_url,
        is_active=row.is_active,
        featured=row.featured,
        discount_percentage=float(row.discount_percentage) if row.discount_percentage is not None else None,
        attributes=row.attributes or {},
        slug=row.slug,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


class ProductService:
    def __init__(self, db: Session):
        self.db = db

    def set_product_image(
        self,
        product_id: str,
        image_bytes: bytes,
        mime_type: str,
        filename: str | None = None,
        image_url: str | None = None,
    ) -> Product:
        try:
            row = self.db.query(ProductORM).filter(ProductORM.id == product_id).first()
            if not row:
                raise NotFoundException(f"Product {product_id} not found")
            # Upload to Supabase Storage and get public URL
            public_url = upload_product_image(product_id, image_bytes, mime_type, filename)
            row.image_url = public_url
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_product(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error setting product image: {e}")
            raise DatabaseException(f"Failed to set product image: {e!s}")

    def get_product_image(self, product_id: str) -> tuple[bytes, str]:
        raise NotFoundException("Images are served via Supabase Storage public URL (use image_url field)")

    def create_product(self, product: ProductCreate) -> Product:
        try:
            data = product.model_dump()
            if not data.get("slug"):
                data["slug"] = generate_slug(data["name"])
            row = ProductORM(**data)
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_product(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating product: {e}")
            raise DatabaseException(f"Failed to create product: {e!s}")

    def get_product(self, product_id: str) -> Product:
        try:
            row = self.db.query(ProductORM).filter(ProductORM.id == product_id).first()
            if not row:
                raise NotFoundException(f"Product {product_id} not found")
            return _to_product(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching product: {e}")
            raise DatabaseException(f"Failed to fetch product: {e!s}")

    def list_products(
        self,
        page: int = 1,
        page_size: int = 20,
        category_id: str | None = None,
        section_id: str | None = None,
        is_active: bool | None = None,
        featured: bool | None = None,
    ) -> tuple:
        try:
            q = self.db.query(ProductORM)
            if category_id:
                q = q.filter(ProductORM.category_id == category_id)
            if section_id:
                q = q.filter(ProductORM.section_id == section_id)
            if is_active is not None:
                q = q.filter(ProductORM.is_active == is_active)
            if featured is not None:
                q = q.filter(ProductORM.featured == featured)
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_product(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing products: {e}")
            raise DatabaseException(f"Failed to list products: {e!s}")

    def update_product(self, product_id: str, product_update: ProductUpdate) -> Product:
        try:
            row = self.db.query(ProductORM).filter(ProductORM.id == product_id).first()
            if not row:
                raise NotFoundException(f"Product {product_id} not found")
            update_data = filter_none_values(product_update.model_dump())
            if "name" in update_data and not update_data.get("slug"):
                update_data["slug"] = generate_slug(update_data["name"])
            for k, v in update_data.items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            return _to_product(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating product: {e}")
            raise DatabaseException(f"Failed to update product: {e!s}")

    def delete_product(self, product_id: str) -> bool:
        try:
            row = self.db.query(ProductORM).filter(ProductORM.id == product_id).first()
            if not row:
                raise NotFoundException(f"Product {product_id} not found")
            delete_product_image(product_id)
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting product: {e}")
            raise DatabaseException(f"Failed to delete product: {e!s}")

    def search_products(self, query: str, limit: int = 10) -> list[Product]:
        try:
            pattern = f"%{query}%"
            rows = (
                self.db.query(ProductORM)
                .filter(
                    ProductORM.name.ilike(pattern)
                    | ProductORM.description.ilike(pattern)
                    | ProductORM.slug.ilike(pattern)
                )
                .limit(limit)
                .all()
            )
            return [_to_product(r) for r in rows]
        except Exception as e:
            logger.error(f"Error searching products: {e}")
            raise DatabaseException(f"Failed to search products: {e!s}")
