"""
LLM Intent Parser Service
Rule-based parsing runs first — LLM is only used as a last resort.
This ensures the bot always responds even when API balances run out.
"""

import re
import json
from typing import Optional
from src.core.config import get_settings

settings = get_settings()


# ── Rule-based intent detection ────────────────────────────────────────────

_CONFIRMATION_WORDS = {
    "yes", "y", "confirm", "ok", "okay", "done", "place order", "yes please",
    "sure", "correct", "right", "agreed", "yep", "yeah", "ya", "proceed",
    "confirmed", "absolutely", "definitely",
}

_CANCEL_WORDS = ("cancel", "stop", "never mind", "abort", "forget it", "quit", "exit")

_GREETING_WORDS = ("hi", "hello", "hey", "good morning", "good afternoon",
                   "good evening", "howdy", "greetings", "hii", "helo")

_HELP_WORDS = ("help", "what can i do", "what can i order", "support", "assist")

_CHANGE_WORDS = ("change", "update", "modify", "edit", "different", "switch",
                 "instead", "actually", "correct", "wrong")


def _rule_based_intent(message: str, current_step: str) -> Optional[dict]:
    """Return an intent dict if rule-based matching is confident, else None."""
    msg = message.lower().strip()

    if msg in _CONFIRMATION_WORDS:
        return {"intent": "confirmation", "step_key": current_step,
                "extracted_values": {}, "confidence": 0.95,
                "reasoning": "Confirmation keyword"}

    if any(kw in msg for kw in _CANCEL_WORDS):
        return {"intent": "cancel", "step_key": current_step,
                "extracted_values": {}, "confidence": 0.95,
                "reasoning": "Cancel keyword"}

    if any(msg.startswith(kw) or msg == kw for kw in _GREETING_WORDS):
        return {"intent": "greeting", "step_key": current_step,
                "extracted_values": {}, "confidence": 0.9,
                "reasoning": "Greeting keyword"}

    if any(kw in msg for kw in _HELP_WORDS):
        return {"intent": "help", "step_key": current_step,
                "extracted_values": {}, "confidence": 0.9,
                "reasoning": "Help keyword"}

    if any(kw in msg for kw in _CHANGE_WORDS):
        return {"intent": "change_data", "step_key": current_step,
                "extracted_values": {}, "confidence": 0.8,
                "reasoning": "Change keyword"}

    return None


def _rule_based_extract(message: str, step_key: str) -> dict:
    """Extract structured data from message using pure regex/rules.
    Returns the same shape as LLM extraction: {"extracted": {...}, ...}.
    """
    msg = message.strip()
    extracted: dict = {}

    if step_key == "quantity":
        m = re.search(r'\b(\d+)\b', msg)
        if m:
            extracted["quantity"] = int(m.group(1))

    elif step_key == "email":
        m = re.search(r'[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}', msg)
        if m:
            extracted["email"] = m.group(0)

    elif step_key == "name":
        # Anything that looks like a name (no numbers, no special chars)
        cleaned = re.sub(r'[^a-zA-Z\s]', '', msg).strip()
        if cleaned:
            extracted["name"] = cleaned

    elif step_key == "address":
        if len(msg) > 5:
            extracted["address"] = msg

    elif step_key == "delivery_date":
        # Pass raw — _parse_and_validate_date in flow engine handles it
        extracted["delivery_date"] = msg

    elif step_key == "delivery_time":
        extracted["delivery_time"] = msg

    elif step_key == "order_type":
        ml = msg.lower()
        if any(w in ml for w in ("business", "b2b", "company", "gst", "firm", "corporate")):
            extracted["order_type"] = "B2B"
        elif any(w in ml for w in ("individual", "personal", "b2c", "myself", "home", "private")):
            extracted["order_type"] = "B2C"

    elif step_key == "gst":
        m = re.search(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]\b', msg.upper())
        if m:
            extracted["gst"] = m.group(0)
        elif len(msg) >= 10:
            extracted["gst"] = msg

    elif step_key == "product":
        extracted["product"] = msg

    elif step_key == "variant":
        extracted["variant"] = msg

    confidence = 0.8 if extracted else 0.0
    return {"extracted": extracted, "confidence": confidence,
            "reasoning": "rule-based extraction"}


class IntentParser:
    """Parse user message intent — rule-based first, LLM as fallback."""

    def __init__(self):
        self._deepseek = None
        self._openai = None
        self._init_clients()

    def _init_clients(self):
        try:
            from openai import OpenAI
            if settings.DEEPSEEK_API_KEY:
                self._deepseek = OpenAI(
                    api_key=settings.DEEPSEEK_API_KEY,
                    base_url="https://api.deepseek.com"
                )
            if settings.OPENAI_API_KEY:
                self._openai = OpenAI(api_key=settings.OPENAI_API_KEY)
        except Exception as e:
            print(f"[intent_parser] client init error: {e}")

    def parse_intent(self, user_message: str, current_step: str,
                     collected_data: dict = None) -> dict:
        # 1. Rule-based (always fast, never fails)
        rule_result = _rule_based_intent(user_message, current_step)
        if rule_result:
            return rule_result

        # 2. LLM (best-effort — skip if unavailable)
        prompt = self._intent_prompt(user_message, current_step, collected_data or {})
        llm_result = self._call_llm(prompt)
        if llm_result:
            return llm_result

        # 3. Final fallback — treat as data provision
        return {
            "intent": "provide_data",
            "step_key": current_step,
            "extracted_values": {},
            "confidence": 0.5,
            "reasoning": "fallback: treated as data provision",
        }

    def extract_step_data(self, user_message: str, step_key: str,
                          current_step: str) -> dict:
        # 1. Rule-based extraction
        rule_result = _rule_based_extract(user_message, step_key)
        if rule_result["extracted"]:
            return rule_result

        # 2. LLM extraction (best-effort)
        prompt = self._extract_prompt(user_message, step_key)
        llm_result = self._call_llm(prompt)
        if llm_result and "extracted" in llm_result:
            return llm_result

        # 3. No extraction — flow engine will use raw message as fallback
        return {"extracted": {}, "confidence": 0.0, "reasoning": "LLM unavailable"}

    # ── LLM helpers ───────────────────────────────────────────────────────────

    def _call_llm(self, prompt: str) -> Optional[dict]:
        """Try DeepSeek then OpenAI. Returns parsed JSON dict or None."""
        for client, model, label in [
            (self._deepseek, settings.DEEPSEEK_MODEL, "DeepSeek"),
            (self._openai,   settings.OPENAI_TEXT_MODEL, "OpenAI"),
        ]:
            if not client:
                continue
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_tokens=400,
                )
                text = resp.choices[0].message.content or ""
                # Strip markdown code fences if present
                text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
                return json.loads(text)
            except Exception as e:
                print(f"{label} error: {e}")
        return None

    def _intent_prompt(self, message: str, step: str, data: dict) -> str:
        return f"""Intent parser for an ice cream ordering chatbot.
Current step: {step}
User message: "{message}"

Return ONLY valid JSON:
{{"intent":"provide_data|change_data|cancel|greeting|help|confirmation|continue|unknown",
  "step_key":"{step}","extracted_values":{{}},"confidence":0.0,"reasoning":""}}"""

    def answer_friendly(self, question: str, step_question: str, context: str = "") -> Optional[str]:
        """Use LLM to answer a user's general question, then nudge them back to the flow."""
        prompt = f"""You are a friendly WhatsApp assistant for Amudhu Ice Creams, Chennai.
The customer asked: "{question}"
{f'Context: {context}' if context else ''}

Answer their question warmly in 1-2 short sentences (WhatsApp style, no markdown headers).
End with a gentle nudge to continue: "{step_question}"
Return ONLY plain text — no JSON, no code fences."""
        for client, model, label in [
            (self._deepseek, settings.DEEPSEEK_MODEL, "DeepSeek"),
            (self._openai,   settings.OPENAI_TEXT_MODEL, "OpenAI"),
        ]:
            if not client:
                continue
            try:
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4,
                    max_tokens=200,
                )
                text = (resp.choices[0].message.content or "").strip()
                if text:
                    return text
            except Exception as e:
                print(f"[answer_friendly] {label} error: {e}")
        return None

    def _extract_prompt(self, message: str, step: str) -> str:
        step_hints = {
            "product":       "Extract ice cream product name.",
            "variant":       "Extract flavor or variant preference.",
            "quantity":      "Extract number/quantity.",
            "addons":        "Extract add-on items (cups, spoons, toppings).",
            "address":       "Extract delivery address.",
            "delivery_date": "Extract delivery date.",
            "delivery_time": "Extract delivery time.",
            "name":          "Extract customer name.",
            "email":         "Extract email address.",
            "order_type":    "Extract order type: B2B or B2C.",
            "gst":           "Extract GST number.",
        }
        hint = step_hints.get(step, "Extract relevant information.")
        return f"""Extract data from this ice cream order message.
Step: {step} — {hint}
Message: "{message}"

Return ONLY valid JSON: {{"extracted":{{}},"confidence":0.0,"reasoning":""}}"""


# ── Singleton ─────────────────────────────────────────────────────────────
_instance: Optional[IntentParser] = None


def get_intent_parser() -> IntentParser:
    global _instance
    if _instance is None:
        _instance = IntentParser()
    return _instance
