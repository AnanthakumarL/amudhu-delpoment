// Force IPv4 DNS — fixes Atlas SRV lookup failures on Windows
import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WhatsAppClient } from "./whatsapp.js";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env
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

import { generateReply, generateReplyWithData, getProviderStatus } from "./ai.js";
import { fetchProducts, fetchOrdersByPhone, fetchOrderById, fetchCategories } from "./api.js";

const wa = new WhatsAppClient();

const server = new Server(
  { name: "whatsapp-mcp", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── WhatsApp tools ────────────────────────────────────────────────────
    {
      name: "wa_status",
      description: "Get WhatsApp connection status.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wa_send_message",
      description: "Send a WhatsApp text message to a phone number or group JID.",
      inputSchema: {
        type: "object",
        required: ["to", "message"],
        properties: {
          to: { type: "string", description: "Phone number with country code or group JID" },
          message: { type: "string", description: "Text message to send" },
        },
      },
    },
    {
      name: "wa_get_messages",
      description: "Retrieve recent incoming WhatsApp messages.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", default: 20 },
          from_number: { type: "string" },
        },
      },
    },
    {
      name: "wa_reply",
      description: "Reply to a specific received message by its message ID.",
      inputSchema: {
        type: "object",
        required: ["message_id", "to", "reply_text"],
        properties: {
          message_id: { type: "string" },
          to: { type: "string" },
          reply_text: { type: "string" },
        },
      },
    },
    {
      name: "wa_ai_reply",
      description: "Process a user message through Gemini AI and send the reply.",
      inputSchema: {
        type: "object",
        required: ["from", "message_text"],
        properties: {
          from: { type: "string" },
          message_text: { type: "string" },
          message_id: { type: "string" },
          jid: { type: "string" },
        },
      },
    },
    {
      name: "wa_ai_status",
      description: "Show AI provider status (Gemini keys, DeepSeek).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wa_poll_new_messages",
      description: "Poll for new messages after a given ISO timestamp.",
      inputSchema: {
        type: "object",
        required: ["after_timestamp"],
        properties: {
          after_timestamp: { type: "string" },
          limit: { type: "number", default: 50 },
        },
      },
    },
    // ── Database tools ────────────────────────────────────────────────────
    {
      name: "db_get_products",
      description:
        "Fetch active products from the Amudhu database. Returns full product list with names, prices, and descriptions.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", default: 50, description: "Max products to return" },
          category: { type: "string", description: "Filter by category ID (optional)" },
        },
      },
    },
    {
      name: "db_search_products",
      description: "Search products by name or description keyword.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search keyword" },
          limit: { type: "number", default: 20 },
        },
      },
    },
    {
      name: "db_get_customer_orders",
      description:
        "Look up recent orders for a customer by their phone number. Returns order status, items, and totals.",
      inputSchema: {
        type: "object",
        required: ["phone"],
        properties: {
          phone: { type: "string", description: "Customer phone number (with or without country code)" },
          limit: { type: "number", default: 5 },
        },
      },
    },
    {
      name: "db_get_order_by_id",
      description: "Fetch a specific order by its MongoDB ObjectId.",
      inputSchema: {
        type: "object",
        required: ["order_id"],
        properties: {
          order_id: { type: "string", description: "MongoDB ObjectId of the order" },
        },
      },
    },
    {
      name: "db_get_categories",
      description: "Fetch all product categories from the database.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "db_send_menu",
      description:
        "Fetch the product menu from the database and send it as a formatted WhatsApp message to a customer.",
      inputSchema: {
        type: "object",
        required: ["to"],
        properties: {
          to: { type: "string", description: "Phone number to send the menu to" },
          category: { type: "string", description: "Optional category filter" },
        },
      },
    },
    {
      name: "db_send_order_status",
      description:
        "Look up a customer's orders and send the order status as a formatted WhatsApp message.",
      inputSchema: {
        type: "object",
        required: ["to"],
        properties: {
          to: { type: "string", description: "Customer phone number (also used as lookup key)" },
        },
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── wa_status ────────────────────────────────────────────────────────
      case "wa_status":
        return { content: [{ type: "text", text: JSON.stringify(wa.getStatus(), null, 2) }] };

      // ── wa_send_message ──────────────────────────────────────────────────
      case "wa_send_message": {
        const result = await wa.sendMessage(args.to, args.message);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, sent_to: result.to }) }] };
      }

      // ── wa_get_messages ──────────────────────────────────────────────────
      case "wa_get_messages": {
        const limit = Math.min(args.limit || 20, 200);
        const msgs = wa.getRecentMessages(limit, args.from_number);
        const simplified = msgs.map((m) => ({
          id: m.id, from: m.from, isGroup: m.isGroup, text: m.text,
          mediaType: m.mediaType || null, timestamp: m.timestamp,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ count: simplified.length, messages: simplified }, null, 2) }] };
      }

      // ── wa_reply ─────────────────────────────────────────────────────────
      case "wa_reply": {
        const original = wa.messages.find((m) => m.id === args.message_id);
        if (!original) {
          await wa.sendMessage(args.to, args.reply_text);
        } else {
          await wa.sock.sendMessage(original.jid, { text: args.reply_text, quoted: original.raw });
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, replied_to: args.message_id }) }] };
      }

      // ── wa_ai_reply ───────────────────────────────────────────────────────
      case "wa_ai_reply": {
        const reply = await generateReply(args.from, args.message_text);
        const jid = args.jid || `${args.from.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
        const original = args.message_id ? wa.messages.find((m) => m.id === args.message_id) : null;
        if (original) {
          await wa.sock.sendMessage(jid, { text: reply, quoted: original.raw });
        } else {
          await wa.sendMessage(args.from, reply);
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, reply }) }] };
      }

      // ── wa_ai_status ──────────────────────────────────────────────────────
      case "wa_ai_status":
        return { content: [{ type: "text", text: JSON.stringify(getProviderStatus(), null, 2) }] };

      // ── wa_poll_new_messages ──────────────────────────────────────────────
      case "wa_poll_new_messages": {
        const after = new Date(args.after_timestamp).getTime();
        if (isNaN(after)) throw new Error("Invalid after_timestamp — use ISO 8601 format");
        const limit = Math.min(args.limit || 50, 200);
        const msgs = wa.messages
          .filter((m) => new Date(m.timestamp).getTime() > after)
          .slice(0, limit)
          .map((m) => ({ id: m.id, from: m.from, isGroup: m.isGroup, text: m.text, mediaType: m.mediaType || null, timestamp: m.timestamp }));
        return { content: [{ type: "text", text: JSON.stringify({ count: msgs.length, messages: msgs }, null, 2) }] };
      }

      // ── db_get_products ───────────────────────────────────────────────────
      case "db_get_products": {
        const products = await fetchProducts({ category: args.category || null });
        return { content: [{ type: "text", text: JSON.stringify({ count: products.length, products }, null, 2) }] };
      }

      // ── db_search_products ────────────────────────────────────────────────
      case "db_search_products": {
        // Search via backend — filter client-side if no dedicated search endpoint
        const products = await fetchProducts({});
        const q = (args.query || "").toLowerCase();
        const filtered = products.filter(
          (p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
        );
        return { content: [{ type: "text", text: JSON.stringify({ count: filtered.length, products: filtered }, null, 2) }] };
      }

      // ── db_get_customer_orders ────────────────────────────────────────────
      case "db_get_customer_orders": {
        const orders = await fetchOrdersByPhone(args.phone);
        return { content: [{ type: "text", text: JSON.stringify({ count: orders.length, orders }, null, 2) }] };
      }

      // ── db_get_order_by_id ────────────────────────────────────────────────
      case "db_get_order_by_id": {
        const order = await fetchOrderById(args.order_id);
        return { content: [{ type: "text", text: JSON.stringify(order, null, 2) }] };
      }

      // ── db_get_categories ─────────────────────────────────────────────────
      case "db_get_categories": {
        const categories = await fetchCategories();
        return { content: [{ type: "text", text: JSON.stringify({ count: categories.length, categories }, null, 2) }] };
      }

      // ── db_send_menu ──────────────────────────────────────────────────────
      case "db_send_menu": {
        const products = await fetchProducts({ category: args.category || null });
        const msg = await generateReplyWithData("Show me the menu", "product menu", products);
        await wa.sendMessage(args.to, msg);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, products_sent: products.length }) }] };
      }

      // ── db_send_order_status ──────────────────────────────────────────────
      case "db_send_order_status": {
        const orders = await fetchOrdersByPhone(args.to);
        const msg = await generateReplyWithData("What is my order status?", "customer orders", orders);
        await wa.sendMessage(args.to, msg);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, orders_found: orders.length }) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function main() {
  console.error("🚀 WhatsApp MCP Server starting...");
  console.error("📱 Connecting to WhatsApp...\n");

  wa.connect().catch((err) => {
    console.error("Fatal WhatsApp error:", err);
    process.exit(1);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ MCP Server ready on stdio");
}

main();
