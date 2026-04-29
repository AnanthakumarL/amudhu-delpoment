/**
 * WhatsApp Bot Control Server
 * Exposes HTTP API for the Admin Panel to control the bot, view QR code, and read chat logs.
 */

import express from "express";
import QRCode from "qrcode";
import { getChatLog, getAllChatSummaries, getCumulativeStats, getProviderStatus, clearHistory, getActiveProvider, setActiveProvider, getOpenAIModel, setOpenAIModel, getWhitelist, addToWhitelist, removeFromWhitelist } from "./ai.js";

const PORT = parseInt(process.env.PORT || process.env.BOT_SERVER_PORT || "7998", 10);
const ADMIN_ORIGINS = (process.env.ADMIN_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",").map(s => s.trim());

export function startControlServer(waClient) {
  const app = express();
  app.use(express.json());

  // CORS — allow admin panel origins
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || ADMIN_ORIGINS.includes(origin) || origin.endsWith(".vercel.app") || origin.endsWith(".amudhu.click") || origin === "https://amudhu.click") {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // ── Status ────────────────────────────────────────────────────────────────
  app.get("/api/status", (_req, res) => {
    const s = waClient.getStatus();
    res.json({
      connected: s.connected,
      phoneNumber: s.phoneNumber,
      qrPending: s.qrPending,
      storedMessages: s.storedMessages,
      ai: getProviderStatus(),
    });
  });

  // ── QR Code as base64 PNG ─────────────────────────────────────────────────
  app.get("/api/qr", async (_req, res) => {
    const raw = waClient.qrCode;
    if (!raw) {
      return res.json({ qr: null, connected: waClient.isConnected });
    }
    try {
      const dataUrl = await QRCode.toDataURL(raw, { width: 300, margin: 2 });
      res.json({ qr: dataUrl, connected: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Chat list (one entry per user) ───────────────────────────────────────
  app.get("/api/chats", (_req, res) => {
    res.json(getAllChatSummaries());
  });

  // ── Chat log for a specific phone ─────────────────────────────────────────
  app.get("/api/chats/:phone", (req, res) => {
    const logs = getChatLog(req.params.phone);
    res.json(logs);
  });

  // ── Recent WhatsApp messages (raw, from Baileys) ──────────────────────────
  app.get("/api/messages", (req, res) => {
    const { phone, limit = 50 } = req.query;
    const msgs = waClient.getRecentMessages(Number(limit), phone || null);
    res.json(msgs);
  });

  // ── Analytics summary ─────────────────────────────────────────────────────
  app.get("/api/analytics", (_req, res) => {
    const summaries = getAllChatSummaries();
    const totalMessages  = summaries.reduce((s, u) => s + u.messageCount, 0);
    const totalInputTokens  = summaries.reduce((s, u) => s + u.totalInputTokens, 0);
    const totalOutputTokens = summaries.reduce((s, u) => s + u.totalOutputTokens, 0);
    const totalCostINR   = summaries.reduce((s, u) => s + u.totalCostINR, 0);
    const cumulative = getCumulativeStats();
    res.json({
      totalUsers: summaries.length,
      totalMessages,
      totalInputTokens,
      totalOutputTokens,
      totalCostINR: +totalCostINR.toFixed(4),
      // All-time totals — never reset even when records are cleared
      allTimeInputTokens:  cumulative.inputTokens,
      allTimeOutputTokens: cumulative.outputTokens,
      allTimeCostUSD:      cumulative.costUSD,
      allTimeCostINR:      cumulative.costINR,
      users: summaries,
    });
  });

  // ── Logout from WhatsApp (clears auth + reconnects for fresh QR) ─────────
  app.post("/api/logout", async (_req, res) => {
    try {
      await waClient.logout();
      res.json({ success: true, message: "Logged out. QR code will appear shortly." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Send a message (admin → user) ─────────────────────────────────────────
  app.post("/api/send", async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ error: "to and text are required" });
    try {
      const result = await waClient.sendMessage(to, text);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Clear history for a user ──────────────────────────────────────────────
  app.post("/api/chats/:phone/clear", (req, res) => {
    clearHistory(req.params.phone);
    res.json({ success: true });
  });

  // ── AI provider override ──────────────────────────────────────────────────
  app.get("/api/provider", (_req, res) => {
    res.json({ provider: getActiveProvider() });
  });

  app.post("/api/provider", (req, res) => {
    const { provider } = req.body;
    try {
      setActiveProvider(provider);
      res.json({ success: true, provider });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── OpenAI model selector ─────────────────────────────────────────────────
  const GPT_MODELS = [
    { id: "gpt-4.1", label: "GPT-4.1 (smart)" },
    { id: "gpt-5",   label: "GPT-5 (most capable)" },
  ];

  app.get("/api/gpt-model", (_req, res) => {
    res.json({ model: getOpenAIModel(), models: GPT_MODELS });
  });

  app.post("/api/gpt-model", (req, res) => {
    const { model } = req.body;
    if (!model) return res.status(400).json({ error: "model is required" });
    setOpenAIModel(model);
    res.json({ success: true, model });
  });

  // ── Broadcast ─────────────────────────────────────────────────────────────
  app.post("/api/broadcast", async (req, res) => {
    if (!waClient.isConnected) {
      return res.status(503).json({ error: "WhatsApp not connected" });
    }

    const { phones, type = "text", text, mediaBase64, mimeType, fileName } = req.body;

    // Use provided list or fall back to all whitelisted numbers
    const rawTargets = phones && phones.length > 0 ? phones : getWhitelist();
    if (!rawTargets.length) {
      return res.status(400).json({ error: "No recipients — add numbers in Allowed Users first" });
    }

    if (type === "text" && !text) {
      return res.status(400).json({ error: "text is required for text messages" });
    }
    if (type !== "text" && !mediaBase64) {
      return res.status(400).json({ error: "mediaBase64 is required for media messages" });
    }

    const results = [];
    for (const phone of rawTargets) {
      const digits = phone.replace(/\D/g, "");
      // Indian numbers: ensure full E.164 without +
      const full = digits.length === 10 ? `91${digits}` : digits;
      const jid = `${full}@s.whatsapp.net`;

      try {
        let content;
        if (type === "text") {
          content = { text };
        } else {
          const buf = Buffer.from(mediaBase64, "base64");
          const mime = mimeType || (
            type === "image"    ? "image/jpeg" :
            type === "video"    ? "video/mp4"  :
            "application/octet-stream"
          );
          if (type === "image") {
            content = { image: buf, mimetype: mime, caption: text || "" };
          } else if (type === "video") {
            content = { video: buf, mimetype: mime, caption: text || "" };
          } else if (type === "document") {
            content = { document: buf, mimetype: mime, fileName: fileName || "file", caption: text || "" };
          } else {
            content = { text: text || "" };
          }
        }

        await waClient.sock.sendMessage(jid, content);
        results.push({ phone: digits, success: true });
      } catch (err) {
        console.error(`[Broadcast] Failed to send to ${digits}: ${err.message}`);
        results.push({ phone: digits, success: false, error: err.message });
      }

      // Throttle — avoid WhatsApp rate limiting
      await new Promise((r) => setTimeout(r, 600));
    }

    const sent   = results.filter((r) => r.success).length;
    const failed = results.length - sent;
    console.error(`[Broadcast] Done: ${sent} sent, ${failed} failed`);
    res.json({ sent, failed, total: results.length, results });
  });

  // ── Whitelist ─────────────────────────────────────────────────────────────
  app.get("/api/whitelist", (_req, res) => {
    res.json(getWhitelist());
  });

  app.post("/api/whitelist", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "phone is required" });
    const normalized = addToWhitelist(phone);
    // Eagerly resolve LID so this number works immediately without a bot restart
    if (waClient.isConnected) {
      waClient.resolvePhoneToLid(normalized).catch(() => {});
    }
    res.json({ success: true, phone: normalized });
  });

  app.delete("/api/whitelist/:phone", (req, res) => {
    const removed = removeFromWhitelist(req.params.phone);
    res.json({ success: removed });
  });

  app.listen(PORT, () => {
    console.error(`🌐 Bot control server running on http://localhost:${PORT}`);
  });

  return app;
}
