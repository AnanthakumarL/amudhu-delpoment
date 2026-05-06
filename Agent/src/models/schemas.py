from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class WhatsAppUser(BaseModel):
    """WhatsApp user model"""
    id: Optional[str] = Field(default=None, alias="_id")
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    last_message_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}


class WhatsAppUserUpdate(BaseModel):
    """Update WhatsApp user"""
    name: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class CollectedOrderData(BaseModel):
    """Order data collected during conversation"""
    product: Optional[str] = None
    variant: Optional[str] = None
    quantity: Optional[int] = None
    addons: Optional[list[str]] = Field(default_factory=list)
    scooper: Optional[str] = None
    address: Optional[str] = None
    delivery_date: Optional[str] = None
    delivery_time: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    order_type: Optional[str] = None  # B2B or B2C
    gst: Optional[str] = None


class ConversationSession(BaseModel):
    """Live conversation session"""
    id: Optional[str] = Field(default=None, alias="_id")
    phone: str
    current_step: str = "product"
    collected_data: CollectedOrderData = Field(default_factory=CollectedOrderData)
    conversation_history: list[dict] = Field(default_factory=list)
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_message_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}


class AgentOrder(BaseModel):
    """Order created by AI Agent"""
    id: Optional[str] = Field(default=None, alias="_id")
    order_number: Optional[str] = None
    phone: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    shipping_address: Optional[str] = None
    items: list[dict] = Field(default_factory=list)
    subtotal: float = 0.0
    tax: float = 0.0
    shipping_cost: float = 0.0
    total: float = 0.0
    status: str = "pending"
    source: str = "whatsapp"
    delivery_datetime: Optional[str] = None
    order_type: Optional[str] = None
    gst: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}


class FlowStepConfig(BaseModel):
    """Flow step configuration"""
    id: Optional[str] = Field(default=None, alias="_id")
    step_key: str
    step_name: str
    question: str
    is_required: bool = True
    is_active: bool = True
    order: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        json_encoders = {datetime: lambda v: v.isoformat()}
