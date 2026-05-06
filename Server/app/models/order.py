from enum import Enum

from pydantic import BaseModel, EmailStr, Field


class OrderStatus(str, Enum):
    """Order status enumeration"""

    PENDING = "pending"
    ASSIGNED = "assigned"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class ProductionStatus(str, Enum):
    """Production status enumeration (used by Production portal)"""

    ORDER_RECEIVED = "order_received"
    STARTED = "started"
    IN_PROGRESS = "in_progress"
    READY_TO_DISPATCH = "ready_to_dispatch"


class OrderItem(BaseModel):
    """Order item model"""

    product_id: str
    product_name: str
    quantity: int = Field(..., gt=0)
    price: float = Field(..., gt=0)
    subtotal: float = Field(..., gt=0)


class OrderBase(BaseModel):
    """Base order model"""

    customer_name: str = Field(..., min_length=1, max_length=200)
    # Identifier used by the client app (email or phone)
    customer_identifier: str | None = Field(default=None, min_length=1, max_length=200)
    # Optional email (required only when available)
    customer_email: EmailStr | None = None
    customer_phone: str | None = None
    shipping_address: str = Field(..., min_length=1)
    billing_address: str | None = None
    items: list[OrderItem]
    subtotal: float = Field(..., ge=0)
    tax: float = Field(default=0.0, ge=0)
    shipping_cost: float = Field(default=0.0, ge=0)
    total: float = Field(..., ge=0)
    status: OrderStatus = OrderStatus.PENDING
    production_status: ProductionStatus = ProductionStatus.ORDER_RECEIVED
    notes: str | None = None
    # Channel that created this order (e.g. "whatsapp", "web", "admin")
    source: str | None = None
    # Preferred delivery date/time (free-text, set by WhatsApp orders)
    delivery_datetime: str | None = None

    # Production assignment (for Production portal)
    production_identifier: str | None = Field(default=None, min_length=1, max_length=320)
    production_assigned_at: str | None = None


class OrderCreate(OrderBase):
    """Order creation model"""



class OrderUpdate(BaseModel):
    """Order update model"""

    status: OrderStatus | None = None
    production_status: ProductionStatus | None = None
    notes: str | None = None
    shipping_address: str | None = None
    billing_address: str | None = None
    delivery_datetime: str | None = None

    production_identifier: str | None = None


class Order(OrderBase):
    """Order response model"""

    id: str
    order_number: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class OrderStatistics(BaseModel):
    """Order statistics model"""

    total_orders: int
    pending_orders: int
    processing_orders: int
    shipped_orders: int
    delivered_orders: int
    cancelled_orders: int
    total_revenue: float
