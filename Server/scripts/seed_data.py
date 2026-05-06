"""Seed database with sample data"""
import sys

sys.path.insert(0, ".")

from app.core.logging import get_logger
from app.db.weaviate_client import weaviate_client
from app.models.category import CategoryCreate
from app.models.order import OrderCreate, OrderItem
from app.models.product import ProductCreate
from app.models.section import SectionCreate
from app.services.category_service import CategoryService
from app.services.order_service import OrderService
from app.services.product_service import ProductService
from app.services.section_service import SectionService

logger = get_logger(__name__)


def seed_data():
    """Seed database with sample data"""
    logger.info("Seeding database with sample data...")

    try:
        client = weaviate_client.connect()

        # Create services
        section_service = SectionService(client)
        category_service = CategoryService(client)
        product_service = ProductService(client)
        order_service = OrderService(client)

        # Create sections
        logger.info("Creating sections...")
        section1 = section_service.create_section(SectionCreate(
            title="Home Page",
            description="Main landing page section",
            order=1,
            is_active=True,
        ))

        section2 = section_service.create_section(SectionCreate(
            title="Featured Products",
            description="Showcase featured products",
            order=2,
            is_active=True,
            parent_section_id=section1.id,
        ))

        # Create categories
        logger.info("Creating categories...")
        electronics = category_service.create_category(CategoryCreate(
            name="Electronics",
            description="Electronic devices and gadgets",
            order=1,
            is_active=True,
        ))

        phones = category_service.create_category(CategoryCreate(
            name="Smartphones",
            description="Mobile phones and accessories",
            parent_category_id=electronics.id,
            order=1,
            is_active=True,
        ))

        clothing = category_service.create_category(CategoryCreate(
            name="Clothing",
            description="Apparel and fashion",
            order=2,
            is_active=True,
        ))

        # Create products
        logger.info("Creating products...")
        product1 = product_service.create_product(ProductCreate(
            name="iPhone 15 Pro",
            description="Latest iPhone with advanced features",
            price=999.99,
            category_id=phones.id,
            section_id=section2.id,
            sku="IP15PRO-001",
            stock_quantity=50,
            images=["https://example.com/iphone15.jpg"],
            is_active=True,
            featured=True,
            discount_percentage=10.0,
            attributes={"color": "Titanium Blue", "storage": "256GB"},
        ))

        product2 = product_service.create_product(ProductCreate(
            name="Samsung Galaxy S24",
            description="Powerful Android smartphone",
            price=899.99,
            category_id=phones.id,
            section_id=section2.id,
            sku="SGS24-001",
            stock_quantity=75,
            images=["https://example.com/galaxy-s24.jpg"],
            is_active=True,
            featured=True,
            discount_percentage=5.0,
            attributes={"color": "Phantom Black", "storage": "128GB"},
        ))

        product3 = product_service.create_product(ProductCreate(
            name="Classic T-Shirt",
            description="Comfortable cotton t-shirt",
            price=29.99,
            category_id=clothing.id,
            sku="TSHIRT-001",
            stock_quantity=200,
            images=["https://example.com/tshirt.jpg"],
            is_active=True,
            featured=False,
            attributes={"size": "M", "color": "Navy Blue"},
        ))

        # Create sample order
        logger.info("Creating sample orders...")
        order1 = order_service.create_order(OrderCreate(
            customer_name="John Doe",
            customer_email="john.doe@example.com",
            customer_phone="+1-555-1234",
            shipping_address="123 Main St, Anytown, USA 12345",
            billing_address="123 Main St, Anytown, USA 12345",
            items=[
                OrderItem(
                    product_id=product1.id,
                    product_name=product1.name,
                    quantity=1,
                    price=product1.price,
                    subtotal=product1.price,
                ),
                OrderItem(
                    product_id=product3.id,
                    product_name=product3.name,
                    quantity=2,
                    price=product3.price,
                    subtotal=product3.price * 2,
                ),
            ],
            subtotal=1059.97,
            tax=84.80,
            shipping_cost=15.00,
            total=1159.77,
            status="pending",
            notes="Please deliver during business hours",
        ))

        logger.info("Sample data seeded successfully!")
        logger.info(f"Created sections: {section1.id}, {section2.id}")
        logger.info(f"Created categories: {electronics.id}, {phones.id}, {clothing.id}")
        logger.info(f"Created products: {product1.id}, {product2.id}, {product3.id}")
        logger.info(f"Created order: {order1.order_number}")

    except Exception as e:
        logger.error(f"Failed to seed data: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        weaviate_client.close()


if __name__ == "__main__":
    seed_data()
