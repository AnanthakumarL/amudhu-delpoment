/**
 * MongoDB client for Amudhu Ice Creams — fetches products, orders, categories.
 */

// Force IPv4 DNS resolution — fixes "querySrv ECONNREFUSED" on Windows with Atlas SRV URLs
import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import { MongoClient } from "mongodb";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB = process.env.MONGODB_DB || "amudhu";

let _client = null;

async function getDb() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await _client.connect();
  }
  return _client.db(MONGODB_DB);
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function getActiveProducts({ limit = 50, category = null } = {}) {
  const db = await getDb();
  const query = { is_active: true };
  if (category) query.category_id = category;
  const products = await db
    .collection("products")
    .find(query)
    .sort({ featured: -1, name: 1 })
    .limit(limit)
    .toArray();
  return products.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    description: p.description || null,
    price: p.price,
    compare_at_price: p.compare_at_price || null,
    discount_percentage: p.discount_percentage || 0,
    category_id: p.category_id || null,
    inventory_quantity: p.inventory_quantity ?? null,
    featured: p.featured || false,
    image_url: p.image_url || null,
  }));
}

export async function searchProducts(query, { limit = 20 } = {}) {
  const db = await getDb();
  const regex = new RegExp(query, "i");
  const products = await db
    .collection("products")
    .find({
      is_active: true,
      $or: [{ name: regex }, { description: regex }],
    })
    .limit(limit)
    .toArray();
  return products.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    price: p.price,
    description: p.description || null,
    inventory_quantity: p.inventory_quantity ?? null,
  }));
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function getOrdersByPhone(phone, { limit = 5 } = {}) {
  const db = await getDb();
  // Normalize phone — strip country code prefix variations
  const normalized = phone.replace(/\D/g, "");
  const last10 = normalized.slice(-10);
  const orders = await db
    .collection("orders")
    .find({
      $or: [
        { customer_phone: { $regex: last10 } },
        { customer_identifier: { $regex: last10 } },
      ],
    })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
  return orders.map((o) => ({
    id: o._id.toString(),
    status: o.status,
    production_status: o.production_status || null,
    total: o.total,
    items: (o.items || []).map((i) => ({ name: i.product_name, qty: i.quantity, price: i.price })),
    created_at: o.created_at || null,
    delivery_datetime: o.delivery_datetime || null,
    notes: o.notes || null,
  }));
}

export async function getOrderById(orderId) {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  let order;
  try {
    order = await db.collection("orders").findOne({ _id: new ObjectId(orderId) });
  } catch {
    return null;
  }
  if (!order) return null;
  return {
    id: order._id.toString(),
    status: order.status,
    production_status: order.production_status || null,
    total: order.total,
    items: (order.items || []).map((i) => ({ name: i.product_name, qty: i.quantity, price: i.price })),
    customer_name: order.customer_name,
    customer_phone: order.customer_phone || null,
    shipping_address: order.shipping_address,
    delivery_datetime: order.delivery_datetime || null,
    notes: order.notes || null,
  };
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function getCategories() {
  const db = await getDb();
  const cats = await db.collection("categories").find({}).sort({ name: 1 }).toArray();
  return cats.map((c) => ({ id: c._id.toString(), name: c.name }));
}

// ── Formatted helpers (for WhatsApp messages) ─────────────────────────────────

export function formatMenuMessage(products) {
  if (!products.length) return "Sorry, our menu is currently unavailable. Please call us directly!";

  const featured = products.filter((p) => p.featured);
  const rest = products.filter((p) => !p.featured);
  const ordered = [...featured, ...rest];

  let msg = "🍦 *Amudhu Ice Creams Menu* 🍦\n\n";
  for (const p of ordered) {
    const discounted = p.discount_percentage > 0;
    const priceStr = discounted
      ? `~~₹${p.compare_at_price || p.price}~~ ₹${p.price} (${p.discount_percentage}% off)`
      : `₹${p.price}`;
    msg += `• *${p.name}* — ${priceStr}\n`;
    if (p.description) msg += `  _${p.description}_\n`;
  }
  msg += "\nTo order, just tell us what you'd like! 😊";
  return msg;
}

export function formatOrderStatus(orders) {
  if (!orders.length) {
    return "I couldn't find any orders linked to your number. If you placed an order recently, please share your order ID.";
  }

  const statusEmoji = {
    pending: "⏳",
    assigned: "📋",
    processing: "🔄",
    shipped: "🚚",
    delivered: "✅",
    cancelled: "❌",
  };

  let msg = "📦 *Your Recent Orders*\n\n";
  for (const o of orders) {
    const emoji = statusEmoji[o.status] || "📦";
    msg += `${emoji} *Order #${o.id.slice(-6).toUpperCase()}*\n`;
    msg += `   Status: *${o.status.toUpperCase()}*\n`;
    if (o.production_status) msg += `   Production: ${o.production_status.replace(/_/g, " ")}\n`;
    msg += `   Items: ${o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}\n`;
    msg += `   Total: ₹${o.total}\n`;
    if (o.delivery_datetime) msg += `   Delivery: ${o.delivery_datetime}\n`;
    msg += "\n";
  }
  return msg.trim();
}
