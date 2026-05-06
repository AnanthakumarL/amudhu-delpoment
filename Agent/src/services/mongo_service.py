from datetime import datetime
from typing import Optional
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection

from src.core.config import get_settings
from src.models.schemas import WhatsAppUser, ConversationSession, AgentOrder, FlowStepConfig

settings = get_settings()


class MongoDBService:
    """MongoDB service for agent data"""

    _instance: Optional["MongoDBService"] = None
    _client: Optional[MongoClient] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def connect(self) -> MongoClient:
        if self._client is None:
            self._client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)
        return self._client

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    @property
    def db(self) -> Database:
        return self.connect()[settings.MONGODB_DB]

    # ===== USER METHODS =====

    def get_users_collection(self) -> Collection:
        return self.db["users_whatsapp"]

    def create_user(self, phone: str, name: Optional[str] = None) -> dict:
        """Create new WhatsApp user"""
        now = datetime.utcnow()
        user_data = {
            "phone": phone,
            "name": name,
            "email": None,
            "address": None,
            "created_at": now,
            "updated_at": now,
            "is_active": True,
            "last_message_at": now
        }
        result = self.get_users_collection().insert_one(user_data)
        user_data["_id"] = str(result.inserted_id)
        return user_data

    def get_user_by_phone(self, phone: str) -> Optional[dict]:
        """Get user by phone number"""
        return self.get_users_collection().find_one({"phone": phone})

    def get_or_create_user(self, phone: str, name: Optional[str] = None) -> dict:
        """Get existing user or create new one"""
        user = self.get_user_by_phone(phone)
        if not user:
            return self.create_user(phone, name)
        return user

    def update_user(self, phone: str, update_data: dict) -> Optional[dict]:
        """Update user data"""
        update_data["updated_at"] = datetime.utcnow()
        result = self.get_users_collection().find_one_and_update(
            {"phone": phone},
            {"$set": update_data},
            return_document=True
        )
        return result

    def get_all_users(self, active_only: bool = False) -> list[dict]:
        """Get all users"""
        query = {"is_active": True} if active_only else {}
        return list(self.get_users_collection().find(query).sort("last_message_at", -1))

    def delete_user(self, phone: str) -> bool:
        """Delete user"""
        result = self.get_users_collection().delete_one({"phone": phone})
        return result.deleted_count > 0

    def update_user_activity(self, phone: str) -> None:
        """Update user last message timestamp"""
        self.get_users_collection().update_one(
            {"phone": phone},
            {"$set": {"last_message_at": datetime.utcnow()}}
        )

    # ===== SESSION METHODS =====

    def get_sessions_collection(self) -> Collection:
        return self.db["sessions"]

    def create_session(self, phone: str) -> dict:
        """Create new conversation session"""
        now = datetime.utcnow()
        session_data = {
            "phone": phone,
            "current_step": "product",
            "collected_data": {
                "product": None,
                "variant": None,
                "quantity": None,
                "addons": [],
                "scooper": None,
                "address": None,
                "delivery_date": None,
                "delivery_time": None,
                "name": None,
                "email": None,
                "order_type": None,
                "gst": None
            },
            "conversation_history": [],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "last_message_at": now
        }
        result = self.get_sessions_collection().insert_one(session_data)
        session_data["_id"] = str(result.inserted_id)
        return session_data

    def get_session_by_phone(self, phone: str) -> Optional[dict]:
        """Get active session for phone"""
        return self.get_sessions_collection().find_one(
            {"phone": phone, "is_active": True},
            sort=[("created_at", -1)]
        )

    def get_or_create_session(self, phone: str) -> dict:
        """Get existing session or create new one"""
        session = self.get_session_by_phone(phone)
        if not session:
            return self.create_session(phone)
        return session

    def update_session(self, phone: str, update_data: dict) -> Optional[dict]:
        """Update session data"""
        update_data["updated_at"] = datetime.utcnow()
        result = self.get_sessions_collection().find_one_and_update(
            {"phone": phone, "is_active": True},
            {"$set": update_data},
            return_document=True
        )
        return result

    def update_session_step(self, phone: str, step: str, collected_data: dict) -> Optional[dict]:
        """Update session current step and collected data"""
        return self.update_session(phone, {
            "current_step": step,
            "collected_data": collected_data,
            "last_message_at": datetime.utcnow()
        })

    def add_conversation_message(self, phone: str, role: str, content: str) -> None:
        """Add message to conversation history"""
        self.get_sessions_collection().update_one(
            {"phone": phone, "is_active": True},
            {
                "$push": {"conversation_history": {
                    "role": role,
                    "content": content,
                    "timestamp": datetime.utcnow()
                }},
                "$set": {"last_message_at": datetime.utcnow()}
            }
        )

    def end_session(self, phone: str) -> Optional[dict]:
        """End active session"""
        return self.update_session(phone, {"is_active": False})

    def get_all_active_sessions(self) -> list[dict]:
        """Get all active sessions"""
        return list(self.get_sessions_collection().find(
            {"is_active": True}
        ).sort("last_message_at", -1))

    # ===== ORDER METHODS =====

    def get_orders_collection(self) -> Collection:
        return self.db["orders"]

    def create_order(self, order_data: dict) -> dict:
        """Create order from collected data"""
        now = datetime.utcnow()
        order_data["created_at"] = now
        order_data["updated_at"] = now
        order_data["status"] = "pending"
        order_data["source"] = "whatsapp"
        result = self.get_orders_collection().insert_one(order_data)
        order_data["_id"] = str(result.inserted_id)
        return order_data

    def get_order_by_id(self, order_id: str) -> Optional[dict]:
        """Get order by ID"""
        from bson import ObjectId
        return self.get_orders_collection().find_one({"_id": ObjectId(order_id)})

    def get_all_orders(self, status: Optional[str] = None) -> list[dict]:
        """Get all orders"""
        query = {"status": status} if status else {}
        return list(self.get_orders_collection().find(query).sort("created_at", -1))

    def get_orders_by_phone(self, phone: str) -> list[dict]:
        """Get all orders for a phone"""
        return list(self.get_orders_collection().find({"phone": phone}).sort("created_at", -1))

    def update_order_status(self, order_id: str, status: str) -> Optional[dict]:
        """Update order status"""
        from bson import ObjectId
        result = self.get_orders_collection().find_one_and_update(
            {"_id": ObjectId(order_id)},
            {"$set": {"status": status, "updated_at": datetime.utcnow()}},
            return_document=True
        )
        return result

    def delete_order(self, order_id: str) -> bool:
        """Delete order"""
        from bson import ObjectId
        result = self.get_orders_collection().delete_one({"_id": ObjectId(order_id)})
        return result.deleted_count > 0

    # ===== FLOW CONFIG METHODS =====

    def get_flow_config_collection(self) -> Collection:
        return self.db["flow_config"]

    def get_flow_steps(self) -> list[dict]:
        """Get all active flow steps"""
        return list(self.get_flow_config_collection().find(
            {"is_active": True}
        ).sort("order", 1))

    def update_flow_steps(self, steps: list[dict]) -> None:
        """Update flow steps configuration"""
        collection = self.get_flow_config_collection()
        collection.delete_many({})
        if steps:
            collection.insert_many(steps)

    def reset_flow_to_default(self) -> None:
        """Reset flow to default steps"""
        default_steps = [
            {"step_key": "product", "step_name": "Product Selection", "question": "Which ice cream would you like to order?", "is_required": True, "is_active": True, "order": 1},
            {"step_key": "variant", "step_name": "Variant Selection", "question": "Any specific variant or flavor preference?", "is_required": False, "is_active": True, "order": 2},
            {"step_key": "quantity", "step_name": "Quantity Selection", "question": "How many would you like?", "is_required": True, "is_active": True, "order": 3},
            {"step_key": "addons", "step_name": "Add-ons", "question": "Any add-ons like nuts, chocolate sauce, or extra toppings?", "is_required": False, "is_active": True, "order": 4},
            {"step_key": "scooper", "step_name": "Scooper", "question": "Would you like extra scoops?", "is_required": False, "is_active": True, "order": 5},
            {"step_key": "address", "step_name": "Delivery Address", "question": "Please share your delivery address", "is_required": True, "is_active": True, "order": 6},
            {"step_key": "delivery_date", "step_name": "Delivery Date", "question": "When would you like it delivered?", "is_required": True, "is_active": True, "order": 7},
            {"step_key": "delivery_time", "step_name": "Delivery Time", "question": "Any preferred delivery time?", "is_required": False, "is_active": True, "order": 8},
            {"step_key": "name", "step_name": "Name", "question": "May I know your name?", "is_required": True, "is_active": True, "order": 9},
            {"step_key": "email", "step_name": "Email", "question": "Please share your email for order confirmation", "is_required": True, "is_active": True, "order": 10},
            {"step_key": "order_type", "step_name": "Order Type", "question": "Is this a B2B or B2C order?", "is_required": True, "is_active": True, "order": 11},
            {"step_key": "gst", "step_name": "GST Number", "question": "Please provide your GST number for B2B billing", "is_required": False, "is_active": True, "order": 12},
            {"step_key": "summary", "step_name": "Order Summary", "question": "", "is_required": True, "is_active": True, "order": 13},
            {"step_key": "confirmation", "step_name": "Confirmation", "question": "Type YES to confirm your order", "is_required": True, "is_active": True, "order": 14},
        ]
        self.update_flow_steps(default_steps)


# Global instance
mongo_service = MongoDBService()


def get_mongo_service() -> MongoDBService:
    """Get MongoDB service instance"""
    return mongo_service
