from datetime import datetime

from weaviate.classes.config import Configure, DataType, Property

from app.core.logging import get_logger

logger = get_logger(__name__)


def create_schema(client):
    """Create all Weaviate collections for the ecommerce platform"""
    logger.info("Creating Weaviate schema...")

    # Delete existing collections if they exist (for fresh setup)
    collections_to_delete = ["SiteConfig", "Section", "Category", "Product", "Order"]
    for collection_name in collections_to_delete:
        try:
            client.collections.delete(collection_name)
            logger.info(f"Deleted existing collection: {collection_name}")
        except Exception as e:
            logger.debug(f"Collection {collection_name} does not exist: {e}")

    # 1. SiteConfig Collection
    client.collections.create(
        name="SiteConfig",
        description="Website configuration and branding",
        properties=[
            Property(name="company_name", data_type=DataType.TEXT),
            Property(name="logo_url", data_type=DataType.TEXT),
            Property(name="header_text", data_type=DataType.TEXT),
            Property(name="tagline", data_type=DataType.TEXT),
            Property(name="primary_color", data_type=DataType.TEXT),
            Property(name="secondary_color", data_type=DataType.TEXT),
            Property(name="contact_email", data_type=DataType.TEXT),
            Property(name="contact_phone", data_type=DataType.TEXT),
            Property(name="address", data_type=DataType.TEXT),
            # Banner/Announcement
            Property(name="banner_enabled", data_type=DataType.BOOL),
            Property(name="banner_text", data_type=DataType.TEXT),
            Property(name="banner_link", data_type=DataType.TEXT),
            Property(name="banner_color", data_type=DataType.TEXT),
            # Currency & Tax
            Property(name="currency_symbol", data_type=DataType.TEXT),
            Property(name="tax_rate", data_type=DataType.NUMBER),
            Property(name="free_shipping_threshold", data_type=DataType.NUMBER),
            Property(name="created_at", data_type=DataType.TEXT),
            Property(name="updated_at", data_type=DataType.TEXT),
        ],
    )
    logger.info("Created SiteConfig collection")

    # 2. Section Collection
    client.collections.create(
        name="Section",
        description="Website sections and subsections",
        properties=[
            Property(name="name", data_type=DataType.TEXT),
            Property(name="description", data_type=DataType.TEXT),
            Property(name="order", data_type=DataType.INT),
            Property(name="is_active", data_type=DataType.BOOL),
            Property(name="parent_section_id", data_type=DataType.TEXT),
            Property(name="created_at", data_type=DataType.TEXT),
            Property(name="updated_at", data_type=DataType.TEXT),
        ],
        vectorizer_config=Configure.Vectorizer.text2vec_transformers(),
    )
    logger.info("Created Section collection")

    # 3. Category Collection
    client.collections.create(
        name="Category",
        description="Product categories and subcategories",
        properties=[
            Property(name="name", data_type=DataType.TEXT),
            Property(name="description", data_type=DataType.TEXT),
            Property(name="section_id", data_type=DataType.TEXT),
            Property(name="parent_category_id", data_type=DataType.TEXT),
            Property(name="is_active", data_type=DataType.BOOL),
            Property(name="order", data_type=DataType.INT),
            Property(name="slug", data_type=DataType.TEXT),
            Property(name="image_url", data_type=DataType.TEXT),
            Property(name="created_at", data_type=DataType.TEXT),
            Property(name="updated_at", data_type=DataType.TEXT),
        ],
        vectorizer_config=Configure.Vectorizer.text2vec_transformers(),
    )
    logger.info("Created Category collection")

    # 4. Product Collection
    client.collections.create(
        name="Product",
        description="Products and items for sale",
        properties=[
            Property(name="name", data_type=DataType.TEXT),
            Property(name="description", data_type=DataType.TEXT),
            Property(name="price", data_type=DataType.NUMBER),
            Property(name="compare_at_price", data_type=DataType.NUMBER),
            Property(name="cost", data_type=DataType.NUMBER),
            Property(name="category_id", data_type=DataType.TEXT),
            Property(name="section_id", data_type=DataType.TEXT),
            Property(name="sku", data_type=DataType.TEXT),
            Property(name="inventory_quantity", data_type=DataType.INT),
            Property(name="image_url", data_type=DataType.TEXT),
            Property(name="is_active", data_type=DataType.BOOL),
            Property(name="featured", data_type=DataType.BOOL),
            Property(name="discount_percentage", data_type=DataType.NUMBER),
            Property(name="attributes_json", data_type=DataType.TEXT),  # Store as JSON string
            Property(name="slug", data_type=DataType.TEXT),
            Property(name="created_at", data_type=DataType.TEXT),
            Property(name="updated_at", data_type=DataType.TEXT),
        ],
        vectorizer_config=Configure.Vectorizer.text2vec_transformers(),
    )
    logger.info("Created Product collection")

    # 5. Order Collection
    client.collections.create(
        name="Order",
        description="Customer orders",
        properties=[
            Property(name="order_number", data_type=DataType.TEXT),
            Property(name="customer_name", data_type=DataType.TEXT),
            Property(name="customer_email", data_type=DataType.TEXT),
            Property(name="customer_phone", data_type=DataType.TEXT),
            Property(name="shipping_address", data_type=DataType.TEXT),
            Property(name="billing_address", data_type=DataType.TEXT),
            Property(name="items_json", data_type=DataType.TEXT),  # Store items as JSON string
            Property(name="subtotal", data_type=DataType.NUMBER),
            Property(name="tax", data_type=DataType.NUMBER),
            Property(name="shipping_cost", data_type=DataType.NUMBER),
            Property(name="total", data_type=DataType.NUMBER),
            Property(name="status", data_type=DataType.TEXT),
            Property(name="notes", data_type=DataType.TEXT),
            Property(name="created_at", data_type=DataType.TEXT),
            Property(name="updated_at", data_type=DataType.TEXT),
        ],
    )
    logger.info("Created Order collection")

    logger.info("All collections created successfully!")


def initialize_default_config(client):
    """Initialize default site configuration"""
    logger.info("Initializing default site configuration...")

    site_config = client.collections.get("SiteConfig")
    now = datetime.utcnow().isoformat()

    # Check if config already exists
    result = site_config.query.fetch_objects(limit=1)

    if len(result.objects) == 0:
        site_config.data.insert({
            "company_name": "My E-Commerce Store",
            "logo_url": "",
            "header_text": "Welcome to Our Store",
            "tagline": "Quality Products at Great Prices",
            "primary_color": "#1a73e8",
            "secondary_color": "#ffffff",
            "contact_email": "info@mystore.com",
            "contact_phone": "+1-234-567-8900",
            "address": "123 Main Street, City, Country",
            "created_at": now,
            "updated_at": now,
        })
        logger.info("Default site configuration created!")
    else:
        logger.info("Site configuration already exists")


def check_schema(client):
    """Check if schema exists"""
    try:
        collections = ["SiteConfig", "Section", "Category", "Product", "Order"]
        for collection_name in collections:
            client.collections.get(collection_name)
        return True
    except:
        return False
