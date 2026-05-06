"""
Product Service
Fetches the live product catalog from the Server backend (port 7999) and
formats it as a WhatsApp-friendly menu grouped by category.
"""

import re
import time
from typing import Optional
from difflib import SequenceMatcher

import urllib.request
import urllib.error
import json

from src.core.config import get_settings

settings = get_settings()

# Cache TTL — products don't change every second, so a short cache keeps
# the chat snappy without hammering the backend on every greeting.
_CACHE_TTL_SECONDS = 60


# Categories that don't exist in the DB but are still recognisable to humans
# get a default emoji. Falls back to 🍦.
_CATEGORY_EMOJI = {
    "50ml cups": "🍦",
    "100ml cups": "🍦",
    "4 litre bulk": "🍦",
    "natural": "🌿",
    "ball": "🔵",
    "roll": "🌀",
    "add-on": "➕",
    "special": "⭐",
}


def _emoji_for(category_name: str) -> str:
    key = (category_name or "").strip().lower()
    for needle, emoji in _CATEGORY_EMOJI.items():
        if needle in key:
            return emoji
    return "🍦"


# Words that mean "ice cream" generically and shouldn't influence flavour matching.
_FLAVOUR_STOPWORDS = {
    "ice", "cream", "icecream", "kulfi", "scoop", "flavor", "flavour",
    "the", "a", "an", "of", "for", "and", "with", "cup", "cups",
    "bulk", "tub",
}


def _strip_size_suffix(name: str) -> str:
    """Remove trailing size hints like '(4 Litre)' or '100ml' from a product name."""
    s = (name or "").strip()
    s = re.sub(r"\s*\([^)]*\)\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\d+\s*(ml|l|litre|liter|ltr)\b\.?\s*$", "", s, flags=re.IGNORECASE)
    return s.strip()


def _flavour_words(text: str) -> set[str]:
    """Tokenise into the flavour-distinguishing words used for variant matching."""
    cleaned = re.sub(r"[^a-z0-9 ]", " ", (text or "").lower())
    return {w for w in cleaned.split() if w and w not in _FLAVOUR_STOPWORDS}


def _fuzzy_score(a: str, b: str) -> float:
    """Return 0–1 similarity score between two strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _best_fuzzy_match(query: str, choices: list[str], min_score: float = 0.6) -> Optional[str]:
    """Return the choice that best matches the query, or None if nothing is close enough.

    Strips size suffixes from both query and choices before comparing so that
    'Pista Cup (50ml)' and 'Pista' both score against 'Pista' cleanly.
    """
    query_stripped = _strip_size_suffix(query).lower().strip()
    if not query_stripped:
        return None

    best_score = 0.0
    best_choice = None
    for choice in choices:
        choice_stripped = _strip_size_suffix(choice).lower().strip()
        # Score against stripped phrase
        score = _fuzzy_score(query_stripped, choice_stripped)
        # Also score each query word individually (helps "vennila" → "vanilla")
        for w in query_stripped.split():
            for word_in_choice in choice_stripped.split():
                s = _fuzzy_score(w, word_in_choice)
                if s > score:
                    score = s
        if score > best_score:
            best_score = score
            best_choice = choice
    return best_choice if best_score >= min_score else None


class ProductService:
    """Fetch + format the product catalog from the main Server backend."""

    def __init__(self):
        self.base_url = settings.BACKEND_API_URL.rstrip("/")
        self._cache: Optional[dict] = None
        self._cache_at: float = 0.0

    # ── HTTP ────────────────────────────────────────────────────────────────
    def _get_json(self, path: str) -> dict:
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _fetch_catalog(self) -> dict:
        """Fetch all products + categories. Returns {'products': [...], 'categories': {id: name}}."""
        cat_resp = self._get_json("/api/v1/categories")
        cat_list = cat_resp.get("data") if isinstance(cat_resp, dict) else cat_resp
        categories = {c["id"]: c.get("name", "Other") for c in (cat_list or [])}

        # Fetch ALL products across multiple pages (chocolate cups may be on page 2+)
        all_products: list[dict] = []
        page = 1
        page_size = 200
        while True:
            prod_resp = self._get_json(f"/api/v1/products?page={page}&page_size={page_size}")
            page_products = prod_resp.get("data") if isinstance(prod_resp, dict) else prod_resp
            if not page_products:
                break
            all_products.extend(page_products)
            if len(page_products) < page_size:
                break
            page += 1

        return {"products": all_products, "categories": categories}

    def get_catalog(self, force_refresh: bool = False) -> dict:
        """Cached catalog. Returns the same shape as _fetch_catalog."""
        now = time.time()
        if (
            not force_refresh
            and self._cache is not None
            and (now - self._cache_at) < _CACHE_TTL_SECONDS
        ):
            return self._cache

        try:
            self._cache = self._fetch_catalog()
            self._cache_at = now
        except Exception as e:
            print(f"[product_service] catalog fetch failed: {e}")
            if self._cache is None:
                self._cache = {"products": [], "categories": {}}
        return self._cache

    # ── Lookups ─────────────────────────────────────────────────────────────
    def find_product(self, name_query: str) -> Optional[dict]:
        """Loose match a product by substring — useful for AI-extracted names."""
        q = (name_query or "").strip().lower()
        if not q:
            return None
        catalog = self.get_catalog()
        for p in catalog["products"]:
            if q in (p.get("name") or "").lower():
                return p
        return None

    def find_variants(self, name_query: str) -> list[dict]:
        """Find every product whose base name matches the query.

        Sizes (e.g. '50ml Cup', '4 Litre Bulk') live as separate products in
        different categories. We strip the size suffix and compare the
        remaining flavour words; flavour-stop-words like 'ice'/'cream' are
        ignored so 'Mango ice cream Venum' still matches 'Mango Venum'.

        Falls back to fuzzy matching when exact word matching finds nothing —
        handles common spelling mistakes like 'pista' vs 'pistachio'.
        """
        q_words = _flavour_words(_strip_size_suffix(name_query))

        catalog = self.get_catalog()
        matches: list[dict] = []

        if q_words:
            for p in catalog["products"]:
                if not p.get("is_active", True):
                    continue
                p_words = _flavour_words(_strip_size_suffix(p.get("name") or ""))
                if p_words and p_words == q_words:
                    matches.append(p)

        # Fuzzy fallback: no exact match found — find best Levenshtein candidate,
        # then find ALL catalog products whose flavour words match it.
        # When the matched name contains a pure-stopword (e.g. "Kulfi" → "kulfi"
        # is a stopword → flavour set is empty), fall back to name substring match.
        if not matches:
            query_stripped = _strip_size_suffix(name_query).lower().strip()
            all_names = [p.get("name") or "" for p in catalog["products"] if p.get("is_active", True)]
            matched_name = _best_fuzzy_match(query_stripped, all_names)
            if matched_name:
                matched_flavour = _flavour_words(_strip_size_suffix(matched_name))
                if matched_flavour:
                    # Normal path: match by flavour words
                    for p in catalog["products"]:
                        if not p.get("is_active", True):
                            continue
                        p_flavour = _flavour_words(_strip_size_suffix(p.get("name") or ""))
                        if p_flavour and p_flavour == matched_flavour:
                            matches.append(p)
                else:
                    # Stopword-only name (e.g. "Kulfi" → flavour set is empty):
                    # match any product whose base name contains the query word.
                    # e.g. "Kulfi" matches "Kulfi (4 Litre)" AND "Pot Kulfi (100ml)".
                    matched_base = _strip_size_suffix(matched_name).lower().strip()
                    for p in catalog["products"]:
                        if not p.get("is_active", True):
                            continue
                        p_base = _strip_size_suffix(p.get("name") or "").lower().strip()
                        # Include: exact match, query contained in product name,
                        # or product name contained in query.
                        if p_base and (
                            p_base == matched_base
                            or matched_base in p_base
                            or p_base in matched_base
                        ):
                            matches.append(p)

        matches.sort(key=lambda p: float(p.get("price") or 0))
        return matches

    def match_variant(self, options: list[dict], text: str) -> Optional[dict]:
        """Pick a variant from `options` based on free-form user text.

        Honours numeric index ('1'/'first'), size keyword ('50ml'/'cup'/'bulk'),
        and substring matches against the option name or its category.
        """
        if not options or not text:
            return None
        txt = text.lower().strip()

        # 1) Numeric / ordinal index
        ordinals = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
                    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10}
        for word, num in ordinals.items():
            if re.search(rf"\b{word}\b", txt) and 1 <= num <= len(options):
                return options[num - 1]
        m = re.match(r"^\s*(\d+)\s*$", txt)
        if m:
            idx = int(m.group(1))
            if 1 <= idx <= len(options):
                return options[idx - 1]

        # 2) Size keyword — try the most specific keywords first.
        cats = self.get_catalog()["categories"]

        def _haystack(opt: dict) -> str:
            cat = (cats.get(opt.get("category_id")) or "").lower()
            name = (opt.get("name") or "").lower()
            return f"{name} {cat}"

        size_groups = [
            ("50ml", ["50ml", "50 ml", "fifty ml", "50 milli"]),
            ("100ml", ["100ml", "100 ml", "hundred ml", "100 milli"]),
            ("4 litre", ["4 litre", "4 liter", "4l ", "4 l ", "4ltr", "4 ltr",
                         "four litre", "four liter", "bulk"]),
        ]
        for size, keywords in size_groups:
            if any(kw in f" {txt} " for kw in keywords):
                for opt in options:
                    if size in _haystack(opt):
                        return opt

        # "cup" alone -> prefer the smallest cup variant available
        if "cup" in txt:
            cup_options = [o for o in options if "cup" in _haystack(o)]
            if cup_options:
                return cup_options[0]

        # 3) Substring on name
        for opt in options:
            name = (opt.get("name") or "").lower()
            if name and (name in txt or txt in name):
                return opt

        return None

    def get_addon_products(self) -> list[dict]:
        """Return all active add-on products (category name contains 'add-on' or 'addon')."""
        catalog = self.get_catalog()
        cats = catalog["categories"]
        addon_cat_ids = {
            cid for cid, name in cats.items()
            if any(k in (name or "").lower() for k in ("add-on", "addon", "add on", "add ons"))
        }
        return [
            p for p in catalog["products"]
            if p.get("is_active", True) and p.get("category_id") in addon_cat_ids
        ]

    def format_addon_menu(self) -> str:
        """Format add-on products as a numbered list for WhatsApp."""
        addons = self.get_addon_products()
        if not addons:
            return ""
        lines = []
        for i, p in enumerate(addons, start=1):
            price = p.get("price")
            price_str = f"₹{int(price)}" if isinstance(price, (int, float)) and price == int(price) else f"₹{price}"
            lines.append(f"  {i}. {p.get('name')} — {price_str}")
        return "\n".join(lines)

    def get_cup_variants(self) -> list[dict]:
        """Return all active cup-sized products (50ml, 100ml categories)."""
        catalog = self.get_catalog()
        cats = catalog["categories"]
        cup_cat_ids = {
            cid for cid, name in cats.items()
            if any(k in (name or "").lower() for k in ("50ml", "100ml", "cup"))
        }
        return [
            p for p in catalog["products"]
            if p.get("is_active", True) and p.get("category_id") in cup_cat_ids
        ]

    def format_cup_menu(self) -> str:
        """Format cup variants as a numbered list for WhatsApp."""
        cups = self.get_cup_variants()
        if not cups:
            return "  (No cup products found — please check the catalog.)"
        lines = []
        for i, p in enumerate(cups, start=1):
            price = p.get("price")
            price_str = f"₹{int(price)}" if isinstance(price, (int, float)) and price == int(price) else f"₹{price}"
            lines.append(f"  {i}. {p.get('name')} — {price_str}")
        return "\n".join(lines)

    # ── Fuzzy Suggestion ───────────────────────────────────────────────────────
    def fuzzy_suggest(self, name_query: str) -> Optional[str]:
        """Return the closest menu product name for typo-correction prompts."""
        stripped = _strip_size_suffix(name_query).lower().strip()
        if not stripped:
            return None
        all_names = [p.get("name") or "" for p in self.get_catalog()["products"] if p.get("is_active", True)]
        return _best_fuzzy_match(stripped, all_names)

    # ── Formatters ──────────────────────────────────────────────────────────
    def format_variants(self, products: list[dict]) -> str:
        """Compact size-list message for the variant question."""
        cats = self.get_catalog()["categories"]
        lines: list[str] = []
        for i, p in enumerate(products, start=1):
            name = p.get("name") or "Unnamed"
            price = p.get("price")
            price_str = (
                f"₹{int(price)}"
                if isinstance(price, (int, float)) and price == int(price)
                else f"₹{price}"
            )
            lines.append(f"  {i}. {name} — {price_str}")
        return "\n".join(lines)

    # ── Formatters ──────────────────────────────────────────────────────────
    def format_menu(self) -> str:
        """Format the active catalog as a WhatsApp menu, grouped by category."""
        catalog = self.get_catalog()
        products = [p for p in catalog["products"] if p.get("is_active", True)]
        categories = catalog["categories"]

        if not products:
            return (
                "🍦 Our menu is being updated right now. Please try again in a moment."
            )

        # Group products by category id
        by_cat: dict[Optional[str], list[dict]] = {}
        for p in products:
            cid = p.get("category_id")
            by_cat.setdefault(cid, []).append(p)

        # Order categories deterministically: by name, with "Other" last
        def _cat_sort_key(cid: Optional[str]) -> tuple:
            name = categories.get(cid, "Other") if cid else "Other"
            return (1 if name == "Other" else 0, name.lower())

        lines: list[str] = ["*🍦 Amudhu Ice Creams Menu*", ""]

        for cid in sorted(by_cat.keys(), key=_cat_sort_key):
            cat_name = categories.get(cid) if cid else "Other"
            emoji = _emoji_for(cat_name or "")
            lines.append(f"{emoji} *{cat_name}*")
            lines.append("")

            for i, p in enumerate(by_cat[cid], start=1):
                name = p.get("name", "Unnamed")
                price = p.get("price")
                price_str = f"₹{int(price)}" if isinstance(price, (int, float)) and price == int(price) else f"₹{price}"
                lines.append(f"  {i}. {name} — {price_str}")
            lines.append("")

        return "\n".join(lines).rstrip()


# ── Singleton ──────────────────────────────────────────────────────────────
_instance: Optional[ProductService] = None


def get_product_service() -> ProductService:
    global _instance
    if _instance is None:
        _instance = ProductService()
    return _instance
