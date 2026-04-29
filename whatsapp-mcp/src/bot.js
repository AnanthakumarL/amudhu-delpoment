/**
 * Amudhu Ice Creams WhatsApp Bot
 *
 * Two-layer design:
 *   Transport layer  → always uses msg.jid  (full JID like 919876543210@s.whatsapp.net)
 *   Business layer   → always uses msg.phone (plain number like 919876543210)
 *
 * WhatsApp does not use raw phone numbers internally — it uses JIDs (Jabber IDs).
 * Newer accounts also receive an LID (Linked Identity) instead of a phone-based JID.
 * whatsapp.js resolves LIDs → real phone numbers before emitting the "message" event,
 * so by the time we get here msg.phone is always the real number.
 *
 * Rule: pass msg.jid to every sock.* call; pass msg.phone to every business call.
 */

import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WhatsAppClient } from "./whatsapp.js";
import { agentReply, getProviderStatus, isWhitelisted, getWhitelist } from "./ai.js";
import { startControlServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────
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

// Keep processed IDs for 5 minutes to block delayed duplicate deliveries from Baileys
const processedIds = new Map(); // id → timestamp
const DEDUP_TTL = 5 * 60 * 1000;
function isDuplicate(id) {
  const now = Date.now();
  // Purge old entries
  for (const [k, ts] of processedIds) if (now - ts > DEDUP_TTL) processedIds.delete(k);
  if (processedIds.has(id)) return true;
  processedIds.set(id, now);
  return false;
}

const processingSet = new Set();
const SUPPORTED_MEDIA = new Set(["image", "audio"]);

async function handleMessage(wa, msg) {
  // ── Transport-layer filters ───────────────────────────────────────────────
  // Groups: rawJid ends with @g.us (msg.jid is rebuilt for DMs, so check rawJid)
  if (msg.rawJid && msg.rawJid.endsWith("@g.us")) return;

  // No usable content
  if (!msg.text && !SUPPORTED_MEDIA.has(msg.mediaType)) return;

  // De-duplicate — blocks both rapid re-delivery and delayed re-delivery (up to 5 min)
  if (isDuplicate(msg.id)) return;

  // ── Business-logic filters (use phone, never jid) ─────────────────────────
  // msg.phone = resolved plain phone number, e.g. "919345550885"
  const phone = msg.phone || "";
  console.error(`📱 [${phone}] raw JID: ${msg.rawJid}`);

  if (!isWhitelisted(phone)) {
    const allowed = getWhitelist();
    console.error(`🚫 [${phone}] BLOCKED — not in Allowed Users. Configured: [${allowed.join(", ") || "(none)"}]`);
    return;
  }
  console.error(`✅ [${phone}] Whitelist OK`);

  processingSet.add(msg.id);

  // phone10 = last 10 digits → used for DB / account lookups (Indian numbers)
  const phone10 = phone.replace(/\D/g, "").slice(-10);
  const text    = msg.text?.trim() || "";
  let   media   = null;

  try {
    const mediaLabel = msg.mediaType ? ` [${msg.mediaType}]` : "";
    console.error(`\n📨 [${phone}]${mediaLabel} ${text.substring(0, 120)}`);

    // Typing indicator — always send to msg.jid (transport layer)
    await wa.sock.sendPresenceUpdate("composing", msg.jid);

    // Download image/audio bytes for multimodal AI
    if (SUPPORTED_MEDIA.has(msg.mediaType)) {
      media = await wa.downloadMedia(msg);
      if (!media) console.error(`⚠️  Media download failed for ${msg.id} — proceeding text-only`);
    }

    // AI receives phone (identity key) and phone10 (DB lookup key)
    const reply = await agentReply(phone, phone10, text, media);

    await wa.sock.sendPresenceUpdate("paused", msg.jid);

    if (!reply || !reply.trim()) {
      console.error(`⚠️  [${phone}] AI returned empty reply — skipping send`);
      return;
    }

    // Always send via msg.jid (transport layer — may differ from phone-based JID)
    await wa.sock.sendMessage(msg.jid, { text: reply.trim(), quoted: msg.raw });

    console.error(`🤖 ${reply.substring(0, 100)}${reply.length > 100 ? "…" : ""}`);
  } catch (err) {
    console.error(`❌ [${phone}] ${err.message}`);
    await wa.sock.sendPresenceUpdate("paused", msg.jid).catch(() => {});
    const errMsg = media
      ? "⚠️ Sorry, I couldn't process your media right now. Please try again in a moment! 🙏"
      : "⚠️ Sorry, something went wrong on our end. Please try again!";
    await wa.sock.sendMessage(msg.jid, { text: errMsg }).catch(() => {});
  } finally {
    processingSet.delete(msg.id);
  }
}

async function main() {
  console.error("🤖 Amudhu Ice Creams WhatsApp Bot starting...");
  console.error("📋 AI:", JSON.stringify(getProviderStatus()));
  console.error(`🌐 Backend: ${process.env.BACKEND_API_URL || "http://localhost:7999"}`);
  console.error("📱 Connecting to WhatsApp...\n");

  const wa = new WhatsAppClient();

  // Start admin control server
  startControlServer(wa);

  wa.on("connected", async (number) => {
    console.error(`✅ Connected as +${number} — bot is live! 🍦\n`);

    // Eagerly resolve LIDs for all whitelisted numbers so the first message works
    const phones = getWhitelist();
    if (phones.length) {
      console.error(`🔍 Resolving LIDs for ${phones.length} whitelisted number(s)…`);
      for (const p of phones) {
        await wa.resolvePhoneToLid(p);
        await new Promise((r) => setTimeout(r, 400)); // stay under WA rate limit
      }
      console.error("✅ LID resolution done");
    }
  });

  wa.on("message", (msg) => handleMessage(wa, msg));

  wa.on("disconnected", (reason) => {
    console.error(`⚠️  Disconnected (${reason}) — reconnecting...`);
  });

  await wa.connect();

  process.on("SIGINT", () => {
    console.error("\n👋 Shutting down...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
