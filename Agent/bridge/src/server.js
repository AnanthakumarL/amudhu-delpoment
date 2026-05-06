import express from "express";
import QRCode from "qrcode";

const PORT = parseInt(process.env.BRIDGE_PORT || "7997", 10);
const ADMIN_ORIGINS = (process.env.ADMIN_ORIGINS ||
  "http://localhost:5173,http://localhost:5174,http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

export function startControlServer(waClient) {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || ADMIN_ORIGINS.includes(origin) || origin.endsWith(".vercel.app")) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/api/status", (_req, res) => {
    res.json(waClient.getStatus());
  });

  app.get("/api/qr", async (_req, res) => {
    const raw = waClient.qrCode;
    if (!raw) return res.json({ qr: null, connected: waClient.isConnected });
    try {
      const dataUrl = await QRCode.toDataURL(raw, { width: 300, margin: 2 });
      res.json({ qr: dataUrl, connected: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/messages", (req, res) => {
    const { phone, limit = 50 } = req.query;
    res.json(waClient.getRecentMessages(Number(limit), phone || null));
  });

  app.post("/api/logout", async (_req, res) => {
    try {
      await waClient.logout();
      res.json({ success: true, message: "Logged out — scan the new QR to reconnect." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/send", async (req, res) => {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: "to and text are required" });
    try {
      const result = await waClient.sendMessage(to, text);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/broadcast", async (req, res) => {
    const { phones, type = "text", text = "", mediaBase64, mimeType, fileName } = req.body || {};
    if (!phones || !phones.length) return res.status(400).json({ error: "phones required" });
    const results = [];
    let sent = 0, failed = 0;
    for (const phone of phones) {
      try {
        await waClient.sendMessage(phone, text);
        sent++;
        results.push({ phone, success: true });
      } catch (err) {
        failed++;
        results.push({ phone, success: false, error: err.message });
      }
      await new Promise(r => setTimeout(r, 600));
    }
    res.json({ sent, failed, total: phones.length, results });
  });

  app.listen(PORT, () => {
    console.error(`🌐 Bridge control server running on http://localhost:${PORT}`);
  });

  return app;
}
