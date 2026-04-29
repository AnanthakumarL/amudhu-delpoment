"""SQLAlchemy ORM models for Supabase (PostgreSQL)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.utcnow()


class Base(DeclarativeBase):
    pass


class SectionORM(Base):
    __tablename__ = "sections"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    parent_section_id = Column(UUID(as_uuid=False), ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    categories = relationship("CategoryORM", back_populates="section")


class CategoryORM(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    section_id = Column(UUID(as_uuid=False), ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    parent_category_id = Column(UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    slug = Column(String(300), nullable=True)
    image_url = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    section = relationship("SectionORM", back_populates="categories")
    products = relationship("ProductORM", back_populates="category")


class ProductORM(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False, default=0.0)
    compare_at_price = Column(Float, nullable=True)
    cost = Column(Float, nullable=True)
    category_id = Column(UUID(as_uuid=False), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    section_id = Column(UUID(as_uuid=False), ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    sku = Column(String(200), nullable=True)
    inventory_quantity = Column(Integer, default=0)
    image_url = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    featured = Column(Boolean, default=False)
    discount_percentage = Column(Float, nullable=True)
    attributes = Column(JSONB, default=dict)
    slug = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    category = relationship("CategoryORM", back_populates="products")
    order_items = relationship("OrderItemORM", back_populates="product")
    production_managements = relationship("ProductionManagementORM", back_populates="product")


class UserORM(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    identifier = Column(String(300), unique=True, nullable=False)
    password_hash = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class ProductionUserORM(Base):
    __tablename__ = "production_users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    identifier = Column(String(300), unique=True, nullable=False)
    production_address = Column(Text, nullable=True)
    password_hash = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class DeliveryUserORM(Base):
    __tablename__ = "delivery_users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    identifier = Column(String(300), unique=True, nullable=False)
    phone = Column(String(50), nullable=True)
    login_id = Column(String(200), nullable=True)
    email = Column(String(300), nullable=True)
    is_active = Column(Boolean, default=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    delivery_managements = relationship(
        "DeliveryManagementORM",
        back_populates="delivery_user",
        primaryjoin="foreign(DeliveryManagementORM.delivery_identifier) == DeliveryUserORM.identifier",
        foreign_keys="[DeliveryManagementORM.delivery_identifier]",
        viewonly=True,
    )


class AccountORM(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(200), nullable=False)
    email = Column(String(300), unique=True, nullable=False)
    role = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class OrderORM(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_number = Column(String(100), unique=True, nullable=False)
    customer_name = Column(String(200), nullable=True)
    customer_identifier = Column(String(300), nullable=True)
    customer_email = Column(String(300), nullable=True)
    customer_phone = Column(String(50), nullable=True)
    shipping_address = Column(Text, nullable=True)
    billing_address = Column(Text, nullable=True)
    subtotal = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    shipping_cost = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    status = Column(
        Enum("pending", "assigned", "processing", "shipped", "delivered", "cancelled", name="order_status"),
        default="pending",
        nullable=False,
    )
    production_status = Column(
        Enum("order_received", "started", "in_progress", "ready_to_dispatch", name="production_status"),
        nullable=True,
    )
    production_identifier = Column(String(300), nullable=True)
    production_assigned_at = Column(DateTime, nullable=True)
    source = Column(String(100), nullable=True)
    delivery_datetime = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    items = relationship("OrderItemORM", back_populates="order", cascade="all, delete-orphan")
    delivery_managements = relationship("DeliveryManagementORM", back_populates="order")


class OrderItemORM(Base):
    __tablename__ = "order_items"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    order_id = Column(UUID(as_uuid=False), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name = Column(String(300), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    price = Column(Float, nullable=False, default=0.0)
    subtotal = Column(Float, nullable=False, default=0.0)

    order = relationship("OrderORM", back_populates="items")
    product = relationship("ProductORM", back_populates="order_items")


class DeliveryManagementORM(Base):
    __tablename__ = "delivery_managements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id = Column(UUID(as_uuid=False), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    tracking_number = Column(String(200), nullable=True)
    delivery_date = Column(DateTime, nullable=True)
    status = Column(String(100), default="pending")
    contact_name = Column(String(200), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    delivery_identifier = Column(String(300), nullable=True)
    delivery_assigned_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    order = relationship("OrderORM", back_populates="delivery_managements")
    delivery_user = relationship(
        "DeliveryUserORM",
        back_populates="delivery_managements",
        primaryjoin="foreign(DeliveryManagementORM.delivery_identifier) == DeliveryUserORM.identifier",
        foreign_keys="[DeliveryManagementORM.delivery_identifier]",
        viewonly=True,
    )


class ProductionManagementORM(Base):
    __tablename__ = "production_managements"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name = Column(String(300), nullable=False)
    production_date = Column(DateTime, nullable=True)
    status = Column(String(100), default="pending")
    quantity = Column(Integer, default=0)
    product_id = Column(UUID(as_uuid=False), ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    product = relationship("ProductORM", back_populates="production_managements")


class SiteConfigORM(Base):
    __tablename__ = "site_config"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    company_name = Column(String(300), default="My E-Commerce Store")
    logo_url = Column(Text, nullable=True)
    header_text = Column(Text, nullable=True)
    tagline = Column(Text, nullable=True)
    primary_color = Column(String(20), default="#1a73e8")
    secondary_color = Column(String(20), default="#ffffff")
    contact_email = Column(String(300), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    banner_enabled = Column(Boolean, default=False)
    banner_text = Column(Text, nullable=True)
    banner_link = Column(Text, nullable=True)
    banner_color = Column(String(20), default="#0ea5e9")
    currency_symbol = Column(String(10), default="₹")
    tax_rate = Column(Float, default=18.0)
    free_shipping_threshold = Column(Float, default=500.0)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)


class JobORM(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    title = Column(String(300), nullable=False)
    status = Column(String(100), default="active")
    scheduled_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    applications = relationship("ApplicationORM", back_populates="job")


class ApplicationORM(Base):
    __tablename__ = "applications"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    job_id = Column(UUID(as_uuid=False), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)
    job_title = Column(String(300), nullable=True)
    applicant_name = Column(String(200), nullable=False)
    applicant_email = Column(String(300), nullable=True)
    applicant_phone = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)
    resume_url = Column(Text, nullable=True)
    status = Column(String(100), default="pending")
    attributes = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    job = relationship("JobORM", back_populates="applications")


class OtpRequestORM(Base):
    __tablename__ = "otp_requests"

    id = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    purpose = Column(String(20), nullable=False)  # signup | login
    identifier = Column(String(300), nullable=False)
    otp_hash = Column(String(64), nullable=False)
    attempts = Column(Integer, default=0)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
