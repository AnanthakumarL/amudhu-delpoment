"""
Rule-Based Flow Engine
Controls conversation flow based on collected data.
LLM is used ONLY for intent understanding - NOT for flow control.
"""

import re
import random
from typing import Optional, Callable
from datetime import datetime

from src.core.config import get_settings
from src.services.mongo_service import get_mongo_service, MongoDBService
from src.services.intent_parser import get_intent_parser, IntentParser
from src.services.product_service import get_product_service, ProductService

settings = get_settings()


# Keywords that mean "show me what you sell" — handled before LLM intent parsing
# so menu requests are instant and free.
_MENU_KEYWORDS = (
    "menu", "products", "product list", "list products", "what do you have",
    "what do you sell", "show me", "show menu", "show products", "show me products",
    "show me the menu", "show your menu", "show your products", "available",
    "catalog", "catalogue", "options",
)


def _wants_menu(message: str) -> bool:
    msg = (message or "").lower().strip()
    return any(kw in msg for kw in _MENU_KEYWORDS)


# Keywords that indicate the user wants to switch/different product at any step.
_CHANGE_KEYWORDS = (
    "change", "different", "other flavour", "other flavor",
    "instead", "rather", "actually", "noo", "nope", "wrong product",
    "change to", "switch to", "want ", "i want ", "i need ",
    "give me ", "get me ", "order ", "need ",
)


def _wants_to_change_product(message: str) -> bool:
    msg = f" {(message or '').lower().strip()} "
    return any(kw in msg for kw in _CHANGE_KEYWORDS)


# User negation/back-out phrases on the variant step ("no", "wrong", "actually
# something else"). Detected loosely — if any of these appears, we abandon the
# remembered candidates and re-show the full menu.
_BACK_OUT_KEYWORDS = (
    "no ", "nope", "noo", "wrong", "different", "other flavour", "other flavor",
    "change", "back", "not this", "something else",
)


def _wants_different_product(message: str) -> bool:
    msg = f" {(message or '').lower().strip()} "
    return any(kw in msg for kw in _BACK_OUT_KEYWORDS)


# ── General question detection ─────────────────────────────────────────────
_QUESTION_STARTERS = (
    "what ", "how ", "why ", "when ", "where ", "which ", "who ", "whose ",
    "is ", "are ", "do ", "does ", "can ", "could ", "will ", "would ",
    "tell me", "i want to know",
)


def _is_general_question(message: str) -> bool:
    msg = (message or "").lower().strip()
    if "?" in msg:
        return True
    # Only trigger on question starters at the beginning of the message
    return any(msg.startswith(m) for m in _QUESTION_STARTERS)


def _answer_product_question(message: str, products: "ProductService") -> str | None:
    """Try to answer a product/price question from the live catalog."""
    msg_lower = (message or "").lower().strip()

    # "how much is X" / "price of X" / "what's the price of X"
    price_patterns = [
        r"(?:how much|what'?s the price|price of|price|rate of|what does .+ cost)\s*(?:is\s*)?(.+)",
        r"(.+?)\s*(?:price|cost|rate)",
    ]
    for pat in price_patterns:
        m = re.search(pat, msg_lower)
        if m:
            name = m.group(1).strip()
            if name:
                variants = products.find_variants(name)
                if variants:
                    lines = [f"💰 *{re.sub(r'\s*\([^)]*\)\s*$', '', variants[0].get('name') or name, flags=re.IGNORECASE).strip()}*"]
                    for v in variants:
                        price = v.get("price")
                        pstr = f"₹{int(price)}" if isinstance(price, (int, float)) and price == int(price) else f"₹{price}"
                        lines.append(f"  • {v.get('name')} — {pstr}")
                    return "\n".join(lines)

    # "do you have X" / "is X available" / "available"
    avail_patterns = [
        r"(?:do you have|is .+ available|available|available in|available\??)\s*(.+)",
        r"(?:do you have|available)\s*(.+?)\??$",
    ]
    for pat in avail_patterns:
        m = re.search(pat, msg_lower)
        if m:
            name = m.group(1).strip().rstrip("?")
            if name and len(name) > 1:
                variants = products.find_variants(name)
                if variants:
                    base = re.sub(r'\s*\([^)]*\)\s*$', '', variants[0].get('name') or name, flags=re.IGNORECASE).strip()
                    return f"✅ Yes! We have *{base}* in:\n" + "\n".join(
                        f"  • {v.get('name')} — ₹{int(v.get('price')) if v.get('price') == int(v.get('price', 0)) else v.get('price')}"
                        for v in variants
                    )
                else:
                    suggestion = products.fuzzy_suggest(name)
                    if suggestion:
                        return f"❌ We don't have that, but we have *{suggestion}* — would you like it?"
                    return "❌ Sorry, we don't have that on the menu right now."

    return None


class FlowStep:
    """Represents a single step in the order flow"""

    def __init__(
        self,
        key: str,
        name: str,
        question: str,
        is_required: bool = True,
        validation_fn: Optional[Callable] = None,
        extract_key: str = None
    ):
        self.key = key
        self.name = name
        self.question = question
        self.is_required = is_required
        self.validation_fn = validation_fn or self._default_validation
        self.extract_key = extract_key or key

    def _default_validation(self, value: str) -> tuple[bool, str]:
        """Default validation - non-empty string"""
        if value and str(value).strip():
            return True, ""
        return False, f"Please provide a valid {self.name.lower()}"

    def validate(self, value: str) -> tuple[bool, str]:
        """Validate the provided value"""
        return self.validation_fn(value)

    def extract_value(self, raw_message: str, step_key: str) -> Optional[str]:
        """Extract value from raw user message"""
        return raw_message.strip()


class FlowEngine:
    """
    Rule-based flow engine for ice cream ordering.
    Controls the conversation flow without using LLM for flow decisions.
    """

    # Default flow steps configuration
    DEFAULT_STEPS = [
        FlowStep("product", "Product Selection", "🍦 Which ice cream would you like to order?"),
        FlowStep("variant", "Variant Selection", "Any specific flavor or variant preference?"),
        FlowStep("quantity", "Quantity Selection", ""),
        FlowStep("addons", "Add-ons", "", is_required=True),
        FlowStep("scooper", "Scooper", "Do you need serving staff?", is_required=True),
        FlowStep("address", "Delivery Address", "📍 Please share your delivery address"),
        FlowStep("delivery_date", "Delivery Date", "📅 When would you like it delivered? (min 2 days from today)"),
        FlowStep("delivery_time", "Delivery Time", "⏰ What time would you like the delivery?\n_(e.g. 10:00 AM, 3 PM, morning, afternoon, evening)_"),
        FlowStep("name", "Name", "May I know your name?"),
        FlowStep("email", "Email", "📧 Please share your email for order confirmation"),
        FlowStep("order_type", "Order Type", "🏷️ Are you ordering as a *business* (company / GST invoice needed) or as an *individual* for personal use?\n\nReply *Business* or *Individual*"),
        FlowStep("gst", "GST Number", "Please provide your GST number for B2B billing", is_required=False),
        FlowStep("summary", "Order Summary", "", is_required=False),
        FlowStep("confirmation", "Confirmation", "✅ Type YES to confirm your order"),
    ]

    def __init__(self):
        self.mongo: MongoDBService = get_mongo_service()
        self.intent_parser: IntentParser = get_intent_parser()
        self.products: ProductService = get_product_service()
        self.steps = {step.key: step for step in self.DEFAULT_STEPS}

    def get_step(self, key: str) -> Optional[FlowStep]:
        """Get step by key"""
        return self.steps.get(key)

    def get_next_step(self, current_step: str) -> Optional[str]:
        """Get next step key"""
        step_keys = list(self.steps.keys())
        try:
            idx = step_keys.index(current_step)
            if idx + 1 < len(step_keys):
                return step_keys[idx + 1]
        except ValueError:
            pass
        return None

    def get_previous_step(self, current_step: str) -> Optional[str]:
        """Get previous step key"""
        step_keys = list(self.steps.keys())
        try:
            idx = step_keys.index(current_step)
            if idx > 0:
                return step_keys[idx - 1]
        except ValueError:
            pass
        return None

    def get_step_index(self, step_key: str) -> int:
        """Get index of step in flow"""
        step_keys = list(self.steps.keys())
        return step_keys.index(step_key) if step_key in step_keys else -1

    def should_skip_step(self, step_key: str, collected_data: dict) -> bool:
        """Check if step should be skipped based on already collected data"""
        value = collected_data.get(step_key)

        # Non-required steps can be skipped if no data
        step = self.get_step(step_key)
        if step and not step.is_required and (value is None or value == ""):
            return True

        # Required steps with pre-filled data need confirmation — don't skip
        if collected_data.get(f"_prefilled_{step_key}"):
            return False

        # Required steps with existing data
        if value is not None and value != "":
            return True

        return False

    def get_next_required_step(self, current_step: str, collected_data: dict) -> Optional[str]:
        """Get next step that hasn't been completed or is required"""
        step_keys = list(self.steps.keys())
        try:
            start_idx = step_keys.index(current_step) + 1
        except ValueError:
            start_idx = 0

        for key in step_keys[start_idx:]:
            if not self.should_skip_step(key, collected_data):
                return key

        return "summary"

    def generate_order_summary(self, collected_data: dict, user_data: dict) -> str:
        """Generate a complete order summary showing every collected detail."""
        product      = collected_data.get("product", "Not selected")
        variant      = collected_data.get("variant")
        quantity     = collected_data.get("quantity", 1)
        is_bulk      = collected_data.get("is_bulk_pack", False)
        persons      = collected_data.get("persons") or collected_data.get("_persons_entered")
        packs_bought = collected_data.get("_packs_bought") or quantity
        addons       = collected_data.get("addons") 
        scooper      = collected_data.get("scooper")
        address      = collected_data.get("address") or "Not provided"
        delivery_date= collected_data.get("delivery_date") or "Not specified"
        delivery_time= collected_data.get("delivery_time") or "Not specified"
        name         = collected_data.get("name") or user_data.get("name") or "Not provided"
        email        = collected_data.get("email") or user_data.get("email") or "Not provided"
        order_type   = collected_data.get("order_type", "B2C")
        gst          = collected_data.get("gst")

        # Build the full cart: completed items in cart[] + current in-progress item
        cart = list(collected_data.get("cart") or [])
        # Include the current item if it wasn't saved to cart yet (single-item flow)
        if collected_data.get("product") and not any(
            i.get("product") == collected_data.get("product") and
            i.get("variant") == collected_data.get("variant") and
            i.get("quantity") == collected_data.get("quantity")
            for i in cart
        ):
            cart.append({
                "product":           product,
                "variant":           variant,
                "product_id":        collected_data.get("product_id"),
                "product_price":     collected_data.get("product_price"),
                "quantity":          quantity,
                "is_bulk":           is_bulk,
                "persons":           persons,
                "_packs_bought":     packs_bought,
                "cup_product":       collected_data.get("cup_product"),
                "cup_product_price": collected_data.get("cup_product_price"),
                "_cup_packs_count":  collected_data.get("_cup_packs_count"),
                "cup_total_cost":    collected_data.get("cup_total_cost"),
            })

        # Compute product_value across all cart items
        product_value = 0.0
        for item in cart:
            bp = float(item.get("product_price") or 0)
            qty = int(item.get("quantity") or 1)
            product_value += bp * qty + float(item.get("cup_total_cost") or 0)

        addon_cost      = float(collected_data.get("addon_total_cost") or 0)
        free_delivery   = product_value > 4000
        delivery_charge = 0 if free_delivery else (200 if address and address != "Not provided" else 0)
        packing_charge  = 0 if free_delivery else 400
        tax             = product_value * 0.05 if order_type == "B2B" else 0
        scooper_cost    = float(collected_data.get("scooper_cost") or 0)
        total           = product_value + addon_cost + scooper_cost + delivery_charge + packing_charge + tax

        order_type_label = "Business (B2B)" if order_type == "B2B" else "Individual (B2C)"

        s = "━━━━━━━━━━━━━━━━━━━━━━\n"
        s += "📋 *YOUR ORDER SUMMARY*\n"
        s += "━━━━━━━━━━━━━━━━━━━━━━\n\n"

        # ── Ice cream items ────────────────────────────────────────
        s += "🍦 *Ice Creams Ordered*\n\n"
        for idx, item in enumerate(cart, 1):
            iname = item.get("variant") or item.get("product") or "Ice Cream"
            bp = float(item.get("product_price") or 0)
            qty = int(item.get("quantity") or 1)
            item_subtotal = bp * qty
            s += f"  *Item {idx}: {iname}*\n"
            if item.get("is_bulk"):
                pks = item.get("_packs_bought") or qty
                prns = item.get("persons") or int(pks) * 40
                s += f"     📦 {pks} bulk pack(s) → {prns} persons — ₹{int(item_subtotal)}\n"
                cp = item.get("cup_product")
                cpacks = int(item.get("_cup_packs_count") or 0)
                ccost = float(item.get("cup_total_cost") or 0)
                if cp and cpacks:
                    s += f"     🍦 {cpacks} cup pack(s) × 24 × {cp} — ₹{int(ccost)}\n"
            else:
                s += f"     × {qty} — ₹{int(item_subtotal)}\n"
            s += "\n"

        if isinstance(addons, list) and addons:
            addon_qty = collected_data.get("addon_qty")
            qty_str = f" × {addon_qty}" if addon_qty else ""
            s += f"🧂 *Add-ons*: {', '.join(addons)}{qty_str}\n"
        if scooper and scooper != 0:
            scooper_cost = float(collected_data.get("scooper_cost") or 0)
            cost_str = "Free" if scooper_cost == 0 else f"₹{int(scooper_cost)}"
            s += f"👋 *Serving Staff*: {scooper} scooper(s) — {cost_str}\n"

        # ── Delivery ───────────────────────────────────────────────
        s += "\n📍 *Delivery Details*\n"
        s += f"   Address  : {address}\n"
        s += f"   Date     : {delivery_date}\n"
        s += f"   Time     : {delivery_time}\n"

        # ── Customer ───────────────────────────────────────────────
        s += "\n👤 *Customer Details*\n"
        s += f"   Name     : {name}\n"
        s += f"   Email    : {email}\n"
        s += f"   Order for: {order_type_label}\n"
        if order_type == "B2B" and gst:
            s += f"   GST No.  : {gst}\n"

        # ── Price ──────────────────────────────────────────────────
        s += "\n💰 *Price Breakdown*\n"
        s += f"   Ice cream total : ₹{int(product_value)}\n"
        if addon_cost > 0:
            s += f"   Add-ons         : ₹{int(addon_cost)}\n"
        if scooper_cost > 0:
            s += f"   Serving Staff   : ₹{int(scooper_cost)}\n"
        if free_delivery:
            s += f"   Delivery        : ₹0 🎉 _(free above ₹4000)_\n"
            s += f"   Packing         : ₹0 🎉 _(free above ₹4000)_\n"
        else:
            s += f"   Delivery        : ₹{delivery_charge}\n"
            s += f"   Packing         : ₹{packing_charge}\n"
        if tax > 0:
            s += f"   GST (5%)        : ₹{int(tax)}\n"
        s += f"\n   *TOTAL: ₹{int(total)}*\n"

        s += "\n━━━━━━━━━━━━━━━━━━━━━━\n"
        s += "✅ Type *YES* to confirm\n"
        s += "✏️ Type *CHANGE* to edit anything"

        return s

    def process_message(
        self,
        phone: str,
        message: str
    ) -> dict:
        """
        Process incoming message and determine response.
        Returns dict with response message and updated state.
        """
        # Get or create user and session
        user = self.mongo.get_or_create_user(phone)
        session = self.mongo.get_or_create_session(phone)
        current_step = session.get("current_step", "product")
        collected_data = session.get("collected_data", {})

        # Add message to history
        self.mongo.add_conversation_message(phone, "user", message)
        self.mongo.update_user_activity(phone)

        response = {"action": None, "message": "", "next_step": current_step, "data": {}}

        # ── Product-change override (works at any step) ────────────────────────
        # If the user says something like "change to kulfi" or "I need X",
        # treat the message as a fresh product selection instead of showing
        # the full menu — go directly to the variant list for that product.
        #
        # EXCEPTION: do NOT fire during A/B/C bulk-option selection — words like
        # "noo" or "no" there mean "re-enter quantity", not "switch product".
        _in_abc_mode = (
            current_step == "quantity" and (
                collected_data.get("_pending_persons") or
                collected_data.get("_awaiting_more_items") or
                collected_data.get("_awaiting_cup_selection")
            )
        )
        if _wants_to_change_product(message) and not _in_abc_mode:
            if collected_data.get("product") or collected_data.get("variant_options"):
                # Extract the product name from the message
                raw = (message or "").lower()
                # Strip common change/switch phrases to get the actual product name
                for prefix in [
                    "change to ", "switch to ", "i need ", "i want ",
                    "instead ", "rather ", "give me ", "want ", "need ",
                ]:
                    if raw.startswith(prefix):
                        raw = raw[len(prefix):].strip()
                        break
                # Remove trailing "instead"/"please"/etc.
                raw = re.sub(r"\s+(instead|please|now|again)\s*$", "", raw).strip()

                # Clear product fields so the next _process_step_data call
                # acts on the new product as if it's the first message.
                for key in ("product", "variant", "product_id", "product_price",
                            "quantity", "is_bulk_pack", "variant_options",
                            "persons", "_persons_entered", "_packs_bought"):
                    collected_data.pop(key, None)

                if raw:
                    # Override the step so the product resolver sees this message
                    # as a fresh product query — _handle_product_step takes over.
                    current_step = "product"
                    session["current_step"] = "product"
                    # Fall through to _process_step_data with the new product name
                else:
                    # Couldn't extract a name — show full menu instead
                    menu = self.products.format_menu()
                    response["message"] = (
                        f"Okay — let's update the product.\n\n"
                        f"{menu}\n\n"
                        "Pick a flavour and size 🍦"
                    )
                    response["action"] = "show_menu"
                    response["next_step"] = "product"
                    self.mongo.update_session_step(phone, "product", collected_data)
                    self.mongo.add_conversation_message(phone, "bot", response["message"])
                    return response

        # ── General question handling (works at any step) ─────────────────────
        if _is_general_question(message) and not _wants_menu(message):
            step_q = self._get_step_question(current_step, collected_data)
            answer = _answer_product_question(message, self.products)
            if not answer:
                # Try LLM for general questions (delivery area, hours, etc.)
                answer = self.intent_parser.answer_friendly(message, step_q)
            if not answer:
                # LLM unavailable — give a generic acknowledgement so it doesn't get lost
                answer = "I'm not sure about that, but our team can help once the order is placed!"
            # If LLM already appended the step question, don't double-add it
            if step_q and step_q not in answer:
                response["message"] = f"{answer}\n\n{step_q}"
            else:
                response["message"] = answer
            response["action"] = "answer_question"
            response["next_step"] = current_step
            self.mongo.add_conversation_message(phone, "bot", response["message"])
            return response

        # Short-circuit explicit menu requests — no need to round-trip the LLM,
        # and works at any point in the flow.
        if _wants_menu(message):
            menu = self.products.format_menu()
            response["message"] = (
                f"{menu}\n\n"
                "Tell me which one you'd like and how many. 🍦"
            )
            response["action"] = "show_menu"
            response["next_step"] = "product"
            self.mongo.update_session_step(phone, "product", collected_data)
            self.mongo.add_conversation_message(phone, "bot", response["message"])
            return response

        # ── Cup ice cream selection (after Option B) ──────────────────────────
        if current_step == "quantity" and collected_data.get("_awaiting_cup_selection"):
            cup_packs_count = int(collected_data.get("_cup_packs_count") or 1)
            cup_variants = self.products.get_cup_variants()
            chosen_cup = self.products.match_variant(cup_variants, message)
            if not chosen_cup:
                # Try fuzzy name match
                cup_names = [c.get("name") or "" for c in cup_variants]
                from difflib import get_close_matches
                close = get_close_matches((message or "").strip(), cup_names, n=1, cutoff=0.5)
                if close:
                    chosen_cup = next((c for c in cup_variants if c.get("name") == close[0]), None)
            if chosen_cup:
                cup_price = float(chosen_cup.get("price") or 0)
                cup_total = cup_price * cup_packs_count * 24
                collected_data["cup_product"] = chosen_cup.get("name")
                collected_data["cup_product_id"] = chosen_cup.get("id")
                collected_data["cup_product_price"] = cup_price
                collected_data["cup_total_cost"] = cup_total
                collected_data.pop("_awaiting_cup_selection", None)
                lower_packs = int(collected_data.get("_lower_packs") or collected_data.get("quantity") or 0)
                bulk_price = float(collected_data.get("_bulk_price") or collected_data.get("product_price") or 0)
                bulk_total = bulk_price * lower_packs
                grand_total = int(bulk_total + cup_total)
                prefix = (
                    f"✅ *Cup ice cream selected: {chosen_cup.get('name')}* (₹{int(cup_price)}/cup)\n\n"
                    f"📦 {lower_packs} bulk pack(s) — {lower_packs * 40} persons\n"
                    f"🍦 {cup_packs_count} cup pack(s) × 24 × {chosen_cup.get('name')} — {cup_packs_count * 24} persons\n"
                    f"💰 Subtotal: ₹{grand_total}"
                )
                self._ask_add_more(phone, collected_data, response, prefix)
                return response
            else:
                # Couldn't match — re-show cup options
                cup_menu = self.products.format_cup_menu()
                response["message"] = (
                    f"Sorry, I couldn't find that cup flavour. Please pick one:\n\n"
                    f"{cup_menu}\n\n"
                    f"Reply with the name or number."
                )
                response["action"] = "ask_cup_flavour"
                response["next_step"] = "quantity"
                return response

        # ── "Add more ice creams?" handler ────────────────────────────────────
        if current_step == "quantity" and collected_data.get("_awaiting_more_items"):
            msg_lower = (message or "").lower().strip()
            _yes = any(w in msg_lower for w in ("yes", "yeah", "yep", "add", "more", "another", "ya", "sure", "ok", "okay"))
            _no  = any(w in msg_lower for w in ("no", "nope", "nah", "done", "finish", "continue", "proceed", "that's all", "thats all"))
            if _yes:
                collected_data.pop("_awaiting_more_items", None)
                self._clear_current_item(collected_data)
                self.mongo.update_session_step(phone, "product", collected_data)
                menu = self.products.format_menu()
                response["message"] = (
                    f"🍦 Sure! Pick another ice cream:\n\n{menu}\n\n"
                    f"Tell me the flavour and size."
                )
                response["action"] = "add_more_item"
                response["next_step"] = "product"
                return response
            elif _no:
                collected_data.pop("_awaiting_more_items", None)
                self._clear_stale_downstream(collected_data)
                # Route to addons step — _handle_addons_step will show the menu
                self.mongo.update_session_step(phone, "addons", collected_data)
                addon_menu = self.products.format_addon_menu()
                if addon_menu:
                    collected_data["_addons_shown"] = True
                    self.mongo.update_session_step(phone, "addons", collected_data)
                    response["message"] = (
                        f"🧂 *Add-ons*\n\n"
                        f"Would you like to add any of the following?\n\n"
                        f"{addon_menu}\n\n"
                        f"Reply with the number(s) or name(s) — e.g. *1, 3* or *Cup & Spoon*.\n"
                        f"Type *none* or *skip* if you don't need any."
                    )
                    response["action"] = "ask_addons"
                    response["next_step"] = "addons"
                else:
                    # No add-ons in catalog — skip straight to address
                    collected_data["addons"] = []
                    next_step = self.get_next_required_step("quantity", collected_data)
                    self.mongo.update_session_step(phone, next_step or "address", collected_data)
                    step = self.get_step(next_step) if next_step else None
                    response["message"] = step.question if step and step.question else "📍 Please share your delivery address"
                    response["action"] = "continue"
                    response["next_step"] = next_step or "address"
                return response
            else:
                cart = collected_data.get("cart") or []
                response["message"] = (
                    f"🛒 *Cart:*\n{self._format_cart_lines(cart)}\n\n"
                    f"➕ Add *another ice cream*?\n"
                    f"Reply *Yes* to add more or *No* to continue with delivery details."
                )
                response["action"] = "ask_add_more"
                response["next_step"] = "quantity"
                return response

        # ── Bulk quantity option chooser (A/B/C) ───────────────────────────────
        # When user is on quantity step and we already showed them option A/B/C.
        if current_step == "quantity" and collected_data.get("_pending_persons"):
            msg_lower = (message or "").lower().strip()
            _bulk_display = collected_data.get("variant") or collected_data.get("product") or "bulk pack"
            _bulk_price = float(collected_data.get("_bulk_price") or collected_data.get("product_price") or 0)

            # Normalise numeric aliases: "1" → "a", "2" → "b", "3" → "c"
            if msg_lower in ("1", "option 1"):
                msg_lower = "a"
            elif msg_lower in ("2", "option 2"):
                msg_lower = "b"
            elif msg_lower in ("3", "option 3"):
                msg_lower = "c"

            if msg_lower in ("a", "option a"):
                self._apply_bulk_choice(collected_data, "exact")
                packs = collected_data.get("_packs_bought", 0)
                covered = int(packs) * 40
                prefix = (
                    f"✅ *Option A confirmed!*\n\n"
                    f"📦 {packs} × {_bulk_display} (₹{int(_bulk_price)}/pack)\n"
                    f"👥 Covers {covered} persons\n"
                    f"💰 Subtotal: ₹{collected_data.get('_exact_total')} 🍦"
                )
                self._ask_add_more(phone, collected_data, response, prefix)
                return response

            elif msg_lower in ("b", "option b"):
                lower_packs = collected_data.get("_lower_packs", 0)
                cup_packs = collected_data.get("_cup_packs", 0)
                self._apply_bulk_choice(collected_data, "mixed")
                covered = int(lower_packs) * 40 + int(cup_packs) * 24
                # Ask which cup ice cream before moving on
                cup_menu = self.products.format_cup_menu()
                collected_data["_awaiting_cup_selection"] = True
                collected_data["_cup_packs_count"] = int(cup_packs)
                self.mongo.update_session_step(phone, "quantity", collected_data)
                response["message"] = (
                    f"✅ *Option B — {lower_packs} bulk + {cup_packs} cup pack(s) of 24*\n"
                    f"👥 Covers {covered} persons\n\n"
                    f"🍦 *Which cup ice cream would you like for the {cup_packs} cup pack(s)?*\n\n"
                    f"{cup_menu}\n\n"
                    f"Reply with the name or number."
                )
                response["action"] = "ask_cup_flavour"
                response["next_step"] = "quantity"
                return response

            elif msg_lower in ("c", "option c"):
                original_persons = int(collected_data.get("_pending_persons", 0))
                lower_packs = collected_data.get("_lower_packs", 0)
                self._apply_bulk_choice(collected_data, "lower")
                covered = int(lower_packs) * 40
                short_by = original_persons - covered
                prefix = (
                    f"✅ *Option C confirmed!*\n\n"
                    f"📦 {lower_packs} bulk pack(s) × {_bulk_display}\n"
                    f"👥 Covers {covered} persons ({short_by} short of {original_persons})\n"
                    f"💰 Subtotal: ₹{collected_data.get('_lower_total')}"
                )
                self._ask_add_more(phone, collected_data, response, prefix)
                return response

            # Fallback: user typed something unrecognised at the A/B/C step.
            # Check for "34 bulk" / "5 packs" — user wants to set pack count directly.
            # Otherwise if message contains any number treat it as a fresh persons count.
            import re as _re2
            _has_bulk_kw = any(kw in msg_lower for kw in ("bulk", "pack", "packs", "litre", "liter", "ltr"))
            nums = _re2.findall(r'\d+', message)
            if nums and _has_bulk_kw:
                # User said something like "34 bulk" — treat number as direct pack count
                pack_count = int(nums[0])
                price = float(collected_data.get("_bulk_price") or collected_data.get("product_price") or 0)
                total_cost = pack_count * price
                covered = pack_count * 40
                for k in ("_pending_persons", "_exact_packs", "_lower_packs",
                          "_cup_packs", "_exact_total", "_lower_total", "_cup_total",
                          "_bulk_price", "quantity", "persons", "_awaiting_cup_selection",
                          "_cup_packs_count"):
                    collected_data.pop(k, None)
                collected_data["quantity"] = pack_count
                collected_data["is_bulk_pack"] = True
                collected_data["_packs_bought"] = pack_count
                collected_data["_bulk_only"] = True
                self.mongo.update_session_step(phone, "quantity", collected_data)
                prefix = (
                    f"✅ *{pack_count} bulk pack(s) confirmed!*\n\n"
                    f"📦 {pack_count} × {_bulk_display} (₹{int(price)}/pack)\n"
                    f"👥 Covers {covered} persons\n"
                    f"💰 Subtotal: ₹{int(total_cost)} 🍦"
                )
                self._ask_add_more(phone, collected_data, response, prefix)
                return response
            elif nums:
                # Plain number — treat as new persons count; clear pending state and fall through
                for k in ("_pending_persons", "_exact_packs", "_lower_packs",
                          "_cup_packs", "_exact_total", "_lower_total", "_cup_total",
                          "_bulk_price", "quantity", "persons"):
                    collected_data.pop(k, None)
                self.mongo.update_session_step(phone, "quantity", collected_data)
                current_step = "quantity"
                session["current_step"] = "quantity"
            else:
                # No number — re-show the options
                persons_saved = collected_data.get("_pending_persons")
                if persons_saved:
                    response["message"] = (
                        f"Please reply *A*, *B*, or *C* (or *1*, *2*, *3*) to choose an option for "
                        f"*{persons_saved} persons*, or say *change* to pick a different flavour."
                    )
                    response["action"] = "ask_abc"
                    response["next_step"] = "quantity"
                    return response

        # Parse intent
        intent_data = self.intent_parser.parse_intent(
            message,
            current_step,
            collected_data
        )
        intent = intent_data.get("intent", "unknown")
        extracted_values = intent_data.get("extracted_values", {})

        # Handle intents
        if intent == "greeting":
            welcome = "👋 Hi! Welcome to *Amudhu Ice Creams* — Chennai's favourite!"
            menu_message = (
                "Here's our live menu:\n\n"
                f"{self.products.format_menu()}\n\n"
                "Just tell me what you'd like and how many. 🍦"
            )
            response["messages"] = [welcome, menu_message]
            response["message"] = f"{welcome}\n\n{menu_message}"
            response["action"] = "continue"
            response["next_step"] = "product"
            self.mongo.update_session_step(phone, "product", collected_data)

        elif intent == "help":
            response["message"] = self._get_help_message()
            response["action"] = "continue"

        elif intent == "cancel":
            response["message"] = "❌ Order cancelled.\n\nNo worries! If you'd like to start a new order, just let me know!\n\n🍦 What would you like to order?"
            response["action"] = "cancel"
            response["next_step"] = "product"
            collected_data = {k: None for k in collected_data}
            self.mongo.update_session_step(phone, "product", collected_data)

        elif intent == "confirmation" and current_step == "confirmation":
            return self._confirm_order(phone, user, session, collected_data)

        elif intent == "change_data":
            # User wants to change data - identify what to change
            response["message"] = "Sure! What would you like to change?\n\n"
            for key, value in collected_data.items():
                if value:
                    response["message"] += f"• {key}: {value}\n"
            response["message"] += "\nTell me what to update."
            response["action"] = "change"
            response["next_step"] = current_step

        elif intent in ["provide_data", "continue", "confirmation", "unknown"]:
            response = self._process_step_data(
                phone,
                message,
                current_step,
                collected_data,
                extracted_values
            )

        # Add bot response(s) to history — log each outbound message individually
        # so multi-part replies (welcome + menu) are visible as separate turns.
        outgoing = response.get("messages") or ([response["message"]] if response.get("message") else [])
        for m in outgoing:
            if m:
                self.mongo.add_conversation_message(phone, "bot", m)

        return response

    def _process_step_data(
        self,
        phone: str,
        message: str,
        current_step: str,
        collected_data: dict,
        extracted_values: dict
    ) -> dict:
        """Process data for current step"""
        response = {"action": None, "message": "", "next_step": current_step, "data": {}}

        # ── Pre-filled confirmation — must run first before any extraction ────────
        # These steps may have been pre-filled from a prior message. If the user
        # says "yes", preserve the existing value and advance without extraction.
        _prefill_steps = ("name", "email", "address", "order_type",
                          "delivery_date", "delivery_time")
        if current_step in _prefill_steps and collected_data.get(f"_prefilled_{current_step}"):
            _yes_words = ("yes", "yeah", "yep", "ok", "okay", "sure", "correct",
                          "confirm", "right", "perfect", "ya", "fine")
            _yes = any(w in (message or "").lower() for w in _yes_words)
            if _yes:
                collected_data.pop(f"_prefilled_{current_step}", None)
                self._extract_proactive_data(message, current_step, collected_data)
                self.mongo.update_session_step(phone, current_step, collected_data)
                next_step = self.get_next_required_step(current_step, collected_data)
                if next_step in ("summary", "confirmation"):
                    user = self.mongo.get_user_by_phone(phone) or {}
                    summary = self.generate_order_summary(collected_data, user)
                    response["message"] = summary
                    response["action"] = "show_summary"
                    response["next_step"] = "confirmation"
                    collected_data["summary_shown"] = True
                    self.mongo.update_session_step(phone, "confirmation", collected_data)
                elif next_step:
                    step_obj = self.get_step(next_step)
                    prefill_key = f"_prefilled_{next_step}"
                    if collected_data.get(prefill_key):
                        pre_value = collected_data.get(next_step, "")
                        label = (step_obj.name if step_obj else next_step.replace("_", " ")).title()
                        response["message"] = (
                            f"I noted your *{label}* as: *{pre_value}*\n\n"
                            f"Is that correct? Reply *Yes* to confirm or provide a different value."
                        )
                        response["action"] = "confirm_prefilled"
                    else:
                        response["message"] = step_obj.question if step_obj and step_obj.question else f"Please provide your {next_step.replace('_', ' ')}"
                        response["action"] = "continue"
                    response["next_step"] = next_step
                    self.mongo.update_session_step(phone, next_step, collected_data)
                return response
            else:
                # User gave a different value — clear prefill and fall through to normal handling
                collected_data.pop(f"_prefilled_{current_step}", None)

        # Product step: resolve to a catalog item, branching to variant selection
        # when the named flavour exists in multiple sizes.
        if current_step == "product":
            handled = self._handle_product_step(phone, message, collected_data, response)
            if handled:
                return response

        # Variant step: match user's free-form answer against the remembered
        # options ("cup 50ml" / "1" / "bulk" — all should resolve back to the
        # specific catalog product).
        if current_step == "variant" and collected_data.get("variant_options"):
            handled = self._handle_variant_step(phone, message, collected_data, response)
            if handled:
                return response

        # ── Add-ons step ──────────────────────────────────────────────────────
        if current_step == "addons":
            handled = self._handle_addons_step(phone, message, collected_data, response)
            if handled:
                return response

        # ── Scooper step ──────────────────────────────────────────────────────
        if current_step == "scooper":
            handled = self._handle_scooper_step(phone, message, collected_data, response)
            if handled:
                return response

        # Try to extract structured data
        extraction = self.intent_parser.extract_step_data(message, current_step, current_step)
        extracted = extraction.get("extracted", {})

        # Merge extracted values
        if extracted:
            for key, value in extracted.items():
                if value and str(value).strip():
                    collected_data[key] = str(value)
        elif message.strip():
            # Use raw message as value
            step = self.get_step(current_step)
            if step:
                collected_data[current_step] = message.strip()

        # ── Cup quantity A/B chooser — must run BEFORE quantity parsing ──────────
        # so "1"/"2" are treated as Option A/B, not as a cup count.
        if current_step == "quantity" and collected_data.get("_pending_cup_qty"):
            msg_lower = (message or "").lower().strip()
            lower = int(collected_data.get("_cup_lower") or 0)
            upper = int(collected_data.get("_cup_upper") or 0)
            cup_price = float(collected_data.get("_cup_price") or 0)
            display_name = collected_data.get("variant") or collected_data.get("product") or "cup"

            if msg_lower in ("1", "option 1"):
                msg_lower = "a" if lower > 0 else "b"
            elif msg_lower in ("2", "option 2"):
                msg_lower = "b"

            chosen_qty = None
            if lower == 0:
                if msg_lower in ("a", "option a", "b", "option b"):
                    chosen_qty = upper
            else:
                if msg_lower in ("a", "option a"):
                    chosen_qty = lower
                elif msg_lower in ("b", "option b"):
                    chosen_qty = upper

            if chosen_qty is None:
                nums = re.findall(r'\d+', message)
                if nums:
                    n = int(nums[0])
                    if n % 24 == 0 and n > 0:
                        chosen_qty = n

            if chosen_qty is not None:
                total_price = cup_price * chosen_qty
                for k in ("_pending_cup_qty", "_cup_lower", "_cup_upper", "_cup_price"):
                    collected_data.pop(k, None)
                collected_data["quantity"] = chosen_qty
                collected_data["_packs_bought"] = chosen_qty
                self.mongo.update_session_step(phone, "quantity", collected_data)
                prefix = (
                    f"✅ *{chosen_qty} × {display_name}* (₹{int(cup_price)}/cup)\n"
                    f"💰 Subtotal: ₹{int(total_price)}"
                )
                self._ask_add_more(phone, collected_data, response, prefix)
                return response
            else:
                lower_total = int(cup_price * lower)
                upper_total = int(cup_price * upper)
                options = []
                if lower > 0:
                    options.append(f"📦 *Option A:* {lower} cups — ₹{lower_total}")
                options.append(f"📦 *Option {'B' if lower > 0 else 'A'}:* {upper} cups — ₹{upper_total}")
                response["message"] = (
                    "Please reply *A* or *B* to choose:\n\n" + "\n".join(options)
                )
                response["action"] = "cup_qty_options"
                response["next_step"] = "quantity"
                return response

        # For quantity step, try to parse number
        if current_step == "quantity":
            qty = self._extract_quantity(message)
            if qty:
                # Auto-detect bulk from variant name if is_bulk_pack was not persisted
                _vname = (collected_data.get("variant") or collected_data.get("product") or "").lower()
                is_bulk = collected_data.get("is_bulk_pack") or ("4 litre" in _vname or "bulk" in _vname)
                price = collected_data.get("product_price") or 0
                product_name = collected_data.get("product") or ""
                variant_name = collected_data.get("variant") or ""
                display_name = variant_name or product_name

                if is_bulk and price:
                    persons = qty
                    packs_needed = (persons + 39) // 40  # ceiling division
                    remainder = persons % 40

                    if remainder == 0:
                        # Exact multiple — one option
                        total_price = float(price) * packs_needed
                        collected_data["quantity"] = packs_needed
                        collected_data["persons"] = persons
                        collected_data["_persons_entered"] = persons
                        collected_data["_packs_bought"] = packs_needed
                        collected_data["_bulk_only"] = True
                        collected_data.pop("_cups_added", None)
                        response["message"] = (
                            f"🧮 *{persons} persons* → *{packs_needed} pack(s)*\n\n"
                            f"📦 {packs_needed} × {display_name} (₹{int(price)}/pack)\n"
                            f"💰 Subtotal: ₹{int(total_price)}\n\n"
                            f"That's the right amount for your event! 🍦"
                        )
                        prefix = (
                            f"🧮 *{persons} persons* → *{packs_needed} pack(s)*\n\n"
                            f"📦 {packs_needed} × {display_name} (₹{int(price)}/pack)\n"
                            f"💰 Subtotal: ₹{int(total_price)}\n\n"
                            f"That's the right amount for your event! 🍦"
                        )
                        self._ask_add_more(phone, collected_data, response, prefix)
                        return response

                    else:
                        # Non-multiple of 40 — show options
                        cup_pack = 24  # cups must be in multiples of 24
                        exact_packs = packs_needed          # round up (e.g. 100 persons → 3 bulk)
                        lower_packs = packs_needed - 1      # round down (e.g. 100 persons → 2 bulk)
                        lower_cup_packs = remainder // cup_pack + (1 if remainder % cup_pack else 0)

                        exact_total = int(float(price)) * exact_packs
                        lower_total = int(float(price)) * lower_packs
                        cups_price = 10  # cheapest cup price
                        cup_total = lower_cup_packs * cup_pack * cups_price

                        extra_a = exact_packs * 40 - persons
                        msg = (
                            f"🧮 *{persons} persons* — 1 pack = 40 persons, so here are your options:\n\n"
                            f"📦 *Option A:* {exact_packs} bulk pack(s)\n"
                            f"   Covers {exact_packs * 40} persons ({extra_a} extra servings)\n"
                            f"   💰 ₹{exact_total}\n\n"
                            f"📦 *Option B:* {lower_packs} bulk + {lower_cup_packs} cup pack(s) of 24\n"
                            f"   Covers {lower_packs * 40 + lower_cup_packs * cup_pack} persons\n"
                            f"   💰 ₹{lower_total + cup_total}\n\n"
                            f"📦 *Option C:* {lower_packs} bulk only\n"
                            f"   Covers {lower_packs * 40} persons — {persons - lower_packs * 40} short\n"
                            f"   💰 ₹{lower_total}\n\n"
                            f"Reply *A*, *B*, or *C* to choose, or say *change* to pick a different flavour."
                        )
                        collected_data["_pending_persons"] = persons
                        collected_data["_bulk_price"] = price
                        collected_data["_exact_packs"] = exact_packs
                        collected_data["_lower_packs"] = lower_packs
                        collected_data["_cup_packs"] = lower_cup_packs
                        collected_data["_exact_total"] = exact_total
                        collected_data["_lower_total"] = lower_total
                        collected_data["_cup_total"] = cup_total
                        collected_data.pop("quantity", None)
                        collected_data.pop("persons", None)
                        response["message"] = msg
                        response["action"] = "bulk_options"
                        response["next_step"] = "quantity"  # stay on quantity, await A/B/C
                        self.mongo.update_session_step(phone, current_step, collected_data)
                        return response

                elif not is_bulk and price:
                    # Cup ice cream — must order in multiples of 24
                    _is_cup = any(k in _vname for k in ("50ml", "100ml", "cup"))
                    if _is_cup and qty % 24 != 0:
                        lower = (qty // 24) * 24       # round down to nearest 24
                        upper = lower + 24              # round up to next 24
                        lower_total = int(float(price) * lower)
                        upper_total = int(float(price) * upper)
                        short = qty - lower
                        extra = upper - qty
                        options = []
                        if lower > 0:
                            options.append(
                                f"📦 *Option A:* {lower} cups (−{short} less)\n"
                                f"   💰 ₹{lower_total}"
                            )
                        options.append(
                            f"📦 *Option {'B' if lower > 0 else 'A'}:* {upper} cups (+{extra} extra)\n"
                            f"   💰 ₹{upper_total}"
                        )
                        opts_text = "\n\n".join(options)
                        collected_data["_pending_cup_qty"] = qty
                        collected_data["_cup_lower"] = lower
                        collected_data["_cup_upper"] = upper
                        collected_data["_cup_price"] = float(price)
                        collected_data.pop("quantity", None)
                        self.mongo.update_session_step(phone, "quantity", collected_data)
                        response["message"] = (
                            f"🧮 *{qty} cups* — cups must be ordered in multiples of 24.\n\n"
                            f"{opts_text}\n\n"
                            f"Reply *A* or *B* (or *1*/*2*) to choose."
                        )
                        response["action"] = "cup_qty_options"
                        response["next_step"] = "quantity"
                        return response
                    else:
                        # Already a valid multiple of 24 (or not a cup — accept as-is)
                        total_price = float(price) * qty
                        collected_data["quantity"] = qty
                        collected_data["_packs_bought"] = qty
                        prefix = (
                            f"🛒 *{qty} × {display_name}* (₹{int(price)}/cup)\n"
                            f"💰 Subtotal: ₹{int(total_price)}"
                        )
                        self._ask_add_more(phone, collected_data, response, prefix)
                        return response

        # Address validation — reject vague inputs and ask for more detail
        if current_step == "address":
            # Strip proactively-provided contact info from address text
            addr = re.sub(
                r'[,.]?\s*(?:my\s+)?name\s+is\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,2}\s+and\s+(?:my\s+)?email\s+(?:is\s+)?[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}',
                '', message, flags=re.IGNORECASE
            )
            addr = re.sub(
                r'[,.]?\s*(?:my\s+)?(?:name\s+is|i\s+am|i\'m|call\s+me)\s+[A-Za-z]+(?:\s+[A-Za-z]+){0,2}',
                '', addr, flags=re.IGNORECASE
            )
            addr = re.sub(r'[,.]?\s*(?:and\s+)?(?:my\s+)?email[^\s]*\s*[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', '', addr, flags=re.IGNORECASE)
            addr = re.sub(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', '', addr, flags=re.IGNORECASE)
            addr = re.sub(r'\s{2,}', ' ', addr).strip().rstrip('.,')
            invalid_reason = self._validate_address(addr)
            if invalid_reason:
                collected_data.pop("address", None)
                self.mongo.update_session_step(phone, "address", collected_data)
                response["message"] = (
                    f"⚠️ {invalid_reason}\n\n"
                    f"📍 Please share your *complete delivery address*, for example:\n"
                    f"_12, Anna Nagar 2nd Street, Tambaram, Chennai – 600045_"
                )
                response["action"] = "invalid_address"
                response["next_step"] = "address"
                return response
            collected_data["address"] = addr

        # For order_type step, normalize to B2B/B2C and re-prompt if unclear
        if current_step == "order_type":
            order_type = self._normalize_order_type(message)
            if order_type:
                collected_data["order_type"] = order_type
            else:
                self.mongo.update_session_step(phone, "order_type", collected_data)
                response["message"] = (
                    "🏷️ Please clarify — are you ordering as a:\n\n"
                    "🏢 *Business* — company purchase, need GST invoice\n"
                    "👤 *Individual* — personal/family/event use\n\n"
                    "Reply *Business* or *Individual*"
                )
                response["action"] = "invalid_order_type"
                response["next_step"] = "order_type"
                return response

        # Delivery date validation — must be at least 2 days from today
        if current_step == "delivery_date":
            parsed_date, date_error = self._parse_and_validate_date(message.strip())
            if date_error:
                collected_data.pop("delivery_date", None)
                self.mongo.update_session_step(phone, "delivery_date", collected_data)
                response["message"] = f"⚠️ {date_error}"
                response["action"] = "invalid_date"
                response["next_step"] = "delivery_date"
                return response
            collected_data["delivery_date"] = parsed_date

            # Also try to extract delivery time from the same message
            parsed_time, _ = self._parse_and_validate_time(message.strip())
            if parsed_time:
                collected_data["delivery_time"] = parsed_time
                collected_data["_prefilled_delivery_time"] = True
                self.mongo.update_session_step(phone, "delivery_time", collected_data)
                response["message"] = (
                    f"✅ Delivery date: *{parsed_date}*\n\n"
                    f"I also noted your delivery time as *{parsed_time}*. Is that correct?\n"
                    f"Reply *Yes* to confirm or type a different time."
                )
                response["action"] = "confirm_prefilled"
                response["next_step"] = "delivery_time"
                return response

            # No time in message — ask for it
            self.mongo.update_session_step(phone, "delivery_time", collected_data)
            response["message"] = (
                f"✅ Delivery date: *{parsed_date}*\n\n"
                f"⏰ What time would you like the delivery?\n"
                f"_(e.g. 10:00 AM, 3 PM, morning, afternoon, evening)_"
            )
            response["action"] = "ask_delivery_time"
            response["next_step"] = "delivery_time"
            return response

        # Delivery time validation
        if current_step == "delivery_time":
            # If time was pre-filled from the date message, check for confirmation
            if collected_data.get("_prefilled_delivery_time"):
                _yes = any(w in (message or "").lower() for w in (
                    "yes", "yeah", "yep", "ok", "okay", "sure", "correct",
                    "confirm", "right", "perfect", "ya", "fine",
                ))
                if _yes:
                    # Confirmed — just clear the flag and move on
                    collected_data.pop("_prefilled_delivery_time", None)
                    # Fall through to the save/advance block below
                else:
                    # User provided a different time
                    parsed_time, time_error = self._parse_and_validate_time(message.strip())
                    if time_error:
                        pre = collected_data.get("delivery_time", "")
                        response["message"] = (
                            f"⚠️ {time_error}\n\n"
                            f"_(I had noted *{pre}* — reply *Yes* to keep it or enter a new time.)_"
                        )
                        response["action"] = "invalid_time"
                        response["next_step"] = "delivery_time"
                        return response
                    collected_data["delivery_time"] = parsed_time
                    collected_data.pop("_prefilled_delivery_time", None)
            else:
                parsed_time, time_error = self._parse_and_validate_time(message.strip())
                if time_error:
                    response["message"] = f"⚠️ {time_error}"
                    response["action"] = "invalid_time"
                    response["next_step"] = "delivery_time"
                    return response
                collected_data["delivery_time"] = parsed_time

        # For GST step: skip if B2C, store if B2B, always advance
        if current_step == "gst":
            if collected_data.get("order_type") != "B2B":
                # B2C — skip GST entirely, mark as handled
                collected_data["gst"] = None
            elif message.strip():
                collected_data["gst"] = message.strip().upper()
            # Always save and advance — GST is optional so don't re-ask
            self.mongo.update_session_step(phone, "gst", collected_data)
            next_step = self.get_next_required_step("gst", collected_data)
            if next_step in ("summary", "confirmation"):
                user = self.mongo.get_user_by_phone(phone) or {}
                summary = self.generate_order_summary(collected_data, user)
                response["message"] = summary
                response["action"] = "collect_data"
                response["next_step"] = next_step
                return response
            # If somehow no next step, advance anyway
            response["action"] = "collect_data"
            response["next_step"] = next_step or "confirmation"
            step_obj = self.get_step(next_step) if next_step else None
            response["message"] = step_obj.question if step_obj and step_obj.question else ""
            return response

        # Proactively extract data for future steps from the current message
        self._extract_proactive_data(message, current_step, collected_data)

        # Save to database immediately
        self.mongo.update_session_step(phone, current_step, collected_data)

        # Move to next step
        next_step = self.get_next_required_step(current_step, collected_data)

        # Always show the full order summary before asking for confirmation,
        # regardless of whether next_step is "summary" or "confirmation".
        if next_step in ("summary", "confirmation") or (
            next_step == "confirmation" and not collected_data.get("summary_shown")
        ):
            user = self.mongo.get_user_by_phone(phone) or {}
            summary = self.generate_order_summary(collected_data, user)
            response["message"] = summary
            response["action"] = "show_summary"
            response["next_step"] = "confirmation"
            collected_data["summary_shown"] = True
            self.mongo.update_session_step(phone, "confirmation", collected_data)

        elif next_step:
            step = self.get_step(next_step)
            # If this step has pre-filled data, ask for confirmation instead of the default question
            prefill_key = f"_prefilled_{next_step}"
            if collected_data.get(prefill_key):
                pre_value = collected_data.get(next_step, "")
                label = (step.name if step else next_step.replace("_", " ")).title()
                step_q = step.question if step and step.question else f"Please provide your {next_step.replace('_', ' ')}"
                response["message"] = (
                    f"I noted your *{label}* as: *{pre_value}*\n\n"
                    f"Is that correct? Reply *Yes* to confirm or provide a different value."
                )
                response["action"] = "confirm_prefilled"
            else:
                if step and step.question:
                    response["message"] = step.question
                else:
                    response["message"] = f"Please provide your {next_step.replace('_', ' ')}"
                response["action"] = "continue"
            response["next_step"] = next_step
            self.mongo.update_session_step(phone, next_step, collected_data)
        else:
            response["message"] = "Thank you! Your order has been recorded."
            response["action"] = "complete"

        return response

    def _handle_product_step(
        self,
        phone: str,
        message: str,
        collected_data: dict,
        response: dict,
    ) -> bool:
        """Resolve user's product request. Returns True if response was filled."""
        from src.services.product_service import _strip_size_suffix

        query = (message or "").strip()
        if not query:
            return False

        # Let the LLM strip noise ("i want", "please get me") if it can.
        try:
            extraction = self.intent_parser.extract_step_data(message, "product", "product")
            extracted = extraction.get("extracted", {}) or {}
            llm_name = extracted.get("product") or extracted.get("name") or ""
            if llm_name and isinstance(llm_name, str):
                query = llm_name.strip() or query
        except Exception:
            pass

        variants = self.products.find_variants(query)

        if not variants:
            # Suggest the closest menu item for spelling mistakes
            suggestion = self.products.fuzzy_suggest(query)
            if suggestion:
                response["message"] = (
                    f"Did you mean *{suggestion}*? "
                    f"That's on the menu — go ahead and select it, or reply with the correct name."
                )
            else:
                response["message"] = (
                    "Hmm, I couldn't find that flavour on the menu. "
                    "Here's what we have right now — please pick one:\n\n"
                    f"{self.products.format_menu()}"
                )
            response["action"] = "show_menu"
            response["next_step"] = "product"
            self.mongo.update_session_step(phone, "product", collected_data)
            return True

        # Always present the available size(s) and let the user pick — even
        # when the catalog has only one matching variant. This makes the
        # confirmation explicit and gives the user a clean way to back out
        # ("no" / "different" → menu).
        base_name = _strip_size_suffix(variants[0].get("name") or query)

        # Clear all downstream data from previous orders so steps like address,
        # delivery date, and addons are always freshly asked for each new order.
        _downstream = [
            "product_id", "variant", "product_price", "quantity", "is_bulk_pack",
            "persons", "_persons_entered", "_packs_bought", "_bulk_only", "_cups_added",
            "_pending_persons", "_bulk_price", "_exact_packs", "_lower_packs",
            "_cup_packs", "_exact_total", "_lower_total", "_cup_total",
            "_awaiting_cup_selection", "_cup_packs_count",
            "_pending_cup_qty", "_cup_lower", "_cup_upper", "_cup_price",
            "cup_product", "cup_product_id", "cup_product_price", "cup_total_cost",
            "addons", "addon_qty", "addon_products", "addon_total_cost",
            "_addons_shown", "_addon_selected", "_addon_qty_pending",
            "scooper", "address", "delivery_date", "delivery_time",
            "name", "email", "order_type", "gst", "summary_shown",
        ]
        for k in _downstream:
            collected_data.pop(k, None)

        collected_data["product"] = base_name
        collected_data["variant_options"] = [
            {
                "id": v.get("id"),
                "name": v.get("name"),
                "price": v.get("price"),
                "category_id": v.get("category_id"),
            }
            for v in variants
        ]
        self.mongo.update_session_step(phone, "variant", collected_data)

        if len(variants) == 1:
            intro = f"Got it — *{base_name}* is available in:"
            cta = "Reply with the size or *1* to confirm. Say *menu* to pick a different flavour."
        else:
            intro = f"Great — *{base_name}* comes in a few sizes. Which one?"
            cta = (
                "Reply with the size or the number "
                "(e.g. \"50ml\", \"bulk\", or \"1\"). "
                "Say *menu* to pick a different flavour."
            )

        response["message"] = (
            f"{intro}\n\n"
            f"{self.products.format_variants(variants)}\n\n"
            f"{cta}"
        )
        response["next_step"] = "variant"
        response["action"] = "ask_variant"
        return True

    def _handle_variant_step(
        self,
        phone: str,
        message: str,
        collected_data: dict,
        response: dict,
    ) -> bool:
        """Match the user's variant answer against stored options."""
        options = collected_data.get("variant_options") or []
        if not options:
            return False

        # "no, I want a different flavour" → drop the candidates and re-show
        # the full menu so the user can restart the product step cleanly.
        if _wants_different_product(message):
            collected_data.pop("variant_options", None)
            collected_data.pop("product", None)
            collected_data.pop("product_id", None)
            collected_data.pop("product_price", None)
            collected_data.pop("variant", None)
            self.mongo.update_session_step(phone, "product", collected_data)
            response["message"] = (
                "No problem — here's the full menu. Pick a flavour:\n\n"
                f"{self.products.format_menu()}"
            )
            response["next_step"] = "product"
            response["action"] = "show_menu"
            return True

        # Detect size-only input that should resolve against ALL catalog variants,
        # not just the narrowed options. E.g. user says "4 litre" in variant step
        # → re-resolve the remembered product name to find the bulk variant.
        # Also handles common misspellings like "4 litter", "4 ltr", "4ltr", etc.
        _SIZE_KEYWORDS = (
            "4 litre", "4 liter", "4 litter", "4 lttr", "4 ltr", "4l",
            "four litre", "four liter", "four litter",
            "bulk", "4 litre bulk", "4 liter bulk", "4 litter bulk",
            "litre", "liter", "litter", "big", "tub",
        )
        txt = (message or "").lower().strip()
        _is_size_input = any(kw in txt for kw in _SIZE_KEYWORDS)
        if _is_size_input:
            remembered = collected_data.get("product") or ""
            if remembered:
                variants = self.products.find_variants(remembered)
                if variants:
                    chosen = self.products.match_variant(variants, message)
                    if not chosen:
                        # Fallback: pick the bulk/4 litre variant directly
                        for v in variants:
                            vn = (v.get("name") or "").lower()
                            if "4 litre" in vn or "bulk" in vn:
                                chosen = v
                                break
                    if chosen:
                        name_lower = (chosen.get("name") or "").lower()
                        price = chosen.get("price") or 0
                        is_bulk = "4 litre" in name_lower or "bulk" in name_lower
                        # Set is_bulk_pack BEFORE update so it persists to MongoDB
                        collected_data["is_bulk_pack"] = is_bulk
                        self._apply_chosen_product(chosen, collected_data)
                        self.mongo.update_session_step(phone, "quantity", collected_data)
                        if is_bulk:
                            response["message"] = (
                                f"Great pick — *{chosen.get('name')}* (₹{int(price)}) 🍦\n\n"
                                f"📦 1 pack = *40 persons*\n"
                                f"💰 ₹{int(price)} per pack\n\n"
                                f"How many people are you ordering for?\n"
                                f"(I'll calculate how many packs you need)"
                            )
                        else:
                            response["message"] = (
                                f"Great pick — *{chosen.get('name')}* "
                                f"(₹{int(price)}). "
                                "How many would you like? 🍦"
                            )
                        response["next_step"] = "quantity"
                        response["action"] = "continue"
                        return True

        chosen = self.products.match_variant(options, message)
        if chosen:
            # Detect bulk packs — 1 pack = 40 persons
            name_lower = (chosen.get("name") or "").lower()
            price = chosen.get("price") or 0
            is_bulk = "4 litre" in name_lower or "bulk" in name_lower
            # Set is_bulk_pack BEFORE update so it persists to MongoDB
            collected_data["is_bulk_pack"] = is_bulk
            self._apply_chosen_product(chosen, collected_data)
            self.mongo.update_session_step(phone, "quantity", collected_data)

            if is_bulk:
                # Show people-selector question with pricing context
                response["message"] = (
                    f"Great pick — *{chosen.get('name')}* (₹{int(price)}) 🍦\n\n"
                    f"📦 1 pack = *40 persons*\n"
                    f"💰 ₹{int(price)} per pack\n\n"
                    f"How many people are you ordering for?\n"
                    f"(I'll calculate how many packs you need — e.g. 80 people = 2 packs)"
                )
            else:
                response["message"] = (
                    f"Great pick — *{chosen.get('name')}* "
                    f"(₹{int(price)}). "
                    "How many would you like? 🍦"
                )

            response["next_step"] = "quantity"
            response["action"] = "continue"
            return True

        # Couldn't match — re-list the same options.
        response["message"] = (
            "Sorry, I didn't catch that. Please pick one of these sizes:\n\n"
            f"{self.products.format_variants(options)}\n\n"
            "Reply with the size or the number, or say *menu* for a different flavour."
        )
        response["next_step"] = "variant"
        response["action"] = "ask_variant"
        self.mongo.update_session_step(phone, "variant", collected_data)
        return True

    def _apply_chosen_product(self, product: dict, collected_data: dict) -> None:
        """Persist the resolved catalog product onto the session state."""
        collected_data["product"] = product.get("name")
        collected_data["product_id"] = product.get("id")
        collected_data["product_price"] = product.get("price")
        collected_data["variant"] = product.get("name")
        collected_data.pop("variant_options", None)

    def _save_current_item_to_cart(self, collected_data: dict) -> None:
        """Snapshot the current product/quantity selection into the cart list."""
        item = {
            "product":           collected_data.get("product"),
            "variant":           collected_data.get("variant"),
            "product_id":        collected_data.get("product_id"),
            "product_price":     collected_data.get("product_price"),
            "quantity":          collected_data.get("quantity"),
            "is_bulk":           collected_data.get("is_bulk_pack", False),
            "persons":           collected_data.get("persons"),
            "_packs_bought":     collected_data.get("_packs_bought"),
            "cup_product":       collected_data.get("cup_product"),
            "cup_product_id":    collected_data.get("cup_product_id"),
            "cup_product_price": collected_data.get("cup_product_price"),
            "_cup_packs_count":  collected_data.get("_cup_packs_count"),
            "cup_total_cost":    collected_data.get("cup_total_cost"),
        }
        cart = collected_data.get("cart") or []
        cart.append(item)
        collected_data["cart"] = cart

    def _clear_current_item(self, collected_data: dict) -> None:
        """Clear the in-progress item fields so the user can pick a new product."""
        _item_keys = [
            "product", "variant", "product_id", "product_price",
            "quantity", "is_bulk_pack",
            "persons", "_persons_entered", "_packs_bought", "_bulk_only", "_cups_added",
            "_pending_persons", "_bulk_price", "_exact_packs", "_lower_packs",
            "_cup_packs", "_exact_total", "_lower_total", "_cup_total",
            "_awaiting_cup_selection", "_cup_packs_count",
            "cup_product", "cup_product_id", "cup_product_price", "cup_total_cost",
            "variant_options",
        ]
        for k in _item_keys:
            collected_data.pop(k, None)

    def _bulk_persons_in_cart(self, collected_data: dict) -> int:
        """Sum total persons covered by bulk pack items in the cart.
        Cup ice cream packs (is_bulk=False) are excluded.
        """
        total = 0
        for item in (collected_data.get("cart") or []):
            if item.get("is_bulk"):
                packs = int(item.get("_packs_bought") or item.get("quantity") or 0)
                total += packs * 40
        return total

    def _handle_addons_step(
        self,
        phone: str,
        message: str,
        collected_data: dict,
        response: dict,
    ) -> bool:
        """Show add-on products, let user pick, then ask quantity per add-on.

        State machine (stored in collected_data):
          _addons_shown not set  → show the add-on menu
          _addons_shown=True     → user chose product(s); ask quantity
          _addon_qty_pending=True → user is entering quantity; save and advance

        Guard: if addons are already collected and no pending flags remain,
        return False so normal step flow takes over.
        """
        msg_lower = (message or "").strip().lower()
        addon_products = self.products.get_addon_products()

        # ── Guard: step already complete ────────────────────────────────────
        # If addons have been collected (even as empty list) and no pending flags,
        # this step is done — return False so the flow advances to scooper.
        if collected_data.get("addons") is not None and not (
            collected_data.get("_addons_shown") or
            collected_data.get("_addon_qty_pending")
        ):
            return False

        # ── State 1: Show menu ────────────────────────────────────────────────
        if not collected_data.get("_addons_shown"):
            # If step was already completed (addons is set), don't re-show menu
            if collected_data.get("addons") is not None:
                return False
            collected_data["_addons_shown"] = True
            self.mongo.update_session_step(phone, "addons", collected_data)

            if not addon_products:
                collected_data["addons"] = []
                collected_data.pop("_addons_shown", None)
                next_step = self.get_next_required_step("addons", collected_data)
                self.mongo.update_session_step(phone, next_step or "address", collected_data)
                response["action"] = "collect_data"
                response["next_step"] = next_step or "address"
                step_obj = self.get_step(next_step or "address") if next_step else None
                response["message"] = step_obj.question if step_obj else ""
                return True

            addon_menu = self.products.format_addon_menu()
            response["message"] = (
                f"🧂 *Add-ons*\n\n"
                f"Would you like to add any of the following?\n\n"
                f"{addon_menu}\n\n"
                f"Reply with the number(s) or name(s) — e.g. *1* or *cups*.\n"
                f"Type *none* or *skip* if you don't need any."
            )
            response["action"] = "ask_addons"
            response["next_step"] = "addons"
            return True

        # ── State 2: User chose product(s) — ask quantity ─────────────────────
        if collected_data.get("_addons_shown") and not collected_data.get("_addon_qty_pending"):
            collected_data.pop("_addons_shown", None)

            _skip_words = ("none", "no", "nope", "skip", "not needed", "no thanks",
                           "no thank you", "nothing", "no need", "dont", "don't")
            if any(sw in msg_lower for sw in _skip_words):
                collected_data["addons"] = []
                collected_data.pop("_addons_shown", None)
                # Remove any addon cart entry
                cart = [i for i in (collected_data.get("cart") or []) if i.get("item_type") != "addon"]
                collected_data["cart"] = cart
                next_step = self.get_next_required_step("addons", collected_data)
                self.mongo.update_session_step(phone, next_step or "address", collected_data)
                response["action"] = "collect_data"
                response["next_step"] = next_step or "address"
                step_obj = self.get_step(next_step or "address") if next_step else None
                response["message"] = step_obj.question if step_obj else ""
                return True

            # Match product selection
            selected: list[dict] = []
            indices = [int(n) - 1 for n in re.findall(r'\d+', message)
                       if 1 <= int(n) <= len(addon_products)]
            for idx in indices:
                p = addon_products[idx]
                if p not in selected:
                    selected.append(p)

            if not selected:
                for p in addon_products:
                    pname = (p.get("name") or "").lower()
                    if pname and pname in msg_lower:
                        selected.append(p)

            if not selected:
                addon_menu = self.products.format_addon_menu()
                response["message"] = (
                    f"Sorry, I didn't catch that. Please choose from the list:\n\n"
                    f"{addon_menu}\n\n"
                    f"Reply with the number — e.g. *1* — or type *none*."
                )
                collected_data["_addons_shown"] = True
                self.mongo.update_session_step(phone, "addons", collected_data)
                response["action"] = "ask_addons"
                response["next_step"] = "addons"
                return True

            # Save chosen products, move to quantity state
            collected_data["_addon_selected"] = [
                {"id": p.get("id"), "name": p.get("name"), "price": p.get("price")}
                for p in selected
            ]
            collected_data["_addon_qty_pending"] = True
            # CRITICAL: save to MongoDB NOW so state 3 can retrieve _addon_selected
            self.mongo.update_session_step(phone, "addons", collected_data)

            # Suggest quantity based on total bulk packs in cart
            names_str = ", ".join(p.get("name") for p in selected)
            bulk_persons = self._bulk_persons_in_cart(collected_data)
            total_bulk_packs = sum(
                int(item.get("_packs_bought") or item.get("quantity") or 0)
                for item in (collected_data.get("cart") or [])
                if item.get("is_bulk")
            )
            if bulk_persons and total_bulk_packs:
                pack_note = f" ({total_bulk_packs} bulk pack(s) × 40 persons each)"
                suggestion = (
                    f"\n\n💡 Your cart covers *{bulk_persons} persons* from "
                    f"*{total_bulk_packs} bulk pack(s)*{pack_note} — "
                    f"we suggest *{bulk_persons} cups*. "
                    f"Just say *okay* or *yes* to accept, or enter a different number."
                )
            else:
                suggestion = ""

            collected_data["_addon_suggested_qty"] = bulk_persons if bulk_persons else 0
            self.mongo.update_session_step(phone, "addons", collected_data)
            response["message"] = (
                f"✅ *{names_str}* selected!\n\n"
                f"Enter a number or say *for much people*.{suggestion}"
            )
            response["action"] = "ask_addon_qty"
            response["next_step"] = "addons"
            return True

        # ── State 3: User entering quantity ───────────────────────────────────
        if collected_data.get("_addon_qty_pending"):
            suggested_qty = int(collected_data.get("_addon_suggested_qty") or 0)

            # "skip"/"no" at quantity step → cancel addons and move on
            _skip_words = ("skip", "no", "none", "nope", "cancel", "dont", "don't")
            if any(sw in msg_lower for sw in _skip_words):
                collected_data.pop("_addon_qty_pending", None)
                collected_data.pop("_addon_suggested_qty", None)
                collected_data.pop("_addon_selected", None)
                collected_data["addons"] = []
                cart = [i for i in (collected_data.get("cart") or []) if i.get("item_type") != "addon"]
                collected_data["cart"] = cart
                self.mongo.update_session_step(phone, "addons", collected_data)
                next_step = self.get_next_required_step("addons", collected_data)
                self.mongo.update_session_step(phone, next_step or "address", collected_data)
                response["action"] = "collect_data"
                response["next_step"] = next_step or "address"
                step_obj = self.get_step(next_step or "address") if next_step else None
                response["message"] = (
                    "✅ No add-ons added.\n\n"
                    + (step_obj.question if step_obj else "")
                )
                return True

            # Check for acceptance words — use suggested quantity
            _accept_words = (
                "yes", "yeah", "yep", "okay", "ok", "sure", "accept",
                "order that", "go with that", "use that", "thats fine",
                "that one", "that works", "correct", "fine", "perfect",
                "do that", "go ahead", "proceed",
            )
            if any(w in msg_lower for w in _accept_words):
                qty = suggested_qty if suggested_qty > 0 else None
            else:
                qty = None

            if qty is None:
                # Try to parse "for X people" or plain number
                m = re.search(r'for\s+(\d+)\s*(?:people|persons?|person)?', msg_lower)
                if m:
                    qty = int(m.group(1))
                else:
                    nums = re.findall(r'\d+', message)
                    if nums:
                        qty = int(nums[0])

            if not qty or qty < 1:
                # Re-ask with suggestion
                if suggested_qty > 0:
                    response["message"] = (
                        f"Please enter a number or say *okay* to accept *{suggested_qty}*."
                    )
                else:
                    response["message"] = "Please enter a valid quantity."
                collected_data["_addon_qty_pending"] = True
                self.mongo.update_session_step(phone, "addons", collected_data)
                response["action"] = "ask_addon_qty"
                response["next_step"] = "addons"
                return True

            selected = collected_data.pop("_addon_selected", [])
            # Defensive: if _addon_selected was not saved to DB, re-enter addon selection
            if not selected:
                collected_data["_addon_qty_pending"] = True
                collected_data["_addon_selected"] = []
                self.mongo.update_session_step(phone, "addons", collected_data)
                response["message"] = (
                    "Sorry, I didn't catch that. Please enter a number to specify quantity."
                )
                response["action"] = "ask_addon_qty"
                response["next_step"] = "addons"
                return True

            unit_price = float(selected[0].get("price") or 0) if selected else 0
            total_cost = unit_price * qty
            addon_names = [p.get("name") for p in selected]
            names_str = ", ".join(addon_names)

            price_str = f"₹{int(total_cost)}" if total_cost == int(total_cost) else f"₹{total_cost:.2f}"
            collected_data["addons"] = addon_names
            collected_data["addon_qty"] = qty
            collected_data["addon_products"] = [
                {"id": p.get("id"), "name": p.get("name"),
                 "price": p.get("price"), "qty": qty}
                for p in selected
            ]
            collected_data["addon_total_cost"] = total_cost
            # Mark addons as done so get_next_required_step skips past it
            collected_data.pop("_addons_shown", None)
            collected_data.pop("_addon_qty_pending", None)
            collected_data.pop("_addon_suggested_qty", None)

            # Save addons to cart as a cart item
            self._save_addons_to_cart(collected_data)

            # Save with addons step first, then advance
            self.mongo.update_session_step(phone, "addons", collected_data)
            next_step = self.get_next_required_step("addons", collected_data)
            self.mongo.update_session_step(phone, next_step or "address", collected_data)
            step_obj = self.get_step(next_step or "address") if next_step else None
            response["action"] = "collect_data"
            response["next_step"] = next_step or "address"
            response["message"] = (
                f"✅ *{qty} × {names_str}* added — {price_str}\n\n"
                + (step_obj.question if step_obj else "")
            )
            return True

        return False

    def _total_persons_in_cart(self, collected_data: dict) -> int:
        """Sum total persons served by all items in the cart.

        Bulk packs: 1 pack = 40 persons.
        Cup ice creams: 1 cup = 1 person.
        """
        total = 0
        for item in (collected_data.get("cart") or []):
            if item.get("is_bulk"):
                packs = int(item.get("_packs_bought") or item.get("quantity") or 0)
                total += packs * 40
            else:
                cups = int(item.get("quantity") or 0)
                total += cups
        return total

    def _handle_scooper_step(
        self,
        phone: str,
        message: str,
        collected_data: dict,
        response: dict,
    ) -> bool:
        """Ask how many serving staff (scoopers) the customer needs.

        Rule: 1 scooper per 500 persons. Pricing: ₹500/scooper.
        Adjustability: ±30% of recommended count.
        State machine:
          _scooper_shown not set  → show suggestion + min/max range
          _scooper_shown=True      → parse reply, validate range, save and advance
        """
        msg_lower = (message or "").strip().lower()
        total_persons = self._total_persons_in_cart(collected_data)
        required = (total_persons + 499) // 500  # ceiling division
        scooper_price = 500  # ₹500 per scooper
        min_scoopers = max(1, required * 70 // 100)  # floor 30% below required
        max_scoopers = required * 130 // 100 + 1     # ceil 30% above required

        # ── State 1: Show suggestion ─────────────────────────────────────────
        if not collected_data.get("_scooper_shown"):
            suggested_cost = required * scooper_price
            suggested_cost_str = f"₹{suggested_cost}"
            range_min = min_scoopers * scooper_price
            range_max = max_scoopers * scooper_price

            response["message"] = (
                f"👋 *Serving Staff*\n\n"
                f"For *{total_persons} persons*, *{required} scooper(s)* required.\n"
                f"Service staff: ₹500 each.\n"
                f"Total cost: {suggested_cost_str}.\n\n"
                f"Range: *{min_scoopers} to {max_scoopers}* scooper(s).\n"
                f"Adjust count within range or say *okay* to confirm.\n"
                f"Say *no* or *skip* if you don't need staff."
            )
            response["action"] = "ask_scooper"
            response["next_step"] = "scooper"
            collected_data["_scooper_shown"] = True
            collected_data["_scooper_required"] = required
            collected_data["_scooper_min"] = min_scoopers
            collected_data["_scooper_max"] = max_scoopers
            collected_data["_scooper_total"] = total_persons
            self.mongo.update_session_step(phone, "scooper", collected_data)
            return True

        # ── State 2: Parse reply ─────────────────────────────────────────────
        collected_data.pop("_scooper_shown", None)

        # Skip/no → no scoopers
        _skip_words = ("skip", "no", "none", "nope", "dont", "don't")
        if any(sw in msg_lower for sw in _skip_words):
            collected_data["scooper"] = 0
            collected_data["scooper_cost"] = 0
            next_step = self.get_next_required_step("scooper", collected_data)
            self.mongo.update_session_step(phone, next_step or "address", collected_data)
            response["action"] = "collect_data"
            response["next_step"] = next_step or "address"
            step_obj = self.get_step(next_step or "address") if next_step else None
            response["message"] = (
                f"✅ No serving staff added.\n\n"
                + (step_obj.question if step_obj else "")
            )
            return True

        min_allowed = int(collected_data.get("_scooper_min", 1))
        max_allowed = int(collected_data.get("_scooper_max", required + 1))
        required_val = int(collected_data.get("_scooper_required", required))

        # Accept confirmation words → use suggested count
        _accept_words = (
            "yes", "yeah", "yep", "okay", "ok", "sure", "correct",
            "confirm", "thats fine", "perfect", "go ahead", "proceed",
        )
        if any(w in msg_lower for w in _accept_words):
            chosen = required_val
        else:
            # Parse number from message
            nums = re.findall(r'\d+', message)
            chosen = int(nums[0]) if nums else None

        # Validate range (±30%)
        if chosen is not None and min_allowed <= chosen <= max_allowed:
            cost = chosen * scooper_price
            cost_str = f"₹{cost}"
            collected_data["scooper"] = chosen
            collected_data["scooper_cost"] = cost
            for k in ("_scooper_required", "_scooper_min", "_scooper_max",
                      "_scooper_total", "_scooper_shown"):
                collected_data.pop(k, None)
            next_step = self.get_next_required_step("scooper", collected_data)
            self.mongo.update_session_step(phone, next_step or "address", collected_data)
            response["action"] = "collect_data"
            response["next_step"] = next_step or "address"
            step_obj = self.get_step(next_step or "address") if next_step else None
            label = f"{chosen} scooper(s)"
            response["message"] = (
                f"✅ *{label}* — {cost_str}.\n\n"
                + (step_obj.question if step_obj else "")
            )
            return True

        # Invalid: outside range or not a number — re-ask
        collected_data["_scooper_shown"] = True
        self.mongo.update_session_step(phone, "scooper", collected_data)
        response["message"] = (
            f"Please enter a number between *{min_allowed}* and *{max_allowed}*, "
            f"or say *okay* to confirm {required_val} scooper(s), "
            f"or say *no* to skip."
        )
        response["action"] = "ask_scooper"
        response["next_step"] = "scooper"
        return True

    def _save_addons_to_cart(self, collected_data: dict) -> None:
        """Save confirmed add-ons as a cart item."""
        addon_products = collected_data.get("addon_products") or []
        qty = int(collected_data.get("addon_qty") or 0)
        total_cost = float(collected_data.get("addon_total_cost") or 0)
        if not addon_products or qty <= 0:
            return
        # Remove any previous addon cart entry
        cart = [i for i in (collected_data.get("cart") or []) if i.get("item_type") != "addon"]
        addon_item = {
            "item_type": "addon",
            "name": ", ".join(p.get("name") for p in addon_products),
            "product_ids": [p.get("id") for p in addon_products],
            "quantity": qty,
            "unit_price": float(addon_products[0].get("price") or 0) if addon_products else 0,
            "total_cost": total_cost,
        }
        cart.append(addon_item)
        collected_data["cart"] = cart

    def _ask_add_more(self, phone: str, collected_data: dict, response: dict, prefix: str) -> None:
        """After an item is confirmed, ask if the customer wants to add another."""
        self._save_current_item_to_cart(collected_data)
        cart = collected_data.get("cart") or []
        cart_summary = self._format_cart_lines(cart)
        collected_data["_awaiting_more_items"] = True
        self.mongo.update_session_step(phone, "quantity", collected_data)
        response["message"] = (
            f"{prefix}\n\n"
            f"🛒 *Cart so far:*\n{cart_summary}\n\n"
            f"➕ Would you like to add *another ice cream* to your order?\n"
            f"Reply *Yes* to add more or *No* to continue with delivery details."
        )
        response["action"] = "ask_add_more"
        response["next_step"] = "quantity"

    def _format_cart_lines(self, cart: list) -> str:
        """Return a compact cart listing for display."""
        lines = []
        for i, item in enumerate(cart, 1):
            name = item.get("variant") or item.get("product") or "Ice Cream"
            if item.get("is_bulk"):
                packs = item.get("_packs_bought") or item.get("quantity") or 0
                persons = item.get("persons") or int(packs) * 40
                price = float(item.get("product_price") or 0)
                bulk_cost = int(price) * int(packs)
                cup_cost = float(item.get("cup_total_cost") or 0)
                cup_line = ""
                if item.get("cup_product"):
                    cp = item.get("_cup_packs_count", 0)
                    cup_line = f" + {cp} cup pack(s) × {item.get('cup_product')}"
                lines.append(f"  {i}. {name} — {packs} bulk pack(s){cup_line} → ₹{int(bulk_cost + cup_cost)}")
            elif item.get("item_type") == "addon":
                qty = item.get("quantity") or 1
                total = float(item.get("total_cost") or 0)
                lines.append(f"  {i}. {name} × {qty} → ₹{int(total)}")
            else:
                qty = item.get("quantity") or 1
                price = float(item.get("product_price") or 0)
                lines.append(f"  {i}. {name} × {qty} → ₹{int(price * qty)}")
        return "\n".join(lines)

    def _clear_stale_downstream(self, collected_data: dict) -> None:
        """Clear order-specific fields that may be stale from a previous session.
        Called every time quantity is finalized so each order always re-collects
        address, delivery date/time, addons, and other per-order details.
        """
        _stale_keys = [
            "addons", "addon_qty", "addon_products", "addon_total_cost",
            "_addons_shown", "_addon_selected", "_addon_qty_pending", "_addon_suggested_qty",
            "scooper", "scooper_cost", "_scooper_shown", "_scooper_required",
            # addon cart item (cleared via cart rebuild)
            "address", "delivery_date", "delivery_time",
            "name", "email", "order_type", "gst", "summary_shown",
        ]
        for k in _stale_keys:
            collected_data.pop(k, None)

    def _apply_bulk_choice(self, collected_data: dict, choice: str) -> None:
        """Apply the user's A/B/C bulk option choice onto the session."""
        persons = int(collected_data.get("_pending_persons", 0))
        if choice == "exact":
            packs = int(collected_data.get("_exact_packs", 0))
            collected_data["quantity"] = packs
            collected_data["persons"] = persons
            collected_data["_persons_entered"] = packs * 40
            collected_data["_packs_bought"] = packs
            collected_data["_bulk_only"] = True
            collected_data.pop("_cups_added", None)
        elif choice == "mixed":
            lower = int(collected_data.get("_lower_packs", 0))
            cups = int(collected_data.get("_cup_packs", 0))
            collected_data["quantity"] = lower
            collected_data["persons"] = persons
            collected_data["_persons_entered"] = lower * 40 + cups * 24
            collected_data["_packs_bought"] = lower
            collected_data["_cups_added"] = cups
            collected_data["_bulk_only"] = False
        elif choice == "lower":
            lower = int(collected_data.get("_lower_packs", 0))
            collected_data["quantity"] = lower
            collected_data["persons"] = persons
            collected_data["_persons_entered"] = lower * 40
            collected_data["_packs_bought"] = lower
            collected_data["_bulk_only"] = True
            collected_data.pop("_cups_added", None)
        collected_data.pop("_pending_persons", None)

    def _confirm_order(
        self,
        phone: str,
        user: dict,
        session: dict,
        collected_data: dict
    ) -> dict:
        """Save order to database with all cart items and full summary."""
        from src.services.mongo_service import MongoDBService
        from datetime import datetime

        mongo = MongoDBService()

        # Generate order number
        ts = datetime.utcnow().strftime("%Y%m%d")
        rand = "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=6))
        order_number = f"ORD-{ts}-{rand}"

        # Build full cart: cart items + current in-progress item
        cart = list(collected_data.get("cart") or [])
        current_item = {
            "product":           collected_data.get("product"),
            "variant":           collected_data.get("variant"),
            "product_id":        collected_data.get("product_id"),
            "product_price":     collected_data.get("product_price"),
            "quantity":          collected_data.get("quantity", 1),
            "is_bulk":           collected_data.get("is_bulk_pack", False),
            "persons":           collected_data.get("persons"),
            "_packs_bought":     collected_data.get("_packs_bought"),
            "cup_product":       collected_data.get("cup_product"),
            "cup_product_id":    collected_data.get("cup_product_id"),
            "cup_product_price": collected_data.get("cup_product_price"),
            "_cup_packs_count":  collected_data.get("_cup_packs_count"),
            "cup_total_cost":    collected_data.get("cup_total_cost"),
        }
        # Only add if not already in cart
        if current_item.get("product") and not any(
            i.get("product") == current_item.get("product") and
            i.get("variant") == current_item.get("variant")
            for i in cart
        ):
            cart.append(current_item)

        # Calculate totals from full cart
        product_value = 0.0
        items = []
        for item in cart:
            if item.get("item_type") == "addon":
                continue  # handled separately below
            bp = float(item.get("product_price") or 0)
            qty = int(item.get("quantity") or 1)
            subtotal = bp * qty + float(item.get("cup_total_cost") or 0)
            product_value += subtotal
            items.append({
                "product_id": item.get("product_id") or "ICE001",
                "product_name": item.get("variant") or item.get("product") or "Ice Cream",
                "variant": item.get("variant"),
                "quantity": qty,
                "price": bp,
                "bulk_packs": item.get("_packs_bought"),
                "cup_product": item.get("cup_product"),
                "cup_qty": item.get("_cup_packs_count"),
                "cup_cost": item.get("cup_total_cost") or 0,
                "subtotal": subtotal,
            })

        addon_cost = float(collected_data.get("addon_total_cost") or 0)
        scooper_cost = float(collected_data.get("scooper_cost") or 0)
        scooper_count = int(collected_data.get("scooper") or 0)
        free_delivery = product_value > 4000
        delivery_charge = 0 if free_delivery else (200 if collected_data.get("address") else 0)
        packing_charge = 0 if free_delivery else 400
        order_type = collected_data.get("order_type", "B2C")
        tax = product_value * 0.05 if order_type == "B2B" else 0
        total = product_value + addon_cost + scooper_cost + delivery_charge + packing_charge + tax

        # Get name and email from collected data or user profile
        name = collected_data.get("name") or user.get("name", "Customer")
        email = collected_data.get("email") or user.get("email")
        address = collected_data.get("address") or user.get("address", "")
        delivery_date = collected_data.get("delivery_date") or ""
        delivery_time = collected_data.get("delivery_time") or ""

        # Build order data
        order_data = {
            "order_number": order_number,
            "phone": phone,
            "customer_name": name,
            "customer_email": email,
            "shipping_address": address,
            "items": items,
            "addon_items": collected_data.get("addon_products", []),
            "addon_cost": addon_cost,
            "addon_qty": int(collected_data.get("addon_qty") or 0),
            "scooper_count": scooper_count,
            "scooper_cost": scooper_cost,
            "subtotal": product_value,
            "tax": tax,
            "shipping_cost": delivery_charge,
            "packing_charge": packing_charge,
            "free_delivery": free_delivery,
            "total": total,
            "status": "pending",
            "source": "whatsapp",
            "order_type": order_type,
            "gst": collected_data.get("gst"),
            "delivery_date": delivery_date,
            "delivery_time": delivery_time,
        }

        # Save order
        mongo.create_order(order_data)

        # Update user profile with latest info
        mongo.update_user(phone, {
            "name": name,
            "email": email,
            "address": address
        })

        # End session
        mongo.end_session(phone)

        # Build full confirmation message
        order_type_label = "Business (B2B)" if order_type == "B2B" else "Individual (B2C)"

        confirmation = "🎉 *Order Confirmed!*\n\n"
        confirmation += f"📋 Order Number: *{order_number}*\n\n"
        confirmation += f"📅 Delivery: {delivery_date} at {delivery_time}\n"
        confirmation += f"📍 Address: {address}\n"
        confirmation += f"👤 {name} | {order_type_label}\n"
        confirmation += f"\n🍦 *Order Items*\n\n"

        for i, item in enumerate(items, 1):
            name_disp = item["product_name"]
            if item.get("bulk_packs"):
                packs = int(item["bulk_packs"])
                persons = packs * 40
                cup_qty = item.get("cup_qty", 0)
                cup_name = item.get("cup_product") or ""
                cup_line = f" + {cup_qty} × {cup_name}" if cup_qty and cup_name else ""
                confirmation += (
                    f"  {i}. {name_disp}\n"
                    f"     📦 {packs} bulk pack(s) → {persons} persons{cup_line}\n"
                    f"     💰 ₹{int(item['subtotal'])}\n\n"
                )
            else:
                qty = item["quantity"]
                confirmation += (
                    f"  {i}. {name_disp} × {qty}\n"
                    f"     💰 ₹{int(item['subtotal'])}\n\n"
                )

        if addon_cost > 0:
            addon_qty = int(collected_data.get("addon_qty") or 0)
            addon_names = collected_data.get("addons") or []
            confirmation += f"🧂 *Add-ons*: {', '.join(addon_names)} × {addon_qty} — ₹{int(addon_cost)}\n\n"

        if scooper_count > 0:
            confirmation += f"👋 *Serving Staff*: {scooper_count} scooper(s) — ₹{int(scooper_cost)}\n\n"

        confirmation += "💰 *Price Breakdown*\n"
        confirmation += f"   Ice cream total : ₹{int(product_value)}\n"
        if addon_cost > 0:
            confirmation += f"   Add-ons         : ₹{int(addon_cost)}\n"
        if scooper_cost > 0:
            confirmation += f"   Serving Staff   : ₹{int(scooper_cost)}\n"
        if free_delivery:
            confirmation += f"   Delivery        : ₹0 🎉\n"
            confirmation += f"   Packing         : ₹0 🎉\n"
        else:
            confirmation += f"   Delivery        : ₹{delivery_charge}\n"
            confirmation += f"   Packing         : ₹{packing_charge}\n"
        if tax > 0:
            confirmation += f"   GST (5%)        : ₹{int(tax)}\n"
        confirmation += f"\n   *TOTAL: ₹{int(total)}*\n\n"
        confirmation += "Thank you for ordering! 🍦"

        return {
            "action": "order_confirmed",
            "message": confirmation,
            "order_number": order_number,
            "next_step": "complete",
            "data": order_data
        }

    def _get_help_message(self) -> str:
        """Get help message"""
        return """📖 *How to order:*

1. Select your ice cream
2. Choose quantity
3. Add any extra toppings
4. Provide delivery details
5. Confirm and enjoy!

Just reply to my questions and I'll guide you through!

Type *YES* anytime to confirm or *CANCEL* to start over."""

    def _extract_proactive_data(self, message: str, current_step: str, collected_data: dict) -> None:
        """Scan any message for data belonging to future steps and pre-fill them.

        Only fills fields that are not yet collected. Marks each pre-filled field
        with _prefilled_<key>=True so the step handler can ask for confirmation
        instead of the default question.
        """
        msg = (message or "").strip()
        if not msg:
            return

        # Steps that have already been completed — don't overwrite
        _skip = {current_step}

        # ── Name extraction ────────────────────────────────────────────────────
        if "name" not in _skip and not collected_data.get("name"):
            m = re.search(
                r"(?:my name is|i am|i'm|call me|name[:\s]+)\s*([A-Za-z]+(?:\s+(?!and\b|or\b|my\b|email\b|the\b|is\b)[A-Za-z]+){0,2})",
                msg, re.IGNORECASE
            )
            if m:
                name_val = m.group(1).strip()
                if name_val and len(name_val) >= 2:
                    collected_data["name"] = name_val
                    collected_data["_prefilled_name"] = True

        # ── Email extraction ───────────────────────────────────────────────────
        if "email" not in _skip and not collected_data.get("email"):
            m = re.search(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', msg)
            if m:
                collected_data["email"] = m.group(0)
                collected_data["_prefilled_email"] = True

        # ── Order type extraction ──────────────────────────────────────────────
        if "order_type" not in _skip and not collected_data.get("order_type"):
            ml = msg.lower()
            if any(w in ml for w in ("business", "b2b", "company", "gst invoice", "corporate", "firm")):
                collected_data["order_type"] = "B2B"
                collected_data["_prefilled_order_type"] = True
            elif any(w in ml for w in ("individual", "personal", "b2c", "myself", "home use", "private")):
                collected_data["order_type"] = "B2C"
                collected_data["_prefilled_order_type"] = True

    def _get_step_question(self, step: str, collected_data: dict) -> str:
        """Return the pending question for the current step — used to resume
        after a user question without losing conversational context."""
        if step == "quantity":
            is_bulk = collected_data.get("is_bulk_pack", False)
            if is_bulk:
                return "How many people are you ordering for?\n(I'll calculate the packs you need)"
            return "How many would you like? 🍦"
        step_obj = self.steps.get(step)
        if step_obj and step_obj.question:
            return step_obj.question
        return "Please continue with your order."

    def _parse_and_validate_date(self, text: str) -> tuple[Optional[str], Optional[str]]:
        """Parse a date string and validate it is at least 2 days from today.
        Returns (formatted_date_str, error_msg). One of them will be None.
        """
        from datetime import date, timedelta
        import re as _re

        today = date.today()
        min_date = today + timedelta(days=2)
        text_lower = text.lower().strip()

        # Relative keywords
        if text_lower in ("today",):
            return None, (
                f"❌ Same-day delivery is not available.\n"
                f"We need at least *2 days* to prepare your order.\n"
                f"Please choose a date from *{min_date.strftime('%d %b %Y')}* onwards."
            )
        if text_lower in ("tomorrow",):
            return None, (
                f"❌ Next-day delivery is not available.\n"
                f"We need at least *2 days* to prepare your order.\n"
                f"Please choose a date from *{min_date.strftime('%d %b %Y')}* onwards."
            )
        if "day after tomorrow" in text_lower:
            candidate = today + timedelta(days=2)
            return candidate.strftime("%d %b %Y"), None

        def _check(candidate: "date") -> tuple:
            if candidate < today:
                return None, (
                    f"❌ *{candidate.strftime('%d %b %Y')}* is in the past.\n"
                    f"Please choose a date from *{min_date.strftime('%d %b %Y')}* onwards."
                )
            if candidate < min_date:
                return None, (
                    f"❌ We need at least *2 days* to manufacture your order.\n"
                    f"Earliest available date: *{min_date.strftime('%d %b %Y')}*.\n"
                    f"Please choose that date or later."
                )
            return candidate.strftime("%d %b %Y"), None

        # Try YYYY-MM-DD first (ISO format)
        m = _re.search(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})", text)
        if m:
            try:
                year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
                return _check(date(year, month, day))
            except ValueError:
                pass

        # Try DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
        m = _re.search(r"(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})", text)
        if m:
            try:
                day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
                if year < 100:
                    year += 2000
                return _check(date(year, month, day))
            except ValueError:
                pass

        # Try "20 Feb", "Feb 20", "20 February 2025", etc.
        month_map = {
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
            "january": 1, "february": 2, "march": 3, "april": 4,
            "june": 6, "july": 7, "august": 8, "september": 9,
            "october": 10, "november": 11, "december": 12,
        }
        for mon_name, mon_num in month_map.items():
            # "20 Feb 2025", "20 Feb", "Feb 20 2025", "Feb 20"
            m = _re.search(rf"(\d{{1,2}})\s+{mon_name}(?:\s+(\d{{2,4}}))?", text_lower)
            if not m:
                m = _re.search(rf"{mon_name}\s+(\d{{1,2}})(?:\s+(\d{{2,4}}))?", text_lower)
            if m:
                try:
                    day = int(m.group(1))
                    year = int(m.group(2)) if m.group(2) else today.year
                    if year < 100:
                        year += 2000
                    return _check(date(year, mon_num, day))
                except ValueError:
                    pass

        return None, (
            f"❌ I couldn't understand that date. Please use a format like:\n"
            f"*22 May 2025*, *22/05/2025*, or *22.05.2025*\n"
            f"Earliest available: *{min_date.strftime('%d %b %Y')}*"
        )

    def _parse_and_validate_time(self, text: str) -> tuple[Optional[str], Optional[str]]:
        """Parse a delivery time string. Returns (formatted_time, error_msg)."""
        import re as _re

        text_lower = text.lower().strip()
        if not text_lower:
            return None, "Please provide a preferred delivery time."

        # Named slots
        slot_map = {
            "morning": "Morning (8 AM – 12 PM)",
            "afternoon": "Afternoon (12 PM – 4 PM)",
            "evening": "Evening (4 PM – 8 PM)",
            "noon": "Afternoon (12 PM – 4 PM)",
            "night": "Evening (4 PM – 8 PM)",
            "anytime": "Anytime",
            "any time": "Anytime",
            "flexible": "Anytime",
        }
        for kw, label in slot_map.items():
            if kw in text_lower:
                return label, None

        # HH:MM AM/PM or HH AM/PM
        m = _re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", text_lower)
        if m:
            hour = int(m.group(1))
            minute = int(m.group(2)) if m.group(2) else 0
            period = m.group(3).upper()
            if hour < 1 or hour > 12 or minute > 59:
                return None, "That doesn't look like a valid time. Please use a format like *10:30 AM* or *3 PM*."
            return f"{hour}:{minute:02d} {period}", None

        # 24-hour format HH:MM
        m = _re.search(r"\b(\d{1,2}):(\d{2})\b", text_lower)
        if m:
            hour, minute = int(m.group(1)), int(m.group(2))
            if hour > 23 or minute > 59:
                return None, "That doesn't look like a valid time. Please use *HH:MM* (e.g. *14:30*) or *3 PM*."
            period = "AM" if hour < 12 else "PM"
            display_hour = hour if hour <= 12 else hour - 12
            display_hour = 12 if display_hour == 0 else display_hour
            return f"{display_hour}:{minute:02d} {period}", None

        # Just a number — treat as hour
        m = _re.match(r"^(\d{1,2})$", text_lower)
        if m:
            hour = int(m.group(1))
            if 1 <= hour <= 23:
                period = "AM" if hour < 12 else "PM"
                display_hour = hour if hour <= 12 else hour - 12
                return f"{display_hour}:00 {period}", None

        return None, (
            "I couldn't understand that time. Please use a format like:\n"
            "*10:30 AM*, *3 PM*, *14:00*, or *morning / afternoon / evening*"
        )

    def _validate_address(self, address: str) -> Optional[str]:
        """Return an error string if the address is too vague, else None."""
        text = (address or "").strip()

        if len(text) < 10:
            return "That address is too short to deliver to."

        words = text.split()
        if len(words) < 3:
            return "Please include more details — street/area/landmark and city."

        # Single-word or generic filler responses
        _vague = {
            "home", "house", "here", "there", "same", "yes", "no", "ok",
            "okay", "address", "my home", "my house", "my place", "location",
        }
        if text.lower() in _vague:
            return "That's too vague. Please share the full address with street/area and city."

        # Must contain at least one location indicator
        _location_hints = (
            "street", "st ", "road", "rd ", "nagar", "colony", "layout",
            "avenue", "lane", "cross", "main", "near", "opposite", "opp",
            "floor", "flat", "door", "no.", "no ", "#",
            "chennai", "tambaram", "porur", "anna nagar", "t nagar",
            "velachery", "adyar", "coimbatore", "madurai", "trichy",
            "district", "taluk", "village", "town", "city", "pincode",
            "bus stand", "bus stop", "signal", "junction", "hospital",
        )
        lower = text.lower()
        has_hint = any(h in lower for h in _location_hints)

        # Also accept if there's a number (door/plot/flat number) in the address
        import re as _re
        has_number = bool(_re.search(r'\d', text))

        if not has_hint and not has_number:
            return "Please include a street name, area, landmark, or door number so we can find you."

        return None  # address is valid

    def _extract_quantity(self, message: str) -> Optional[int]:
        """Extract quantity from message"""
        # Handle words
        word_map = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
        msg_lower = message.lower().strip()

        for word, num in word_map.items():
            if word in msg_lower:
                return num

        # Extract number
        numbers = re.findall(r'\d+', message)
        if numbers:
            return int(numbers[0])

        return None

    def _normalize_order_type(self, message: str) -> Optional[str]:
        """Normalize order type to B2B or B2C"""
        msg_lower = message.lower().strip()

        b2b_keywords = ["b2b", "business", "company", "corporate", "invoice", "gst"]
        b2c_keywords = ["b2c", "personal", "individual", "home", "customer"]

        if any(kw in msg_lower for kw in b2b_keywords):
            return "B2B"
        elif any(kw in msg_lower for kw in b2c_keywords):
            return "B2C"

        return None

    def reset_session(self, phone: str) -> None:
        """Reset session to beginning"""
        self.mongo.end_session(phone)
        self.mongo.create_session(phone)


# Global instance
flow_engine = FlowEngine()


def get_flow_engine() -> FlowEngine:
    """Get flow engine instance"""
    return flow_engine
