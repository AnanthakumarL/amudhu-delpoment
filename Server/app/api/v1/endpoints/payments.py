from __future__ import annotations

import time

import razorpay
from razorpay.errors import SignatureVerificationError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.db.database import get_db
from app.models.order import Order, OrderCreate, OrderItem, OrderStatus, OrderUpdate
from app.services.order_service import OrderService
from app.services.product_service import ProductService


router = APIRouter()


def get_order_service(db=Depends(get_db)) -> OrderService:
    return OrderService(db)


def get_product_service(db=Depends(get_db)) -> ProductService:
    return ProductService(db)


def _razorpay_client():
    settings = get_settings()
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay keys are not configured")
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


# ── Shared request/response models ───────────────────────────────────────────

class CheckoutCartItem(BaseModel):
    product_id: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)


class CreateOrderRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_identifier: str = Field(..., min_length=1, max_length=200)
    customer_email: str | None = None
    customer_phone: str | None = None
    shipping_address: str = Field(..., min_length=1)
    billing_address: str | None = None
    items: list[CheckoutCartItem] = Field(..., min_length=1)


def _build_order_items(body: CreateOrderRequest, product_service: ProductService):
    order_items: list[OrderItem] = []
    for cart_item in body.items:
        product = product_service.get_product(cart_item.product_id)
        quantity = int(cart_item.quantity)
        unit_price = float(product.price)
        order_items.append(
            OrderItem(
                product_id=str(product.id),
                product_name=str(product.name),
                quantity=quantity,
                price=unit_price,
                subtotal=unit_price * quantity,
            )
        )
    return order_items


def _paise_from_rupees(value: float) -> int:
    return int(round(float(value) * 100))


# ── Standard Razorpay Checkout (modal) ───────────────────────────────────────

class CreateOrderResponse(BaseModel):
    order: Order
    razorpay_order_id: str
    razorpay_key_id: str
    amount: int
    currency: str


class VerifyPaymentRequest(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentResponse(BaseModel):
    success: bool
    order: Order


@router.post("/create-order", response_model=CreateOrderResponse, status_code=status.HTTP_201_CREATED)
async def create_razorpay_order(
    body: CreateOrderRequest,
    order_service: OrderService = Depends(get_order_service),
    product_service: ProductService = Depends(get_product_service),
):
    settings = get_settings()
    client = _razorpay_client()

    order_items = _build_order_items(body, product_service)
    subtotal = sum(it.subtotal for it in order_items)
    amount_paise = _paise_from_rupees(subtotal)

    order = order_service.create_order(OrderCreate(
        customer_name=body.customer_name,
        customer_identifier=body.customer_identifier,
        customer_email=body.customer_email,
        customer_phone=body.customer_phone,
        shipping_address=body.shipping_address,
        billing_address=body.billing_address,
        items=order_items,
        subtotal=subtotal, tax=0, shipping_cost=0, total=subtotal,
        status=OrderStatus.PENDING,
        notes="payment_method=razorpay_modal; payment_status=pending",
    ))

    rzp_order = client.order.create({
        "amount": amount_paise,
        "currency": settings.RAZORPAY_CURRENCY,
        "receipt": order.order_number,
        "notes": {"order_id": order.id, "customer_name": body.customer_name},
    })

    order = order_service.update_order(
        order.id,
        OrderUpdate(notes=f"payment_method=razorpay_modal; payment_status=pending; razorpay_order_id={rzp_order['id']}"),
    )

    return CreateOrderResponse(
        order=order,
        razorpay_order_id=rzp_order["id"],
        razorpay_key_id=settings.RAZORPAY_KEY_ID,
        amount=amount_paise,
        currency=settings.RAZORPAY_CURRENCY,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_razorpay_payment(
    body: VerifyPaymentRequest,
    order_service: OrderService = Depends(get_order_service),
):
    client = _razorpay_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
        })
    except SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    order = order_service.update_order(
        body.order_id,
        OrderUpdate(
            status=OrderStatus.PENDING,
            notes=(
                f"payment_method=razorpay_modal; payment_status=paid; "
                f"razorpay_order_id={body.razorpay_order_id}; "
                f"razorpay_payment_id={body.razorpay_payment_id}"
            ),
        ),
    )
    return VerifyPaymentResponse(success=True, order=order)


# ── QR Code (UPI) Payment ─────────────────────────────────────────────────────

class CreateQROrderResponse(BaseModel):
    order: Order
    qr_id: str
    qr_image_url: str
    amount: int
    expires_at: int  # Unix timestamp


class QRPaymentStatusResponse(BaseModel):
    paid: bool
    order: Order


@router.post("/create-qr-order", response_model=CreateQROrderResponse, status_code=status.HTTP_201_CREATED)
async def create_qr_order(
    body: CreateOrderRequest,
    order_service: OrderService = Depends(get_order_service),
    product_service: ProductService = Depends(get_product_service),
):
    settings = get_settings()
    client = _razorpay_client()

    order_items = _build_order_items(body, product_service)
    subtotal = sum(it.subtotal for it in order_items)
    amount_paise = _paise_from_rupees(subtotal)
    expires_at = int(time.time()) + 900  # 15-minute expiry

    order = order_service.create_order(OrderCreate(
        customer_name=body.customer_name,
        customer_identifier=body.customer_identifier,
        customer_email=body.customer_email,
        customer_phone=body.customer_phone,
        shipping_address=body.shipping_address,
        billing_address=body.billing_address,
        items=order_items,
        subtotal=subtotal, tax=0, shipping_cost=0, total=subtotal,
        status=OrderStatus.PENDING,
        notes="payment_method=razorpay_qr; payment_status=pending",
    ))

    qr = client.qrcode.create({
        "type": "upi_qr",
        "name": "Amudhu Ice Cream",
        "usage": "single_use",
        "fixed_amount": True,
        "payment_amount": amount_paise,
        "description": f"Order {order.order_number}",
        "close_by": expires_at,
        "notes": {
            "order_id": order.id,
            "order_number": order.order_number,
        },
    })

    order = order_service.update_order(
        order.id,
        OrderUpdate(notes=f"payment_method=razorpay_qr; payment_status=pending; qr_id={qr['id']}"),
    )

    return CreateQROrderResponse(
        order=order,
        qr_id=qr["id"],
        qr_image_url=qr["image_url"],
        amount=amount_paise,
        expires_at=expires_at,
    )


@router.get("/qr-status/{order_id}", response_model=QRPaymentStatusResponse)
async def qr_payment_status(
    order_id: str,
    order_service: OrderService = Depends(get_order_service),
):
    order = order_service.get_order(order_id)
    paid = "payment_status=paid" in (order.notes or "")
    return QRPaymentStatusResponse(paid=paid, order=order)


# ── Static QR Code (pre-created in Razorpay dashboard) ───────────────────────

class StaticQROrderRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_identifier: str = Field(..., min_length=1, max_length=200)
    customer_email: str | None = None
    customer_phone: str | None = None
    shipping_address: str = Field(..., min_length=1)
    items: list[CheckoutCartItem] = Field(..., min_length=1)


class StaticQROrderResponse(BaseModel):
    order: Order
    qr_id: str
    qr_image_url: str
    amount: int


@router.post("/create-static-qr-order", response_model=StaticQROrderResponse, status_code=status.HTTP_201_CREATED)
async def create_static_qr_order(
    body: StaticQROrderRequest,
    order_service: OrderService = Depends(get_order_service),
    product_service: ProductService = Depends(get_product_service),
):
    settings = get_settings()
    if not settings.RAZORPAY_STATIC_QR_ID:
        raise HTTPException(status_code=500, detail="Static QR ID is not configured")

    client = _razorpay_client()

    order_items = _build_order_items(body, product_service)
    subtotal = sum(it.subtotal for it in order_items)
    amount_paise = _paise_from_rupees(subtotal)

    order = order_service.create_order(OrderCreate(
        customer_name=body.customer_name,
        customer_identifier=body.customer_identifier,
        customer_email=body.customer_email,
        customer_phone=body.customer_phone,
        shipping_address=body.shipping_address,
        items=order_items,
        subtotal=subtotal, tax=0, shipping_cost=0, total=subtotal,
        status=OrderStatus.PENDING,
        notes=f"payment_method=razorpay_static_qr; payment_status=pending; qr_id={settings.RAZORPAY_STATIC_QR_ID}",
    ))

    # Fetch pre-created QR from Razorpay to get image_url
    qr = client.qrcode.fetch(settings.RAZORPAY_STATIC_QR_ID)

    return StaticQROrderResponse(
        order=order,
        qr_id=settings.RAZORPAY_STATIC_QR_ID,
        qr_image_url=qr["image_url"],
        amount=amount_paise,
    )


@router.get("/static-qr-check/{order_id}", response_model=QRPaymentStatusResponse)
async def static_qr_check(
    order_id: str,
    order_service: OrderService = Depends(get_order_service),
):
    """Poll this endpoint — it checks Razorpay payments on the static QR and marks order paid."""
    settings = get_settings()
    order = order_service.get_order(order_id)

    if "payment_status=paid" in (order.notes or ""):
        return QRPaymentStatusResponse(paid=True, order=order)

    # Fetch recent payments on the static QR and match by time
    client = _razorpay_client()
    order_created_ts = int(time.time()) - 900  # look back 15 min max
    try:
        result = client.qrcode.fetch_all_payments(settings.RAZORPAY_STATIC_QR_ID, {"count": 10})
        payments = result.get("items", [])
        for p in payments:
            # Match: payment created after order, status=captured
            if p.get("status") == "captured" and p.get("created_at", 0) >= order_created_ts:
                order = order_service.update_order(
                    order_id,
                    OrderUpdate(
                        status=OrderStatus.PENDING,
                        notes=(
                            f"payment_method=razorpay_static_qr; payment_status=paid; "
                            f"razorpay_payment_id={p['id']}"
                        ),
                    ),
                )
                return QRPaymentStatusResponse(paid=True, order=order)
    except Exception:
        pass

    return QRPaymentStatusResponse(paid=False, order=order)


# ── Webhook (payment.captured for QR) ────────────────────────────────────────

@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    order_service: OrderService = Depends(get_order_service),
):
    settings = get_settings()
    payload = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if settings.RAZORPAY_WEBHOOK_SECRET:
        client = _razorpay_client()
        try:
            client.utility.verify_webhook_signature(
                payload.decode(), signature, settings.RAZORPAY_WEBHOOK_SECRET
            )
        except SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    import json
    event = json.loads(payload)
    event_type = event.get("event")

    if event_type == "payment.captured":
        payment = event.get("payload", {}).get("payment", {}).get("entity", {})
        notes = payment.get("notes") or {}
        order_id = notes.get("order_id")

        if not order_id:
            # Try via qr_code reference
            qr_code_id = payment.get("qr_code_id")
            if qr_code_id:
                # Find order by qr_id in notes — best effort
                pass

        if order_id:
            try:
                order_service.update_order(
                    order_id,
                    OrderUpdate(
                        status=OrderStatus.PENDING,
                        notes=(
                            f"payment_method=razorpay_qr; payment_status=paid; "
                            f"razorpay_payment_id={payment.get('id', '')}"
                        ),
                    ),
                )
            except Exception:
                pass

    return {"ok": True}

