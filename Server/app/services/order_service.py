from __future__ import annotations

import random
import string
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.core.exceptions import DatabaseException, NotFoundException
from app.core.logging import get_logger
from app.db.orm_models import DeliveryManagementORM, OrderItemORM, OrderORM
from app.models.order import Order, OrderCreate, OrderItem, OrderStatistics, OrderStatus, OrderUpdate

logger = get_logger(__name__)


def _to_item(row):
    return OrderItem(
        product_id=str(row.product_id) if row.product_id else None,
        product_name=row.product_name,
        quantity=row.quantity,
        price=float(row.price),
        subtotal=float(row.subtotal),
    )


def _to_order(row):
    return Order(
        id=str(row.id),
        order_number=row.order_number,
        customer_name=row.customer_name,
        customer_identifier=row.customer_identifier,
        customer_email=row.customer_email,
        customer_phone=row.customer_phone,
        shipping_address=row.shipping_address,
        billing_address=row.billing_address,
        items=[_to_item(i) for i in (row.items or [])],
        subtotal=float(row.subtotal or 0),
        tax=float(row.tax or 0),
        shipping_cost=float(row.shipping_cost or 0),
        total=float(row.total or 0),
        status=row.status,
        production_status=row.production_status,
        production_identifier=row.production_identifier,
        production_assigned_at=row.production_assigned_at.isoformat() if row.production_assigned_at else None,
        source=row.source,
        delivery_datetime=row.delivery_datetime.isoformat() if row.delivery_datetime else None,
        notes=row.notes,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


def _gen_order_number():
    ts = datetime.utcnow().strftime("%Y%m%d")
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"ORD-{ts}-{rand}"


class OrderService:
    def __init__(self, db: Session):
        self.db = db

    def create_order(self, order: OrderCreate) -> Order:
        try:
            data = order.model_dump(exclude={"items"})
            if hasattr(data.get("status"), "value"):
                data["status"] = data["status"].value
            if hasattr(data.get("production_status"), "value"):
                data["production_status"] = data["production_status"].value
            data["order_number"] = _gen_order_number()
            row = OrderORM(**data)
            for item in order.items:
                row.items.append(OrderItemORM(
                    product_id=item.product_id,
                    product_name=item.product_name,
                    quantity=item.quantity,
                    price=item.price,
                    subtotal=item.subtotal,
                ))
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_order(row)
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating order: {e}")
            raise DatabaseException(f"Failed to create order: {e!s}")

    def get_order(self, order_id: str) -> Order:
        try:
            row = (self.db.query(OrderORM).options(joinedload(OrderORM.items))
                   .filter(OrderORM.id == order_id).first())
            if not row:
                raise NotFoundException(f"Order {order_id} not found")
            return _to_order(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching order: {e}")
            raise DatabaseException(f"Failed to fetch order: {e!s}")

    def get_order_by_number(self, order_number: str) -> Order:
        try:
            row = (self.db.query(OrderORM).options(joinedload(OrderORM.items))
                   .filter(OrderORM.order_number == order_number).first())
            if not row:
                raise NotFoundException(f"Order {order_number} not found")
            return _to_order(row)
        except NotFoundException:
            raise
        except Exception as e:
            logger.error(f"Error fetching order: {e}")
            raise DatabaseException(f"Failed to fetch order: {e!s}")

    def list_orders(self, page=1, page_size=20, status=None, customer_email=None,
                    customer_identifier=None, production_identifier=None, production_assigned=None):
        try:
            q = self.db.query(OrderORM).options(joinedload(OrderORM.items))
            if status:
                q = q.filter(OrderORM.status == status.value)
            if customer_email:
                q = q.filter(OrderORM.customer_email == customer_email)
            if customer_identifier:
                q = q.filter(OrderORM.customer_identifier == customer_identifier)
            if production_identifier:
                q = q.filter(OrderORM.production_identifier == production_identifier.strip().lower())
            elif production_assigned is True:
                q = q.filter(OrderORM.production_identifier.isnot(None), OrderORM.production_identifier != "")
            q = q.order_by(OrderORM.created_at.desc())
            total = q.count()
            rows = q.offset((page - 1) * page_size).limit(page_size).all()
            return [_to_order(r) for r in rows], total
        except Exception as e:
            logger.error(f"Error listing orders: {e}")
            raise DatabaseException(f"Failed to list orders: {e!s}")

    def update_order(self, order_id: str, order_update: OrderUpdate) -> Order:
        try:
            row = (self.db.query(OrderORM).options(joinedload(OrderORM.items))
                   .filter(OrderORM.id == order_id).first())
            if not row:
                raise NotFoundException(f"Order {order_id} not found")
            update_data = {k: v for k, v in order_update.model_dump().items() if v is not None}
            if "delivery_datetime" in update_data and isinstance(update_data["delivery_datetime"], str):
                try:
                    update_data["delivery_datetime"] = datetime.fromisoformat(update_data["delivery_datetime"])
                except ValueError:
                    update_data.pop("delivery_datetime")
            requested_prod_status = update_data.get("production_status")
            if hasattr(requested_prod_status, "value"):
                requested_prod_status = requested_prod_status.value
            if "status" in update_data and hasattr(update_data["status"], "value"):
                update_data["status"] = update_data["status"].value
            if "production_status" in update_data and hasattr(update_data["production_status"], "value"):
                update_data["production_status"] = update_data["production_status"].value
            if "production_identifier" in update_data:
                normalized = str(update_data["production_identifier"]).strip().lower()
                update_data["production_identifier"] = normalized or None
                if normalized:
                    update_data["production_assigned_at"] = datetime.utcnow()
                    if "status" not in update_data:
                        update_data["status"] = OrderStatus.ASSIGNED.value
                else:
                    update_data["production_assigned_at"] = None
            for k, v in update_data.items():
                setattr(row, k, v)
            row.updated_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(row)
            if requested_prod_status == "ready_to_dispatch":
                try:
                    existing = self.db.query(DeliveryManagementORM).filter(
                        DeliveryManagementORM.order_id == order_id).first()
                    if not existing:
                        dm = DeliveryManagementORM(order_id=order_id, status="pending",
                            contact_name=row.customer_name, contact_phone=row.customer_phone,
                            address=row.shipping_address,
                            notes="Auto-created when order marked ready_to_dispatch", attributes={})
                        self.db.add(dm)
                        self.db.commit()
                except Exception as ex:
                    logger.warning(f"Failed to auto-create delivery entry: {ex}")
            return _to_order(row)
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating order: {e}")
            raise DatabaseException(f"Failed to update order: {e!s}")

    def delete_order(self, order_id: str) -> bool:
        try:
            row = self.db.query(OrderORM).filter(OrderORM.id == order_id).first()
            if not row:
                raise NotFoundException(f"Order {order_id} not found")
            self.db.delete(row)
            self.db.commit()
            return True
        except NotFoundException:
            raise
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error deleting order: {e}")
            raise DatabaseException(f"Failed to delete order: {e!s}")

    def get_statistics(self) -> OrderStatistics:
        try:
            total = self.db.query(OrderORM).count()
            pending = self.db.query(OrderORM).filter(OrderORM.status == "pending").count()
            processing = self.db.query(OrderORM).filter(OrderORM.status == "processing").count()
            shipped = self.db.query(OrderORM).filter(OrderORM.status == "shipped").count()
            delivered = self.db.query(OrderORM).filter(OrderORM.status == "delivered").count()
            cancelled = self.db.query(OrderORM).filter(OrderORM.status == "cancelled").count()
            from sqlalchemy import func
            revenue = self.db.query(func.coalesce(func.sum(OrderORM.total), 0.0)).filter(
                OrderORM.status == "delivered"
            ).scalar() or 0.0
            return OrderStatistics(
                total_orders=total,
                pending_orders=pending,
                processing_orders=processing,
                shipped_orders=shipped,
                delivered_orders=delivered,
                cancelled_orders=cancelled,
                total_revenue=float(revenue),
            )
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            raise DatabaseException(f"Failed to get statistics: {e!s}")
