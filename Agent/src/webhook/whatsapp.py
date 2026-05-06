"""
WhatsApp Webhook Handler
Receives incoming messages from WhatsApp via webhook.
"""

from typing import Optional
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import json
import hashlib
import time

from src.core.config import get_settings
from src.services.flow_engine import get_flow_engine

settings = get_settings()


class WhatsAppWebhook:
    """Handle WhatsApp webhook events"""

    def __init__(self):
        self.flow_engine = get_flow_engine()

    def verify_webhook(self, hub_mode: str, hub_verify_token: str, hub_challenge: str) -> str:
        """Verify webhook for WhatsApp"""
        if hub_verify_token == settings.WHATSAPP_WEBHOOK_VERIFY_TOKEN:
            return hub_challenge
        raise HTTPException(status_code=403, detail="Invalid verification token")

    async def handle_incoming_message(self, data: dict) -> dict:
        """Process incoming WhatsApp message"""
        try:
            # Extract message data
            entry = data.get("entry", [])
            if not entry:
                return {"status": "ignored", "reason": "No entry"}

            changes = entry[0].get("changes", [])
            if not changes:
                return {"status": "ignored", "reason": "No changes"}

            value = changes[0].get("value", {})
            messages = value.get("messages", [])

            if not messages:
                # Check for status updates
                statuses = value.get("statuses", [])
                if statuses:
                    return {"status": "acknowledged", "type": "status_update"}
                return {"status": "ignored", "reason": "No messages"}

            # Process message
            message = messages[0]
            phone = message.get("from", "")
            msg_id = message.get("id", "")
            timestamp = message.get("timestamp", "")

            # Get message content
            message_text = self._extract_message_text(message)

            if not phone:
                return {"status": "error", "reason": "No phone number"}

            # Whitelist gate — only reply to allowed numbers (strict; empty = none)
            from src.api.bot_control import is_phone_allowed, _normalize_phone
            if not is_phone_allowed(phone):
                print(f"[whitelist] blocked {phone} (normalized {_normalize_phone(phone)})")
                return {"status": "blocked", "phone": phone, "reason": "not whitelisted"}
            print(f"[whitelist] allowed {phone}")

            # Process through flow engine
            response = self.flow_engine.process_message(phone, message_text)

            # Send response back
            response_sent = await self._send_whatsapp_message(phone, response["message"])

            return {
                "status": "success",
                "phone": phone,
                "message_id": msg_id,
                "response_sent": response_sent,
                "action": response.get("action"),
                "next_step": response.get("next_step")
            }

        except Exception as e:
            print(f"Webhook error: {e}")
            return {"status": "error", "reason": str(e)}

    def _extract_message_text(self, message: dict) -> str:
        """Extract text content from message"""
        msg_type = message.get("type", "text")

        if msg_type == "text":
            return message.get("text", {}).get("body", "")

        elif msg_type == "image":
            return "[Image received]"

        elif msg_type == "audio":
            return "[Audio received]"

        elif msg_type == "video":
            return "[Video received]"

        elif msg_type == "document":
            return "[Document received]"

        elif msg_type == "location":
            loc = message.get("location", {})
            return f"[Location: {loc.get('latitude')}, {loc.get('longitude')}]"

        elif msg_type == "sticker":
            return "[Sticker received]"

        elif msg_type == "reaction":
            return "[Reaction]"

        return ""

    async def _send_whatsapp_message(self, phone: str, message: str) -> bool:
        """Send message via WhatsApp API (placeholder - integrate with actual WhatsApp API)"""
        # This would integrate with WhatsApp Business API
        # For now, return True indicating message would be sent
        print(f"[WhatsApp] Sending to {phone}: {message[:100]}...")
        return True

    def format_outgoing_message(self, text: str, phone: str) -> dict:
        """Format message for WhatsApp API"""
        return {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {
                "body": text
            }
        }


# Global instance
whatsapp_webhook = WhatsAppWebhook()


def get_whatsapp_webhook() -> WhatsAppWebhook:
    """Get WhatsApp webhook handler"""
    return whatsapp_webhook
