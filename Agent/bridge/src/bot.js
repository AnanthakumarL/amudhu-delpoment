import { setDefaultResultOrder } from "dns";
setDefaultResultOrder("ipv4first");

import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WhatsAppClient } from "./whatsapp.js";
import { startControlServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = path.join(__dirname, "..", "..", ".env");
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

const AGENT_URL = process.env.AGENT_URL || "http://localhost:7998";
const BRIDGE_ENDPOINT = `${AGENT_URL}/webhook/bridge`;

const inFlight = new Set();

async function forwardToAgent(phone, text, audioBase64 = null, mimeType = null) {
  const body = { phone, message: text || "" };
  if (audioBase64) {
    body.audio_base64 = audioBase64;
    body.audio_mime = mimeType || "audio/ogg; codecs=opus";
  }
  const res = await fetch(BRIDGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Agent ${res.status}: ${await res.text()}`);
  return await res.json();
}

async function handleMessage(wa, msg) {
  const isVoice = msg.mediaType === "voice" || msg.mediaType === "audio";
  if (!msg.text && !isVoice) return;
  if (inFlight.has(msg.id)) return;
  inFlight.add(msg.id);

  const phone = msg.from.replace(/[^0-9]/g, "");

  try {
    const tag = msg.isLid ? `${phone} (LID-only)` : phone;
    await wa.sock.sendPresenceUpdate("composing", msg.jid).catch(() => {});

    let data;
    if (isVoice) {
      console.error(`\n🎤 [${tag}] Voice message received — transcribing...`);
      const audioBuffer = await wa.downloadAudio(msg.raw);
      const audioBase64 = audioBuffer.toString("base64");
      const mimeType = msg.raw.message?.audioMessage?.mimetype || "audio/ogg; codecs=opus";
      data = await forwardToAgent(phone, null, audioBase64, mimeType);
    } else {
      const text = msg.text.trim();
      console.error(`\n📨 [${tag}] ${text.substring(0, 120)}`);
      data = await forwardToAgent(phone, text);
    }

    const rawMessages = Array.isArray(data.messages) && data.messages.length
      ? data.messages
      : [data.reply];
    const messages = rawMessages.map((m) => (m || "").trim()).filter(Boolean);

    await wa.sock.sendPresenceUpdate("paused", msg.jid).catch(() => {});

    if (messages.length === 0) {
      console.error("⚠️  Agent returned empty reply — nothing sent.");
    } else {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const opts = i === 0 ? { text: m, quoted: msg.raw } : { text: m };
        await wa.sock.sendMessage(msg.jid, opts);
        console.error(`🤖 ${m.substring(0, 100)}${m.length > 100 ? "…" : ""}`);
        if (i < messages.length - 1) {
          await wa.sock.sendPresenceUpdate("composing", msg.jid).catch(() => {});
          await new Promise((r) => setTimeout(r, 600));
          await wa.sock.sendPresenceUpdate("paused", msg.jid).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error(`❌ [${phone}] ${err.message}`);
    await wa.sock.sendPresenceUpdate("paused", msg.jid).catch(() => {});
    await wa.sendMessage(phone, "Sorry, something went wrong. Please try again in a moment.").catch(() => {});
  } finally {
    inFlight.delete(msg.id);
  }
}

async function main() {
  console.error("🤖 WhatsApp bridge starting…");
  console.error(`   ↳ AI agent: ${AGENT_URL}`);
  console.error("📱 Connecting to WhatsApp…\n");

  const wa = new WhatsAppClient();
  startControlServer(wa);

  wa.on("connected", (number) => {
    console.error(`✅ Connected as +${number} — bridge is live.\n`);
  });

  wa.on("message", (msg) => handleMessage(wa, msg));

  wa.on("disconnected", (reason) => {
    console.error(`⚠️  Disconnected (${reason}) — reconnecting…`);
  });

  await wa.connect();

  process.on("SIGINT", () => {
    console.error("\n👋 Shutting down…");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
