import math

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response

from app.db.database import get_db
from app.core.config import get_settings
from app.core.exceptions import NotFoundException
from app.models.common import MessageResponse, PaginatedResponse
from app.models.product import Product, ProductCreate, ProductUpdate
from app.services.product_service import ProductService

router = APIRouter()
settings = get_settings()


def get_service(db=Depends(get_db)):
    return ProductService(db)


@router.post("", response_model=Product, status_code=status.HTTP_201_CREATED, tags=["Admin - Products"])
async def create_product(
    product: ProductCreate,
    service: ProductService = Depends(get_service),
):
    """Create a new product"""
    return service.create_product(product)


@router.post(
    "/with-image",
    response_model=Product,
    status_code=status.HTTP_201_CREATED,
    tags=["Admin - Products"],
)
async def create_product_with_image(
    request: Request,
    name: str = Form(...),
    price: float = Form(...),
    description: str | None = Form(None),
    compare_at_price: float | None = Form(None),
    cost: float | None = Form(None),
    category_id: str | None = Form(None),
    section_id: str | None = Form(None),
    sku: str | None = Form(None),
    inventory_quantity: int = Form(0),
    is_active: bool = Form(True),
    featured: bool = Form(False),
    discount_percentage: float = Form(0.0),
    slug: str | None = Form(None),
    image: UploadFile = File(...),
    service: ProductService = Depends(get_service),
):
    """Create a new product with an uploaded image stored in MongoDB."""

    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image type")

    image_bytes = await image.read()
    max_bytes = 5 * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large (max 5MB)")

    created = service.create_product(
        ProductCreate(
            name=name,
            description=description,
            price=price,
            compare_at_price=compare_at_price,
            cost=cost,
            category_id=category_id or None,
            section_id=section_id or None,
            sku=sku,
            inventory_quantity=inventory_quantity,
            image_url=None,
            is_active=is_active,
            featured=featured,
            discount_percentage=discount_percentage,
            attributes={},
            slug=slug,
        )
    )

    image_url = (
        str(request.base_url).rstrip("/")
        + settings.API_V1_PREFIX
        + f"/products/{created.id}/image"
    )
    return service.set_product_image(
        created.id,
        image_bytes=image_bytes,
        mime_type=image.content_type,
        filename=image.filename,
        image_url=image_url,
    )


@router.get("", response_model=PaginatedResponse[Product], tags=["Admin - Products"])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category_id: str | None = None,
    section_id: str | None = None,
    is_active: bool | None = None,
    featured: bool | None = None,
    service: ProductService = Depends(get_service),
):
    """List all products with pagination and filters"""
    products, total = service.list_products(
        page, page_size, category_id, section_id, is_active, featured,
    )

    return PaginatedResponse(
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total > 0 else 0,
        data=products,
    )


@router.get("/search", response_model=list[Product], tags=["Admin - Products"])
async def search_products(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    service: ProductService = Depends(get_service),
):
    """Search products using semantic search"""
    return service.search_products(q, limit)


@router.get("/{product_id}", response_model=Product, tags=["Admin - Products"])
async def get_product(
    product_id: str,
    service: ProductService = Depends(get_service),
):
    """Get product by ID"""
    return service.get_product(product_id)


@router.get("/{product_id}/image", tags=["Admin - Products"])
async def get_product_image(
    product_id: str,
    service: ProductService = Depends(get_service),
):
    """Serve a product image stored in MongoDB."""
    try:
        image_bytes, mime_type = service.get_product_image(product_id)
    except NotFoundException:
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    return Response(content=image_bytes, media_type=mime_type)


@router.post("/{product_id}/image", response_model=Product, tags=["Admin - Products"])
async def upload_product_image(
    product_id: str,
    request: Request,
    image: UploadFile = File(...),
    service: ProductService = Depends(get_service),
):
    """Upload/replace a product image stored in MongoDB."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image type")

    image_bytes = await image.read()
    max_bytes = 5 * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image is too large (max 5MB)")

    image_url = (
        str(request.base_url).rstrip("/")
        + settings.API_V1_PREFIX
        + f"/products/{product_id}/image"
    )
    return service.set_product_image(
        product_id,
        image_bytes=image_bytes,
        mime_type=image.content_type,
        filename=image.filename,
        image_url=image_url,
    )


@router.put("/{product_id}", response_model=Product, tags=["Admin - Products"])
async def update_product(
    product_id: str,
    product: ProductUpdate,
    service: ProductService = Depends(get_service),
):
    """Update product"""
    return service.update_product(product_id, product)


@router.delete("/{product_id}", response_model=MessageResponse, tags=["Admin - Products"])
async def delete_product(
    product_id: str,
    service: ProductService = Depends(get_service),
):
    """Delete product"""
    service.delete_product(product_id)
    return MessageResponse(message="Product deleted successfully", id=product_id)

