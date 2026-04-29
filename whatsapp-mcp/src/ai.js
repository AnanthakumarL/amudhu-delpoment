/**
 * AI agent module.
 * - Text messages  → DeepSeek (primary, with tool calling)
 * - Image / voice  → Gemini multimodal (with tool calling)
 * - Gemini fallback chain: try all keys per model, then next model
 * - Quota notifications sent inline to the user
 * - Token / cost footer appended to every reply
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  fetchProducts,
  fetchOrdersByPhone,
  fetchOrderById,
  createOrder,
  fetchAccountByPhone,
  fetchAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  updateOrder,
  deleteOrder,
  fetchOrderStatistics,
  fetchOrderByNumber,
} from "./api.js";

const __envDir = path.dirname(fileURLToPath(import.meta.url));
const __envFile = path.join(__envDir, "..", ".env");
if (existsSync(__envFile)) {
  for (const line of readFileSync(__envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Keys & models ─────────────────────────────────────────────────────────────
const GEMINI_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",").map((k) => k.trim()).filter(Boolean);

const GEMINI_MODELS = (process.env.GEMINI_FALLBACK_MODELS || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite")
  .split(",").map((m) => m.trim()).filter(Boolean);

const DEEPSEEK_KEY   = process.env.DEEPSEEK_API_KEY  || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

const CLAUDE_KEY   = process.env.CLAUDE_API_KEY || "";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const OPENAI_KEY   = process.env.OPENAI_API_KEY || "";
let OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-4.1";

export function getOpenAIModel() { return OPENAI_TEXT_MODEL; }
export function setOpenAIModel(model) {
  OPENAI_TEXT_MODEL = model;
  console.error(`[AI] OpenAI model set to: ${model}`);
}
// Token limits per message type
const CLAUDE_LIMITS = {
  text:  { maxInputChars: 50 * 4,   maxOutputTokens: 100  }, // 50 input tokens (~200 chars)
  audio: { maxInputChars: 6000 * 4, maxOutputTokens: 500  }, // 6k input tokens
  image: { maxInputChars: 2000 * 4, maxOutputTokens: 500  }, // 2k input tokens
};

if (!GEMINI_KEYS.length && !DEEPSEEK_KEY && !CLAUDE_KEY && !OPENAI_KEY) {
  throw new Error("No AI API keys found. Set GEMINI_API_KEYS, DEEPSEEK_API_KEY, CLAUDE_API_KEY, or OPENAI_API_KEY in .env");
}

// ── Pricing table (USD per 1M tokens) ────────────────────────────────────────
const PRICING = {
  "gemini-2.5-flash-lite": { input: 0.075,  output: 0.30  },
  "gemini-2.5-flash":      { input: 0.15,   output: 0.60  },
  "gemini-2.0-flash":      { input: 0.10,   output: 0.40  },
  "gemini-1.5-flash":      { input: 0.075,  output: 0.30  },
  "deepseek-chat":         { input: 0.27,   output: 1.10  },
  "gpt-5-nano":            { input: 0.05,   output: 0.40  },
  "gpt-4o-audio-preview":  { input: 2.50,   output: 10.00 },
  "gpt-4o":                { input: 2.50,   output: 10.00 },
  "gpt-4o-mini":           { input: 0.15,   output: 0.60  },
};
const DEFAULT_GEMINI_PRICE = { input: 0.10, output: 0.40 };
const USD_TO_INR = 84.0;

// ── Key rotation — exhausted keys per session ─────────────────────────────────
const exhaustedKeys = new Set(); // keys permanently skipped this session

function* keysForModel() {
  // Yields keys that are not yet exhausted; wraps around once if needed
  let yielded = 0;
  const available = GEMINI_KEYS.filter((k) => !exhaustedKeys.has(k));
  for (const k of available) {
    yield k;
    yielded++;
  }
  if (yielded === 0 && GEMINI_KEYS.length > 0) {
    // All exhausted — reset and retry once
    exhaustedKeys.clear();
    for (const k of GEMINI_KEYS) yield k;
  }
}

// ── DeepSeek client ───────────────────────────────────────────────────────────
const deepseek = DEEPSEEK_KEY
  ? new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: DEEPSEEK_KEY })
  : null;

// ── Claude client ─────────────────────────────────────────────────────────────
const claudeClient = CLAUDE_KEY ? new Anthropic({ apiKey: CLAUDE_KEY }) : null;

// ── OpenAI (GPT) client ───────────────────────────────────────────────────────
const openaiClient = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the WhatsApp assistant for Amudhu Ice Creams, Chennai.

LANGUAGE:
- Default language is English. Always start and reply in English.
- Only switch language if the customer writes in a different language (Tamil, Hindi, etc.).
- Once switched, continue in that language for the rest of the conversation.
- If they switch back to English, reply in English again.

REPLY STYLE — be warm, friendly, and conversational:
- On the customer's very first message (any greeting like hi/hello/hai/vanakkam/வணக்கம்/hey, OR any message at all if there is no prior conversation history), reply with this exact format:
  Line 1: "Hey there! 😊 Welcome to Amudhu Ice Creams, Chennai! 🍦"
  Line 2: (blank)
  Line 3: "Here's our delicious menu — take a look and let me know your favourite! 👇"
  Line 4: (blank)
  Line 5+: paste the get_products formatted_menu text exactly as-is.
  Last line: "Just tell me which one you'd like and how many — I'll take it from there! 🍨"
- For follow-up messages, skip greetings — reply directly but stay friendly.
- Use a warm, helpful tone with emojis (🍦 🍨 😊 👍 ✨) — like a friendly shop assistant, not a robot.
- Use natural acknowledgements: "Got it!", "Sure thing!", "Perfect!", "Awesome choice!", "Yum!", etc.
- Keep replies short (1–4 lines) but never blunt or cold.
- No corporate filler ("Hope that helps", "Is there anything else"). Stay genuine and warm.
- If the customer seems unsure, gently suggest popular items or ask what flavour they're in the mood for.

TOOLS — call silently, never mention to customer:
- get_products: MUST call before mentioning any product, price, or flavour. Never invent products.
- user_management: get_profile, create_user, update_user.
- order_management: create_order, list_orders, cancel_order, etc.

PRODUCT RULE — CRITICAL:
- You only sell ice creams. Never discuss or suggest anything outside of ice creams, orders, or delivery.
- When a customer greets you or starts a conversation (hi, hello, hai, வணக்கம், etc.), call get_products immediately and show the full menu as your first reply. Do not ask "what would you like?" — just show the menu.
- Call get_products whenever the customer asks about ANY of these (or similar words): menu, products, ice cream, ice creams, flavours, flavors, varieties, items, what do you have, what's available, list, show me, tell me, enna irukku, என்ன இருக்கு, etc.
- After calling get_products, the menu list itself MUST be the exact "formatted_menu" text from the tool result (do not invent products, do not change prices). You MAY add a warm greeting/intro line before it and a friendly closing line after it (per REPLY STYLE), but the menu block itself must be pasted as-is.
- NEVER reply about products from memory. You have zero knowledge of what products exist until you call get_products.

DELIVERY AREA — CHENNAI ONLY:
- Delivery is available only within Chennai and its surrounding areas (Tambaram, Chromepet, Pallavaram, Guindy, Velachery, Adyar, Besant Nagar, T.Nagar, Anna Nagar, Kodambakkam, Porur, Ambattur, Avadi, etc.).
- If the customer gives an address outside Chennai and its surroundings, politely decline and say delivery is only within Chennai and nearby areas.
- Always confirm the exact street address and area/landmark for delivery — a vague address like "Chennai" is not enough.

DATE & TIME VALIDATION:
- Today's date is always the current date. Never accept a delivery date in the past.
- If the customer gives a past date, tell them it has already passed and ask them to choose a future date and time.
- Require both date AND exact time (e.g. "tomorrow 5pm" or "27 April, 3:30pm"). Do not proceed without both.

ORDER FLOW — ONE QUESTION PER MESSAGE:
Call get_profile and get_products silently and immediately — never tell the customer you are doing it.

Required pieces before placing an order:
  [A] Product + quantity
  [B] Customer full name
  [C] Exact delivery address (street, area, Chennai)
  [D] Delivery date AND time (must be a future date/time)

CRITICAL RULES:
  → Read the full conversation history before every reply. Any piece [A][B][C][D] already given is KNOWN — never ask for it again.
  → Treat voice message transcriptions as plain text — same information as typed messages.
  → NEVER invent or assume a quantity. If the customer has not stated a quantity, ask for it. Never default to any number like 1, 10, or 50.
  → When the customer names a product (even partial: "pot kulfi", "choco", "mango"), match it to the closest product from get_products and proceed — do not ask "which product?" again.
  → Never say "please wait", "let me check", "I'll verify", or imply any background task.
  → Ask for ONLY ONE missing piece per message. Never combine two questions.
  → Order of asking for missing pieces: A (product) → A (quantity, if not given) → B → C → D
  → Once all 4 pieces are collected, show the confirmation summary immediately.

CONFIRMATION SUMMARY FORMAT (fill in ACTUAL values from get_products — never show placeholders):
*Order Summary*

👤 Name: <actual customer name>
📱 Phone: <phone from CUSTOMER CONTEXT>
🍦 <actual product name> x<qty> — ₹<unit_price × qty>
📍 Address: <full delivery address>
🕐 Delivery: <date & time>
💰 Total: ₹<calculated total in numbers>

Reply *Yes* to confirm or *No* to cancel.

IMPORTANT: Always call get_products first to get real prices and product_id UUIDs before showing the summary or calling create_order.

ON CONFIRMATION (when customer replies Yes):
  → MUST call get_products first to get the correct product_id UUID and price.
  → All data passed to create_order and create_user/update_user MUST be in English only — name, address, notes, everything. If the customer gave their name or address in Tamil script, transliterate it to English before storing (e.g. "ராஜேஷ்" → "Rajesh", "அண்ணா நகர்" → "Anna Nagar").
  → Call create_order with all details in English, using the real product_id UUID from get_products.
  → Then call create_user (new customer) or update_user (if name/address changed).

MEDIA: For voice messages, respond naturally — never show transcripts. Extract any of the 4 order pieces mentioned and skip asking for those.

NEVER:
- Invent products, prices, or order details not from the database.
- Use placeholder names like "WhatsApp Customer".
- Ask for 2 or more things in one message.
- Accept a past delivery date.
- Accept a delivery address outside Chennai and surroundings.
- Create an order without all 4 pieces confirmed and validated.`;

// ── Tool declarations (shared between Gemini and DeepSeek) ────────────────────
const TOOL_DECLARATIONS = [
  {
    name: "get_products",
    description: "Fetch the current product menu from the database. Returns a list of products with IDs, names, prices, descriptions, and inventory_quantity. Call this to resolve a product name or number the customer mentioned into an actual product_id.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  {
    name: "user_management",
    description: `Manage customer accounts. Supports the following actions:
- get_profile: Look up the customer's saved profile by phone. Call this at the start of conversations to pre-fill order details.
- create_user: Register a new customer account with name, email, phone. Auto-called when a new customer places their first order.
- update_user: Update one or more profile fields (name, email, address, is_active). Pass only the fields you want to change.
- delete_user: Permanently delete the customer's account. Ask for confirmation before doing this.
- verify_user: Check whether a customer's phone is already registered.
- get_user_by_id: Fetch full account details by account ID.
- list_orders_for_user: Get all recent orders for this customer.`,
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["get_profile", "create_user", "update_user", "delete_user", "verify_user", "get_user_by_id", "list_orders_for_user"],
        },
        phone:      { type: "string" },
        account_id: { type: "string" },
        name:       { type: "string" },
        email:      { type: "string" },
        address:    { type: "string" },
        is_active:  { type: "boolean" },
        role:       { type: "string" },
      },
    },
  },

  {
    name: "order_management",
    description: `Manage orders. Supports the following actions:
- create_order: Create a new order. Requires customer_name, shipping_address, items (with product_id from get_products), subtotal, total. Always confirm order summary with customer before calling this.
- get_order: Fetch a single order by order_id.
- get_order_by_number: Fetch a single order by human-readable order_number (e.g. "ORD-0042").
- list_orders: Get recent orders for this customer by phone.
- update_order_status: Change the status of an order (pending → processing → shipped → delivered, or cancelled).
- update_order_notes: Add or update the notes/special instructions on an order.
- update_shipping_address: Change the delivery address on an existing order.
- cancel_order: Cancel an order. Ask the customer to confirm before calling this.
- delete_order: Permanently delete an order record (admin use — confirm before calling).
- get_order_statistics: Get summary statistics (total orders, revenue, status breakdown) for this customer.`,
    parameters: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: [
            "create_order", "get_order", "get_order_by_number", "list_orders",
            "update_order_status", "update_order_notes", "update_shipping_address",
            "cancel_order", "delete_order", "get_order_statistics",
          ],
        },
        phone:        { type: "string" },
        order_id:     { type: "string" },
        order_number: { type: "string" },
        customer_name:     { type: "string" },
        customer_phone:    { type: "string" },
        customer_email:    { type: "string" },
        shipping_address:  { type: "string" },
        billing_address:   { type: "string" },
        delivery_datetime: { type: "string" },
        notes:             { type: "string" },
        subtotal:          { type: "number" },
        total:             { type: "number" },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["product_id", "product_name", "quantity", "price", "subtotal"],
            properties: {
              product_id:   { type: "string" },
              product_name: { type: "string" },
              quantity:     { type: "number" },
              price:        { type: "number" },
              subtotal:     { type: "number" },
            },
          },
        },
        status: {
          type: "string",
          enum: ["pending", "assigned", "processing", "shipped", "delivered", "cancelled"],
        },
        new_notes:            { type: "string" },
        new_shipping_address: { type: "string" },
      },
    },
  },
];

// OpenAI-style tools for DeepSeek
const OPENAI_TOOLS = TOOL_DECLARATIONS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

// ── Tool executor ─────────────────────────────────────────────────────────────
async function executeTool(name, args, phone) {
  console.error(`[Tool] ${name}(${JSON.stringify(args)})`);
  try {
    switch (name) {
      case "get_products": {
        // Use cache to avoid redundant backend calls within 5 minutes
        if (!productsCache || Date.now() - productsCacheTs > PRODUCTS_TTL) {
          productsCache = await fetchProducts();
          productsCacheTs = Date.now();
        }
        const products = productsCache;
        const lines = products.map((p, i) => {
          return `${i + 1}. ${p.name} — ₹${p.price}`;
        });
        const formatted = `*🍦 Amudhu Ice Creams Menu*\n\n${lines.join("\n")}`;
        // Return ONLY the formatted string + product_ids for ordering reference.
        // Do NOT return the raw products array — forces the model to use formatted_menu as-is.
        const product_ids = products.map(p => ({ id: p.id, name: p.name, price: p.price }));
        return { formatted_menu: formatted, product_ids, instruction: "Send the formatted_menu text exactly as-is to the customer. Do not paraphrase or summarize it." };
      }
      case "user_management":  return await handleUserManagement(args, phone);
      case "order_management": return await handleOrderManagement(args, phone);
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`[Tool] ${name} error: ${err.message}`);
    return { error: err.message };
  }
}

// ── User Management handler ───────────────────────────────────────────────────
async function handleUserManagement(args, callerPhone) {
  const p = args.phone || callerPhone;

  switch (args.action) {
    case "get_profile": {
      const cached = getCachedProfile(p);
      if (cached) return cached;
      const account = await fetchAccountByPhone(p);
      const result = account
        ? {
            found: true, id: account.id, name: account.name,
            email:   account.email?.endsWith("@wa.local") ? null : account.email,
            address: account.attributes?.address || null,
            phone:   account.attributes?.phone   || p,
            role:    account.role, is_active: account.is_active,
          }
        : { found: false };
      setCachedProfile(p, result);
      return result;
    }
    case "verify_user": {
      const account = await fetchAccountByPhone(p);
      return { registered: !!account, phone: p };
    }
    case "create_user": {
      const existing = await fetchAccountByPhone(p);
      if (existing) return { success: false, reason: "already_exists", id: existing.id };
      const created = await createAccount({
        name: args.name || "WhatsApp Customer",
        email: args.email || `${p}@wa.local`,
        role: args.role || "customer",
        is_active: true,
        attributes: { phone: p, address: args.address || null },
      });
      invalidateProfile(p);
      return { success: true, id: created.id };
    }
    case "update_user": {
      let accountId = args.account_id;
      let existing  = null;
      if (accountId) {
        existing = await fetchAccountById(accountId);
      } else {
        existing = await fetchAccountByPhone(p);
        if (!existing) return { success: false, reason: "not_found" };
        accountId = existing.id;
      }
      const payload = {};
      if (args.name      != null) payload.name      = args.name;
      if (args.email     != null) payload.email     = args.email;
      if (args.is_active != null) payload.is_active = args.is_active;
      if (args.role      != null) payload.role      = args.role;
      if (args.address   != null || args.phone != null) {
        payload.attributes = {
          ...(existing?.attributes || {}),
          ...(args.address != null ? { address: args.address } : {}),
          ...(args.phone   != null ? { phone:   args.phone   } : {}),
        };
      }
      await updateAccount(accountId, payload);
      invalidateProfile(p);
      return { success: true };
    }
    case "delete_user": {
      let accountId = args.account_id;
      if (!accountId) {
        const account = await fetchAccountByPhone(p);
        if (!account) return { success: false, reason: "not_found" };
        accountId = account.id;
      }
      await deleteAccount(accountId);
      return { success: true };
    }
    case "get_user_by_id": {
      const account = await fetchAccountById(args.account_id);
      return {
        id: account.id, name: account.name,
        email:    account.email?.endsWith("@wa.local") ? null : account.email,
        address:  account.attributes?.address || null,
        phone:    account.attributes?.phone   || null,
        role:     account.role, is_active: account.is_active,
        created_at: account.created_at,
      };
    }
    case "list_orders_for_user": {
      const orders = await fetchOrdersByPhone(p);
      return { orders };
    }
    default:
      return { error: `Unknown user_management action: ${args.action}` };
  }
}

// ── Order Management handler ──────────────────────────────────────────────────
async function handleOrderManagement(args, callerPhone) {
  const phone = args.customer_phone || args.phone || callerPhone;

  switch (args.action) {
    case "create_order": {
      const order = await createOrder({
        customer_name: args.customer_name, customer_phone: phone,
        customer_email: args.customer_email,
        customer_identifier: phone.replace(/\D/g, "").slice(-10),
        shipping_address: args.shipping_address, billing_address: args.billing_address,
        delivery_datetime: args.delivery_datetime, notes: args.notes,
        items: args.items, subtotal: args.subtotal,
        tax: 0, shipping_cost: 0, total: args.total,
        source: "whatsapp", status: "pending",
      });
      return { success: true, order_number: order.order_number || order.id, id: order.id, total: order.total };
    }
    case "get_order":          return { order: await fetchOrderById(args.order_id) };
    case "get_order_by_number": return { order: await fetchOrderByNumber(args.order_number) };
    case "list_orders":        return { orders: await fetchOrdersByPhone(phone) };
    case "update_order_status": {
      const u = await updateOrder(args.order_id, { status: args.status });
      return { success: true, order_number: u.order_number, status: u.status };
    }
    case "update_order_notes": {
      const u = await updateOrder(args.order_id, { notes: args.new_notes });
      return { success: true, order_number: u.order_number };
    }
    case "update_shipping_address": {
      const u = await updateOrder(args.order_id, { shipping_address: args.new_shipping_address });
      return { success: true, order_number: u.order_number };
    }
    case "cancel_order": {
      const u = await updateOrder(args.order_id, { status: "cancelled" });
      return { success: true, order_number: u.order_number, status: "cancelled" };
    }
    case "delete_order": {
      await deleteOrder(args.order_id);
      return { success: true };
    }
    case "get_order_statistics": {
      const stats = await fetchOrderStatistics();
      return { stats };
    }
    default:
      return { error: `Unknown order_management action: ${args.action}` };
  }
}

// ── Global provider override ('auto' | 'gemini' | 'deepseek' | 'claude') ──────
let activeProvider = "auto";

export function setActiveProvider(p) {
  const valid = ["auto", "gemini", "deepseek", "claude", "gpt"];
  if (!valid.includes(p)) throw new Error(`Invalid provider: ${p}. Must be one of: ${valid.join(", ")}`);
  activeProvider = p;
  console.error(`[AI] Provider set to: ${p}`);
}

export function getActiveProvider() { return activeProvider; }

// ── Persistence paths ─────────────────────────────────────────────────────────
const DATA_ROOT     = process.env.DATA_ROOT || path.join(__envDir, "..");
const DATA_DIR      = path.join(DATA_ROOT, "data");
const HISTORY_FILE  = path.join(DATA_DIR, "chat_history.json");
const LOGS_FILE     = path.join(DATA_DIR, "chat_logs.json");
const STATS_FILE    = path.join(DATA_DIR, "cumulative_stats.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  try { if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")); } catch {}
  return fallback;
}

// Debounced writer — batches rapid saves into one disk write
function makeDebounced(fn, ms = 2000) {
  let t = null;
  return (...args) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Per-user conversation history (persisted) ─────────────────────────────────
const _historiesRaw = readJSON(HISTORY_FILE, {});
const histories = new Map(Object.entries(_historiesRaw));

const _saveHistories = makeDebounced(() => {
  ensureDataDir();
  writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(histories), null, 2));
});

function getHistory(from) {
  if (!histories.has(from)) histories.set(from, []);
  return histories.get(from);
}

function trimHistory(from) {
  const h = histories.get(from) || [];
  if (h.length > 16) h.splice(0, h.length - 16);
  _saveHistories();
}

// ── Profile cache — avoid get_profile tool call on every message ──────────────
const profileCache  = new Map(); // phone → { data, ts }
const PROFILE_TTL   = 10 * 60 * 1000; // 10 minutes

// Products cache — same list for everyone, refresh every 5 min
let productsCache = null;
let productsCacheTs = 0;
const PRODUCTS_TTL = 5 * 60 * 1000;

export function invalidateProfile(phone) {
  profileCache.delete(phone.replace(/\D/g, "").slice(-10));
}

function getCachedProfile(phone) {
  const key = phone.replace(/\D/g, "").slice(-10);
  const entry = profileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > PROFILE_TTL) { profileCache.delete(key); return null; }
  return entry.data;
}

function setCachedProfile(phone, data) {
  const key = phone.replace(/\D/g, "").slice(-10);
  profileCache.set(key, { data, ts: Date.now() });
}

// Build a per-user system prompt that injects the customer's known phone number
function buildSystemPrompt(phone) {
  const phone10 = phone.replace(/\D/g, "").slice(-10);
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const todayHuman = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const currentYear = now.getFullYear();
  const nextYear = currentYear + 1;
  return SYSTEM_PROMPT +
    `\n\nCURRENT DATE & TIME (use these exact values — never guess):\n` +
    `- Today is ${todayHuman} (${todayISO}).\n` +
    `- Current year: ${currentYear}. Next year: ${nextYear}.\n` +
    `- When the customer says a month/day without a year (e.g. "May 10", "tomorrow", "next Monday"), assume the NEAREST FUTURE date — never a past year. If the resulting date is before today, roll forward to ${nextYear}.\n` +
    `- delivery_datetime passed to create_order MUST be ISO 8601 (YYYY-MM-DDTHH:MM:SS) and MUST be strictly after ${todayISO}. NEVER use ${currentYear - 1} or any earlier year.\n` +
    `\nCUSTOMER CONTEXT:\n- Phone: ${phone10} (use this automatically — never ask the customer for their phone number)\n- Call get_profile with this phone at the start of every new conversation to check for saved name and address. If found, pre-fill those details silently — do not ask the customer for info you already have.`;
}

// Convert Gemini-format history to OpenAI messages (text turns only)
function historyToOpenAI(history) {
  const result = [];
  for (const h of history) {
    const textParts = (h.parts || []).filter((p) => p.text != null);
    if (!textParts.length) continue;
    result.push({
      role:    h.role === "model" ? "assistant" : "user",
      content: textParts.map((p) => p.text).join(""),
    });
  }
  return result;
}

// ── Token usage tracking (persisted) ─────────────────────────────────────────
const _logsRaw  = readJSON(LOGS_FILE, {});
const chatLogs  = new Map(Object.entries(_logsRaw));

// Cumulative stats — only ever incremented, never decremented even on clearHistory
const cumulativeStats = readJSON(STATS_FILE, { inputTokens: 0, outputTokens: 0, costUSD: 0, costINR: 0 });

const _saveLogs = makeDebounced(() => {
  ensureDataDir();
  writeFileSync(LOGS_FILE, JSON.stringify(Object.fromEntries(chatLogs), null, 2));
});

const _saveStats = makeDebounced(() => {
  ensureDataDir();
  writeFileSync(STATS_FILE, JSON.stringify(cumulativeStats, null, 2));
}, 3000);

export function getChatLog(phone) {
  const key = phone.replace(/[^0-9]/g, "");
  return chatLogs.get(key) || [];
}

export function getCumulativeStats() {
  return { ...cumulativeStats };
}

export function getAllChatSummaries() {
  const result = [];
  for (const [phone, logs] of chatLogs.entries()) {
    const totalInput   = logs.reduce((s, l) => s + (l.inputTokens  || 0), 0);
    const totalOutput  = logs.reduce((s, l) => s + (l.outputTokens || 0), 0);
    const totalCostINR = logs.reduce((s, l) => s + (l.costINR       || 0), 0);
    result.push({
      phone, messageCount: logs.length,
      lastMessage: logs[logs.length - 1]?.timestamp || null,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalCostINR: +totalCostINR.toFixed(4),
    });
  }
  return result.sort((a, b) => (b.lastMessage || "") > (a.lastMessage || "") ? 1 : -1);
}

function calcCost(provider, model, inputTokens, outputTokens) {
  let price;
  if (provider === "gemini") {
    price = PRICING[model] || DEFAULT_GEMINI_PRICE;
  } else {
    price = PRICING[model] || PRICING["deepseek-chat"];
  }
  const costUSD = (inputTokens / 1_000_000) * price.input
                + (outputTokens / 1_000_000) * price.output;
  return { costUSD: +costUSD.toFixed(6), costINR: +(costUSD * USD_TO_INR).toFixed(4) };
}

function recordUsage(from, { userText, reply, provider, model, inputTokens, outputTokens, mediaType = null }) {
  const phone = from.replace(/[^0-9]/g, "");
  if (!chatLogs.has(phone)) chatLogs.set(phone, []);
  const logs = chatLogs.get(phone);
  const { costUSD, costINR } = calcCost(provider, model, inputTokens, outputTokens);
  logs.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    userText, reply, provider, model,
    mediaType,
    inputTokens, outputTokens,
    costUSD, costINR,
  });
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);

  // Update cumulative totals — these never get cleared
  cumulativeStats.inputTokens  += inputTokens;
  cumulativeStats.outputTokens += outputTokens;
  cumulativeStats.costUSD      = +(cumulativeStats.costUSD + costUSD).toFixed(6);
  cumulativeStats.costINR      = +(cumulativeStats.costINR + costINR).toFixed(4);

  _saveLogs();
  _saveStats();
}

// ── Token footer appended to every reply ─────────────────────────────────────
function formatFooter(provider, model, inputTokens, outputTokens, switchNote = "") {
  const { costINR } = calcCost(provider, model, inputTokens, outputTokens);
  const lines = [
    "",
    "─────────────────────",
    `🤖 *${model}*`,
    `📊 In: ${inputTokens.toLocaleString()} | Out: ${outputTokens.toLocaleString()} tokens`,
    `💰 Cost: ₹${costINR.toFixed(4)}`,
  ];
  if (switchNote) lines.push(`⚠️ ${switchNote}`);
  return lines.join("\n");
}

// ── DeepSeek agentic loop (text — primary for text messages) ──────────────────
async function runDeepSeekAgent(from, phone, userText) {
  if (!deepseek) throw new Error("DeepSeek not configured");

  const history   = getHistory(from);
  const messages  = [
    { role: "system", content: buildSystemPrompt(phone) },
    ...historyToOpenAI(history),
    { role: "user", content: userText },
  ];

  let MAX_ROUNDS = 6;
  let totalInput  = 0;
  let totalOutput = 0;

  while (MAX_ROUNDS-- > 0) {
    const res = await deepseek.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages,
      tools: OPENAI_TOOLS,
      max_tokens: 2048,
    });

    const msg = res.choices[0].message;
    totalInput  += res.usage?.prompt_tokens     || 0;
    totalOutput += res.usage?.completion_tokens || 0;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = msg.content || "";
      history.push({ role: "user",  parts: [{ text: userText }] });
      history.push({ role: "model", parts: [{ text: reply    }] });
      trimHistory(from);

      recordUsage(from, {
        userText, reply, provider: "deepseek", model: DEEPSEEK_MODEL,
        inputTokens: totalInput, outputTokens: totalOutput,
      });

      return reply;
    }

    // Execute tool calls
    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });

    const toolResults = await Promise.all(
      msg.tool_calls.map((tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        console.error(`[DeepSeek tool] ${tc.function.name}(${JSON.stringify(args)})`);
        return executeTool(tc.function.name, args, phone);
      })
    );

    for (let i = 0; i < msg.tool_calls.length; i++) {
      messages.push({
        role: "tool",
        tool_call_id: msg.tool_calls[i].id,
        content: JSON.stringify(toolResults[i]),
      });
    }
  }

  throw new Error("DeepSeek: max tool call rounds exceeded");
}

// ── Gemini agentic loop (media — images and voice) ────────────────────────────
async function runGeminiAgent(from, phone, userText, media = null) {
  const history = getHistory(from);

  const userParts = [];
  if (media?.data && media?.mimeType) {
    userParts.push({ inlineData: { mimeType: media.mimeType, data: media.data } });
  }
  userParts.push({ text: userText || (media ? "[media message]" : "") });
  history.push({ role: "user", parts: userParts });

  const switchNotes = []; // quota/switch events to surface to user

  for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
    const model   = GEMINI_MODELS[mi];
    const allKeys = GEMINI_KEYS.filter((k) => !exhaustedKeys.has(k));
    if (!allKeys.length) {
      // Reset and try again with all keys
      exhaustedKeys.clear();
      allKeys.push(...GEMINI_KEYS);
    }

    let modelSucceeded = false;

    for (const apiKey of allKeys) {
      try {
        const genAI        = new GoogleGenerativeAI(apiKey);
        const geminiModel  = genAI.getGenerativeModel({
          model,
          systemInstruction: buildSystemPrompt(phone),
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        });

        let MAX_ROUNDS = 6;
        // Work on a snapshot of history (excluding last user message we just pushed)
        const baseHistory = history.slice(0, -1);

        while (MAX_ROUNDS-- > 0) {
          const chat    = geminiModel.startChat({ history: baseHistory });
          const result  = await chat.sendMessage(history[history.length - 1].parts);
          const response = result.response;
          const functionCalls = response.functionCalls();

          if (!functionCalls || functionCalls.length === 0) {
            const reply = response.text();
            history.push({ role: "model", parts: [{ text: reply }] });
            trimHistory(from);

            const usage = response.usageMetadata || {};
            const inputTokens  = usage.promptTokenCount     || 0;
            const outputTokens = usage.candidatesTokenCount || 0;

            recordUsage(from, {
              userText: userText || (media ? `[${media.mimeType?.split("/")[0] || "media"}]` : ""),
              reply, provider: "gemini", model, inputTokens, outputTokens,
              mediaType: media?.mimeType?.split("/")[0] || null,
            });

            const switchNote = switchNotes.length
              ? `Switched models: ${switchNotes.join(" → ")}`
              : "";

            modelSucceeded = true;
            return reply;
          }

          // Execute tool calls
          const toolResults = await Promise.all(
            functionCalls.map((fc) => executeTool(fc.name, fc.args || {}, phone))
          );
          history.push({
            role: "model",
            parts: functionCalls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args || {} } })),
          });
          history.push({
            role: "user",
            parts: functionCalls.map((fc, i) => ({
              functionResponse: { name: fc.name, response: toolResults[i] },
            })),
          });
        }

        throw new Error("Max tool call rounds exceeded");

      } catch (err) {
        const msg = err.message || "";
        console.error(`[Gemini] ${model} / …${apiKey.slice(-6)}: ${msg}`);

        if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) {
          exhaustedKeys.add(apiKey);
          console.error(`[Gemini] Key …${apiKey.slice(-6)} quota exhausted — trying next key`);
          continue; // next key
        }

        if (msg.includes("503") || msg.includes("overloaded") || msg.includes("unavailable")) {
          break; // model overloaded — skip to next model
        }

        if (msg.includes("404") || msg.includes("not found")) {
          break; // model doesn't exist — skip
        }

        throw err; // unexpected error — propagate
      }
    } // end key loop

    if (modelSucceeded) break;

    // All keys exhausted for this model — record switch and try next
    const nextModel = GEMINI_MODELS[mi + 1];
    if (nextModel) {
      const note = `${model} quota reached`;
      switchNotes.push(note);
      console.error(`[Gemini] All keys exhausted for ${model} — switching to ${nextModel}`);
    }
  }

  // If we get here, all models failed
  // Pop the user message we pushed so history stays clean
  const h = getHistory(from);
  if (h.length && h[h.length - 1].role === "user") h.pop();

  throw new Error("All Gemini models and keys exhausted");
}

// Claude tool definitions (Anthropic SDK format)
const CLAUDE_TOOLS = [
  {
    name: "get_products",
    description: "Fetch the current product menu from the database. Returns a list of products with IDs, names, prices, descriptions, and inventory_quantity. Call this to resolve a product name or number the customer mentioned into an actual product_id.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "user_management",
    description: `Manage customer accounts. Supports the following actions:
- get_profile: Look up the customer's saved profile by phone.
- create_user: Register a new customer account.
- update_user: Update profile fields (name, email, address, is_active).
- delete_user: Permanently delete the customer's account.
- verify_user: Check whether a customer's phone is already registered.
- get_user_by_id: Fetch full account details by account ID.
- list_orders_for_user: Get all recent orders for this customer.`,
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["get_profile", "create_user", "update_user", "delete_user", "verify_user", "get_user_by_id", "list_orders_for_user"] },
        phone: { type: "string" }, account_id: { type: "string" },
        name: { type: "string" }, email: { type: "string" },
        address: { type: "string" }, is_active: { type: "boolean" }, role: { type: "string" },
      },
    },
  },
  {
    name: "order_management",
    description: `Manage orders. Supports: create_order, get_order, get_order_by_number, list_orders, update_order_status, update_order_notes, update_shipping_address, cancel_order, delete_order, get_order_statistics.`,
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["create_order", "get_order", "get_order_by_number", "list_orders", "update_order_status", "update_order_notes", "update_shipping_address", "cancel_order", "delete_order", "get_order_statistics"] },
        phone: { type: "string" }, order_id: { type: "string" }, order_number: { type: "string" },
        customer_name: { type: "string" }, customer_phone: { type: "string" }, customer_email: { type: "string" },
        shipping_address: { type: "string" }, billing_address: { type: "string" },
        delivery_datetime: { type: "string" }, notes: { type: "string" },
        subtotal: { type: "number" }, total: { type: "number" },
        items: { type: "array", items: { type: "object", required: ["product_id", "product_name", "quantity", "price", "subtotal"], properties: { product_id: { type: "string" }, product_name: { type: "string" }, quantity: { type: "number" }, price: { type: "number" }, subtotal: { type: "number" } } } },
        status: { type: "string", enum: ["pending", "assigned", "processing", "shipped", "delivered", "cancelled"] },
        new_notes: { type: "string" }, new_shipping_address: { type: "string" },
      },
    },
  },
];

// ── Claude agent (token limits vary by media type) ────────────────────────────
async function runClaudeAgent(from, phone, userText, media = null) {
  if (!claudeClient) throw new Error("Claude not configured");

  const mediaType = media?.mimeType?.startsWith("audio") ? "audio"
                  : media?.mimeType?.startsWith("image") ? "image"
                  : "text";
  const limits = CLAUDE_LIMITS[mediaType];

  const truncatedText = (userText || "").length > limits.maxInputChars
    ? (userText || "").slice(0, limits.maxInputChars) + "…"
    : (userText || "");

  let userContent;
  if (media?.data && mediaType === "image") {
    userContent = [
      { type: "image", source: { type: "base64", media_type: media.mimeType, data: media.data } },
      { type: "text",  text: truncatedText || "What do you see?" },
    ];
  } else {
    userContent = truncatedText || "[media message]";
  }

  const messages = [{ role: "user", content: userContent }];
  let totalInput = 0;
  let totalOutput = 0;
  let MAX_ROUNDS = 6;

  while (MAX_ROUNDS-- > 0) {
    const res = await claudeClient.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: limits.maxOutputTokens,
      system: buildSystemPrompt(phone),
      tools: CLAUDE_TOOLS,
      messages,
    });

    totalInput  += res.usage?.input_tokens  || 0;
    totalOutput += res.usage?.output_tokens || 0;

    const toolUseBlocks = res.content.filter((b) => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
      const reply = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      recordUsage(from, {
        userText: userText || (media ? `[${mediaType}]` : ""),
        reply, provider: "claude", model: CLAUDE_MODEL,
        inputTokens: totalInput, outputTokens: totalOutput,
        mediaType: mediaType || null,
      });
      return reply;
    }

    // Execute tool calls
    messages.push({ role: "assistant", content: res.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (tb) => {
        const result = await executeTool(tb.name, tb.input || {}, phone);
        return { type: "tool_result", tool_use_id: tb.id, content: JSON.stringify(result) };
      })
    );
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Claude: max tool call rounds exceeded");
}

// ── OpenAI (GPT) agent ────────────────────────────────────────────────────────
// Audio → Whisper-1 transcription → gpt-5-nano with tools
// Image → gpt-5-nano vision with tools
// Text  → gpt-5-nano with tools
async function runOpenAIAgent(from, phone, userText, media = null) {
  if (!openaiClient) throw new Error("OpenAI not configured");

  const isAudio = media?.mimeType?.startsWith("audio");
  const isImage = media?.mimeType?.startsWith("image");

  // ── Audio: transcribe with Whisper first, then run as text ───────────────
  let effectiveUserText = userText || "";
  if (isAudio && media?.data) {
    try {
      const { toFile } = await import("openai");
      const audioBuffer = Buffer.from(media.data, "base64");
      const mimeBase    = (media.mimeType || "").split(";")[0].trim(); // strip codecs suffix
      const ext = mimeBase.includes("mp3")  ? "mp3"
                : mimeBase.includes("wav")  ? "wav"
                : mimeBase.includes("mp4")  ? "mp4"
                : mimeBase.includes("webm") ? "webm"
                : mimeBase.includes("flac") ? "flac"
                : "ogg"; // WhatsApp voice notes are ogg/opus

      const audioFile = await toFile(audioBuffer, `voice.${ext}`, { type: mimeBase || "audio/ogg" });
      const transcript = await openaiClient.audio.transcriptions.create({
        model: "gpt-4o-mini-transcribe",
        file:  audioFile,
      });
      effectiveUserText = transcript.text?.trim() || "";
      console.error(`[Whisper] Transcribed: ${effectiveUserText.substring(0, 120)}`);
      if (!effectiveUserText) throw new Error("Whisper returned empty transcript");
    } catch (err) {
      console.error(`[Whisper] Transcription failed: ${err.message}`);
      throw err; // bubble up so Gemini fallback can handle it
    }
  }

  // ── Chat completions with tool support (text + optional image) ───────────
  const history  = getHistory(from);
  const messages = [
    { role: "system", content: buildSystemPrompt(phone) },
    ...historyToOpenAI(history),
  ];

  let userContent;
  if (isImage && media?.data) {
    userContent = [
      { type: "text",      text: effectiveUserText || "What do you see?" },
      { type: "image_url", image_url: { url: `data:${media.mimeType};base64,${media.data}` } },
    ];
  } else {
    userContent = effectiveUserText || "[message]";
  }
  messages.push({ role: "user", content: userContent });

  let totalInput  = 0;
  let totalOutput = 0;
  let MAX_ROUNDS  = 6;

  while (MAX_ROUNDS-- > 0) {
    const res = await openaiClient.chat.completions.create({
      model:                 OPENAI_TEXT_MODEL,
      messages,
      tools:                 OPENAI_TOOLS,
      // "auto" lets the model decide — but after tool results are in, it should
      // naturally produce a text reply. Explicitly set for clarity.
      tool_choice:           "auto",
    });

    const msg = res.choices[0].message;
    totalInput  += res.usage?.prompt_tokens     || 0;
    totalOutput += res.usage?.completion_tokens || 0;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const reply = (msg.content || "").trim();

      // Reasoning models (gpt-5-nano) sometimes return null content after tool calls.
      // If that happens, ask it explicitly to produce the final reply.
      if (!reply) {
        messages.push({ role: "assistant", content: "" });
        messages.push({ role: "user", content: "Please provide your final reply to the customer now." });
        continue;
      }

      // Store plain transcription text — decorators like 🎙️ confuse the model on re-read
      history.push({ role: "user",  parts: [{ text: effectiveUserText || userText || "[voice]" }] });
      history.push({ role: "model", parts: [{ text: reply }] });
      trimHistory(from);
      recordUsage(from, {
        userText: isAudio ? `[voice] ${effectiveUserText}` : (userText || (isImage ? "[image]" : "")),
        reply, provider: "openai", model: OPENAI_TEXT_MODEL,
        inputTokens: totalInput, outputTokens: totalOutput,
        mediaType: isAudio ? "audio" : isImage ? "image" : null,
      });
      return reply;
    }

    messages.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });

    const toolResults = await Promise.all(
      msg.tool_calls.map((tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
        console.error(`[OpenAI tool] ${tc.function.name}(${JSON.stringify(args)})`);
        return executeTool(tc.function.name, args, phone);
      })
    );
    for (let i = 0; i < msg.tool_calls.length; i++) {
      messages.push({
        role: "tool",
        tool_call_id: msg.tool_calls[i].id,
        content: JSON.stringify(toolResults[i]),
      });
    }
  }

  throw new Error("OpenAI: max tool call rounds exceeded");
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main entry point.
 * Provider routing controlled by `activeProvider`:
 * - 'auto'     → GPT first, then Gemini → DeepSeek → Claude as fallbacks
 * - 'gpt'      → GPT only (gpt-5-nano text/image, gpt-4o-audio-preview audio)
 * - 'gemini'   → Gemini only (no fallback)
 * - 'deepseek' → DeepSeek only (no fallback; media not supported → error)
 * - 'claude'   → Claude only (no fallback)
 */
export async function agentReply(from, phone, userText, media = null) {
  const isMediaMessage = !!media;
  const provider = activeProvider;

  // ── Forced provider mode ──────────────────────────────────────────────────
  if (provider === "gemini") {
    if (!GEMINI_KEYS.length) return "⚠️ Gemini is not configured. Please set GEMINI_API_KEYS.";
    try {
      const reply = await runGeminiAgent(from, phone, userText, media);
      console.error(`[AI:gemini-forced] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] Gemini forced failed: ${err.message}`);
      return `⚠️ *Gemini Error*\n\n${err.message.includes("quota") ? "Quota exceeded." : "Request failed."} Try switching to Auto or another model.`;
    }
  }

  if (provider === "deepseek") {
    if (!deepseek) return "⚠️ DeepSeek is not configured. Please set DEEPSEEK_API_KEY.";
    if (isMediaMessage) return "⚠️ DeepSeek does not support media messages. Switch to Auto or Gemini for images/voice.";
    try {
      const reply = await runDeepSeekAgent(from, phone, userText);
      console.error(`[AI:deepseek-forced] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] DeepSeek forced failed: ${err.message}`);
      return `⚠️ *DeepSeek Error*\n\nRequest failed. Try switching to Auto or another model.`;
    }
  }

  if (provider === "gpt") {
    if (!openaiClient) return "⚠️ OpenAI is not configured. Please set OPENAI_API_KEY.";
    try {
      const reply = await runOpenAIAgent(from, phone, userText, isMediaMessage ? media : null);
      console.error(`[AI:gpt-forced] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] GPT forced failed: ${err.message}`);
      return `⚠️ *GPT Error*\n\n${err.message}`;
    }
  }

  if (provider === "claude") {
    if (!claudeClient) return "⚠️ Claude is not configured. Please set CLAUDE_API_KEY.";
    const isAudio = media?.mimeType?.startsWith("audio");
    if (isAudio) {
      return "⚠️ Claude doesn't support voice messages. Switch to Auto or Gemini in the admin panel to use voice notes. 🎙️";
    }
    try {
      const reply = await runClaudeAgent(from, phone, userText, isMediaMessage ? media : null);
      console.error(`[AI:claude-forced] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] Claude forced failed: ${err.message}`);
      return `⚠️ *Claude Error*\n\nRequest failed. Try switching to Auto or another model.`;
    }
  }

  // ── Auto mode: GPT first, then Gemini → DeepSeek → Claude ───────────────
  if (isMediaMessage) {
    // 1. GPT — handles text, image, and audio
    if (openaiClient) {
      try {
        const reply = await runOpenAIAgent(from, phone, userText, media);
        console.error(`[AI:gpt-media] ${from}: replied (${reply.length} chars)`);
        return reply;
      } catch (err) {
        console.error(`[AI] GPT media failed: ${err.message} — falling back to Gemini`);
      }
    }

    // 2. Gemini — handles text, image, and audio
    if (GEMINI_KEYS.length) {
      try {
        const reply = await runGeminiAgent(from, phone, userText, media);
        console.error(`[AI:gemini-media] ${from}: replied (${reply.length} chars)`);
        return reply;
      } catch (err) {
        console.error(`[AI] Gemini media failed: ${err.message}`);
      }
    }

    // 3. Claude — images only (no audio)
    const isImage = media?.mimeType?.startsWith("image");
    if (claudeClient && isImage) {
      try {
        const reply = await runClaudeAgent(from, phone, userText, media);
        console.error(`[AI:claude-image] ${from}: replied (${reply.length} chars)`);
        return reply;
      } catch (err) {
        console.error(`[AI] Claude image fallback failed: ${err.message}`);
      }
    }

    return "⚠️ *AI Quota Exceeded*\n\nAll AI providers failed for this media. Please try again later or send a text message! 🙏";
  }

  // Auto text path: GPT → Gemini → DeepSeek → Claude
  if (openaiClient) {
    try {
      const reply = await runOpenAIAgent(from, phone, userText, null);
      console.error(`[AI:gpt] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] GPT failed: ${err.message} — falling back to Gemini`);
    }
  }

  if (GEMINI_KEYS.length) {
    try {
      const reply = await runGeminiAgent(from, phone, userText, null);
      console.error(`[AI:gemini-fallback] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] Gemini fallback failed: ${err.message}`);
    }
  }

  if (deepseek) {
    try {
      const reply = await runDeepSeekAgent(from, phone, userText);
      console.error(`[AI:deepseek-fallback] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] DeepSeek fallback failed: ${err.message}`);
    }
  }

  if (claudeClient) {
    try {
      const reply = await runClaudeAgent(from, phone, userText, null);
      console.error(`[AI:claude-fallback] ${from}: replied (${reply.length} chars)`);
      return reply;
    } catch (err) {
      console.error(`[AI] Claude fallback failed: ${err.message}`);
    }
  }

  return "⚠️ *AI Quota Exceeded*\n\nAll AI models have reached their quota limit. Please try again in a few minutes! 🙏";
}

// ── Whitelist — allowed phone numbers ────────────────────────────────────────
const WHITELIST_FILE = path.join(DATA_DIR, "whitelist.json");

function loadWhitelist() {
  try {
    if (existsSync(WHITELIST_FILE)) {
      const data = JSON.parse(readFileSync(WHITELIST_FILE, "utf8"));
      return new Set(Array.isArray(data) ? data.map(String) : []);
    }
  } catch {}
  return new Set();
}

function saveWhitelist(set) {
  try {
    const dir = path.dirname(WHITELIST_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(WHITELIST_FILE, JSON.stringify([...set], null, 2));
  } catch (err) {
    console.error("[Whitelist] Save failed:", err.message);
  }
}

const _whitelist = loadWhitelist();

export function getWhitelist() {
  return [..._whitelist];
}

// Normalize to last 10 digits (drops +91 prefix)
function normPhone(phone) {
  return phone.replace(/\D/g, "").slice(-10);
}

export function addToWhitelist(phone) {
  const n = normPhone(phone);
  _whitelist.add(n);
  saveWhitelist(_whitelist);
  return n;
}

export function removeFromWhitelist(phone) {
  const n = normPhone(phone);
  const removed = _whitelist.delete(n);
  if (removed) saveWhitelist(_whitelist);
  return removed;
}

/**
 * Returns true if the number is allowed to use the bot.
 * STRICT: only numbers in the whitelist are allowed. Empty whitelist = nobody.
 * Incoming Baileys JIDs are like 919876543210 — we compare last 10 digits.
 */
export function isWhitelisted(phone) {
  const n = normPhone(phone); // last 10 digits
  if (!n) return false;
  if (_whitelist.size === 0) return false; // no allowed users configured → block all
  return _whitelist.has(n);
}

export function clearHistory(phone) {
  const digits = phone.replace(/[^0-9]/g, "");
  // Clear chat logs and conversation history — cumulative stats are NOT touched
  chatLogs.delete(digits);
  for (const key of histories.keys()) {
    if (key.replace(/[^0-9]/g, "") === digits) histories.delete(key);
  }
  invalidateProfile(digits);
  _saveLogs();
  _saveHistories();
}

export function getProviderStatus() {
  return {
    gemini: {
      keys: GEMINI_KEYS.length,
      activeKeys: GEMINI_KEYS.length - exhaustedKeys.size,
      exhaustedKeys: exhaustedKeys.size,
      models: GEMINI_MODELS,
    },
    deepseek: { available: !!deepseek, model: DEEPSEEK_MODEL },
    claude: { available: !!claudeClient, model: CLAUDE_MODEL, limits: CLAUDE_LIMITS },
    gpt: { available: !!openaiClient, textModel: OPENAI_TEXT_MODEL, audioModel: "whisper-1" },
    activeProvider,
  };
}

// ── Compatibility aliases for index.js (MCP server) ───────────────────────────
export async function generateReply(from, userText) {
  const phone = from.replace(/[^0-9]/g, "").slice(-10);
  return agentReply(from, phone, userText, null);
}

export async function generateReplyWithData(userText, dataLabel, data) {
  const syntheticFrom = "mcp@tool";
  const ctx = `[${dataLabel}]: ${JSON.stringify(data).slice(0, 500)}`;
  return agentReply(syntheticFrom, "mcp", `${userText}\n\n${ctx}`, null);
}
