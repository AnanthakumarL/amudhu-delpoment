/**
 * Backend API client — fetches data from the Amudhu FastAPI server.
 * The bot never talks to MongoDB directly; all data comes through here.
 */

const BACKEND = process.env.BACKEND_API_URL || "http://localhost:7999";
const API = `${BACKEND}/api/v1`;

async function apiFetch(path, params = {}) {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Backend ${path} returned ${res.status}`);
  return res.json();
}

/** Fetch active products (up to 100). */
export async function fetchProducts({ category } = {}) {
  const data = await apiFetch("/products", { page: 1, page_size: 100, is_active: true, category_id: category });
  return data.data || data.items || data || [];
}

/** Fetch recent orders for a customer by phone / identifier. */
export async function fetchOrdersByPhone(phone) {
  const normalized = phone.replace(/\D/g, "").slice(-10);
  const data = await apiFetch("/orders", {
    page: 1,
    page_size: 5,
    customer_identifier: normalized,
  });
  // Also try with full number if no results
  let items = data.data || data.items || [];
  if (!items.length) {
    const data2 = await apiFetch("/orders", { page: 1, page_size: 5, customer_identifier: phone });
    items = data2.data || data2.items || [];
  }
  return items;
}

/** Fetch a single order by ID. */
export async function fetchOrderById(orderId) {
  return apiFetch(`/orders/${orderId}`);
}

/** Create a new order. Returns the created order object. */
export async function createOrder(orderData) {
  const url = `${API}/orders`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(orderData),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Order creation failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Fetch all categories. */
export async function fetchCategories() {
  const data = await apiFetch("/categories", { page: 1, page_size: 100 });
  return data.data || data.items || data || [];
}

// ── Customer accounts ─────────────────────────────────────────────────────────

/** Look up a WhatsApp customer profile by phone number. Returns null if not found. */
export async function fetchAccountByPhone(phone) {
  const normalized = phone.replace(/\D/g, "");
  const url = `${API}/accounts/by-phone/${normalized}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Account lookup failed (${res.status})`);
  return res.json();
}

/** Create a new customer account. */
export async function createAccount(data) {
  const url = `${API}/accounts`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Account creation failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Update an existing customer account by ID. */
export async function updateAccount(accountId, data) {
  const url = `${API}/accounts/${accountId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Account update failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Delete an account by ID. */
export async function deleteAccount(accountId) {
  const url = `${API}/accounts/${accountId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Account deletion failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Fetch a single account by ID. */
export async function fetchAccountById(accountId) {
  return apiFetch(`/accounts/${accountId}`);
}

/** Update an existing order by ID. */
export async function updateOrder(orderId, data) {
  const url = `${API}/orders/${orderId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Order update failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Delete an order by ID. */
export async function deleteOrder(orderId) {
  const url = `${API}/orders/${orderId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Order deletion failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Fetch order statistics. */
export async function fetchOrderStatistics() {
  return apiFetch("/orders/statistics");
}

/** Fetch order by order number. */
export async function fetchOrderByNumber(orderNumber) {
  return apiFetch(`/orders/number/${orderNumber}`);
}
