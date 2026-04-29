#!/usr/bin/env python3
"""Script to populate sample ecommerce data"""

import json
from app.db.weaviate_client import weaviate_client
from app.services.section_service import SectionService
from app.services.category_service import CategoryService
from app.services.product_service import ProductService
from app.services.site_config_service import SiteConfigService
from app.models.site_config import SiteConfigUpdate


def populate_sample_data():
    """Populate database with sample ecommerce data"""
    
    client = weaviate_client.connect()
    
    # Initialize services
    section_service = SectionService(client)
    category_service = CategoryService(client)
    product_service = ProductService(client)
    site_config_service = SiteConfigService(client)
    
    print("🚀 Populating sample ecommerce data...")
    
    # Update site config
    print("\n📝 Updating site configuration...")
    config_update = SiteConfigUpdate(
        company_name="TechStore India",
        header_text="Welcome to TechStore India",
        tagline="Your one-stop shop for quality tech products",
        primary_color="#7c3aed",
        secondary_color="#ffffff",
        contact_email="support@techstore.in",
        contact_phone="+91-800-TECH-NOW",
        address="123 Tech Street, Bangalore, Karnataka 560001",
        logo_url="https://via.placeholder.com/200x50/7c3aed/ffffff?text=TechStore",
        currency="INR",
        currency_symbol="₹",
        tax_rate=18.0,
        free_shipping_threshold=500.0,
        banner_enabled=True,
        banner_text="🎉 Free shipping on orders above ₹500! Limited time offer!",
        banner_link="/shop",
        banner_color="#7c3aed"
    )
    site_config_service.update_config(config_update)
    print("✅ Site config updated")
    
    # Create sections
    print("\n📦 Creating sections...")
    sections_data = [
        {"name": "Electronics", "description": "Phones, tablets, computers and accessories", "order": 1},
        {"name": "Computers & Tablets", "description": "Laptops, desktops, tablets and accessories", "order": 2},
        {"name": "Smart Home", "description": "IoT devices and home automation", "order": 3},
        {"name": "Audio & Video", "description": "Headphones, speakers and entertainment", "order": 4},
    ]
    
    sections = {}
    for sec_data in sections_data:
        from app.models.section import SectionCreate
        section = section_service.create_section(SectionCreate(**sec_data))
        sections[sec_data["name"]] = section
        print(f"  ✓ Created section: {sec_data['name']}")
    
    # Create categories
    print("\n📁 Creating categories...")
    categories_data = [
        {"name": "Smartphones", "section_name": "Electronics", "description": "Latest smartphones and mobile devices"},
        {"name": "Laptops", "section_name": "Computers & Tablets", "description": "Portable computers for work and play"},
        {"name": "Tablets", "section_name": "Computers & Tablets", "description": "Tablets for entertainment and productivity"},
        {"name": "Smart Speakers", "section_name": "Smart Home", "description": "Voice-controlled speakers"},
        {"name": "Headphones", "section_name": "Audio & Video", "description": "Wired and wireless headphones"},
        {"name": "Wireless Earbuds", "section_name": "Audio & Video", "description": "True wireless earbuds"},
    ]
    
    categories = {}
    for cat_data in categories_data:
        from app.models.category import CategoryCreate
        section_id = sections[cat_data["section_name"]].id
        category = category_service.create_category(CategoryCreate(
            name=cat_data["name"],
            description=cat_data["description"],
            section_id=section_id,
            order=1
        ))
        categories[cat_data["name"]] = category
        print(f"  ✓ Created category: {cat_data['name']}")
    
    # Create products
    print("\n🛍️  Creating products...")
    products_data = [
        {
            "name": "iPhone 15 Pro",
            "category": "Smartphones",
            "description": "Latest iPhone with A17 Pro chip, titanium design, and advanced camera system",
            "price": 82999.00,
            "compare_at_price": 91299.00,
            "cost": 58100.00,
            "sku": "IPHONE15PRO",
            "inventory_quantity": 50,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/1d1d1f/ffffff?text=iPhone+15+Pro"
        },
        {
            "name": "Samsung Galaxy S24 Ultra",
            "category": "Smartphones",
            "description": "Premium Android flagship with S Pen, 200MP camera, and AI features",
            "price": 99599.00,
            "compare_at_price": 107899.00,
            "cost": 70550.00,
            "sku": "GALAXYS24U",
            "inventory_quantity": 30,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/5f5f5f/ffffff?text=Galaxy+S24"
        },
        {
            "name": "MacBook Pro 16\"",
            "category": "Laptops",
            "description": "Powerful laptop with M3 Pro chip, Liquid Retina XDR display, 18-hour battery",
            "price": 207499.00,
            "compare_at_price": 224099.00,
            "cost": 149400.00,
            "sku": "MBP16M3",
            "inventory_quantity": 20,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/000000/ffffff?text=MacBook+Pro"
        },
        {
            "name": "Dell XPS 15",
            "category": "Laptops",
            "description": "Premium Windows laptop with Intel i9, OLED display, and sleek design",
            "price": 157699.00,
            "cost": 107900.00,
            "sku": "DELLXPS15",
            "inventory_quantity": 25,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/0076ce/ffffff?text=Dell+XPS"
        },
        {
            "name": "iPad Pro 12.9\"",
            "category": "Tablets",
            "description": "Ultimate iPad with M2 chip, Liquid Retina XDR display, and ProMotion",
            "price": 91299.00,
            "cost": 62250.00,
            "sku": "IPADPRO129",
            "inventory_quantity": 40,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/1d1d1f/ffffff?text=iPad+Pro"
        },
        {
            "name": "Samsung Galaxy Tab S9",
            "category": "Tablets",
            "description": "Premium Android tablet with AMOLED display and S Pen included",
            "price": 66399.00,
            "compare_at_price": 74699.00,
            "cost": 45650.00,
            "sku": "TABS9",
            "inventory_quantity": 35,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/5f5f5f/ffffff?text=Tab+S9"
        },
        {
            "name": "Amazon Echo Dot (5th Gen)",
            "category": "Smart Speakers",
            "description": "Compact smart speaker with Alexa, improved audio, and smart home hub",
            "price": 4149.00,
            "compare_at_price": 4979.00,
            "cost": 2075.00,
            "sku": "ECHODOT5",
            "inventory_quantity": 100,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/232f3e/ffffff?text=Echo+Dot"
        },
        {
            "name": "Google Nest Audio",
            "category": "Smart Speakers",
            "description": "Smart speaker with Google Assistant, premium sound, and voice match",
            "price": 8299.00,
            "cost": 4150.00,
            "sku": "NESTAUDIO",
            "inventory_quantity": 60,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/4285f4/ffffff?text=Nest+Audio"
        },
        {
            "name": "Sony WH-1000XM5",
            "category": "Headphones",
            "description": "Industry-leading noise cancelling headphones with exceptional sound quality",
            "price": 33199.00,
            "compare_at_price": 37349.00,
            "cost": 20750.00,
            "sku": "SONYWH1000XM5",
            "inventory_quantity": 45,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/000000/ffffff?text=WH-1000XM5"
        },
        {
            "name": "Bose QuietComfort Ultra",
            "category": "Headphones",
            "description": "Premium headphones with spatial audio and world-class noise cancellation",
            "price": 35689.00,
            "cost": 23240.00,
            "sku": "BOSEQCUHED",
            "inventory_quantity": 30,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/000000/ffffff?text=Bose+QC"
        },
        {
            "name": "AirPods Pro (2nd Gen)",
            "category": "Wireless Earbuds",
            "description": "Premium wireless earbuds with adaptive audio, transparency mode, and MagSafe",
            "price": 20749.00,
            "compare_at_price": 23239.00,
            "cost": 12450.00,
            "sku": "AIRPODSPRO2",
            "inventory_quantity": 80,
            "featured": True,
            "image_url": "https://via.placeholder.com/400x400/ffffff/000000?text=AirPods+Pro"
        },
        {
            "name": "Samsung Galaxy Buds2 Pro",
            "category": "Wireless Earbuds",
            "description": "Premium earbuds with intelligent ANC, 360 audio, and seamless connectivity",
            "price": 19079.00,
            "cost": 10790.00,
            "sku": "BUDS2PRO",
            "inventory_quantity": 70,
            "featured": False,
            "image_url": "https://via.placeholder.com/400x400/5f5f5f/ffffff?text=Buds2+Pro"
        },
    ]
    
    from app.models.product import ProductCreate
    for prod_data in products_data:
        category_name = prod_data.pop("category")
        category = categories[category_name]
        section_id = category.section_id
        
        product = product_service.create_product(ProductCreate(
            **prod_data,
            category_id=category.id,
            section_id=section_id
        ))
        print(f"  ✓ Created product: {prod_data['name']}")
    
    print("\n✨ Sample data population complete!")
    print(f"   • {len(sections)} sections")
    print(f"   • {len(categories)} categories")  
    print(f"   • {len(products_data)} products")
    print("\n🌐 Visit http://localhost:3001 to see your store!")
    
    weaviate_client.close()


if __name__ == "__main__":
    populate_sample_data()
