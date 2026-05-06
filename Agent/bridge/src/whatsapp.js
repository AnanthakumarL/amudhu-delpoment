import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import { rmSync, existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, "..", "auth_info");

const logger = pino({ level: "silent" });

export class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.isConnected = false;
    this.qrCode = null;
    this.messages = [];
    this.phoneNumber = null;
    this.retryCount = 0;
    this.maxRetries = 5;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ["WhatsApp Agent Bridge", "Chrome", "120.0.0"],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        console.error("\n========== SCAN THIS QR CODE IN WHATSAPP ==========");
        qrcode.generate(qr, { small: true });
        console.error("====================================================");
        console.error("Open WhatsApp > Linked Devices > Link a Device\n");
        this.emit("qr", qr);
      }

      if (connection === "open") {
        this.isConnected = true;
        this.qrCode = null;
        this.retryCount = 0;
        this.phoneNumber = this.sock.user?.id?.split(":")[0] || null;
        console.error(`\n✅ WhatsApp connected! Number: +${this.phoneNumber}\n`);
        this.emit("connected", this.phoneNumber);
      }

      if (connection === "close") {
        this.isConnected = false;
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        console.error(`❌ Connection closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`);
        this.emit("disconnected", reason);

        if (reason === DisconnectReason.loggedOut) {
          this._clearAuth();
          console.error("🔄 Logged out — clearing auth and reconnecting for new QR...");
          setTimeout(() => this.connect(), 1000);
        } else if (shouldReconnect && this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.min(1000 * 2 ** this.retryCount, 30000);
          console.error(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.retryCount}/${this.maxRetries})...`);
          setTimeout(() => this.connect(), delay);
        }
      }
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("messages.upsert", ({ messages: msgs, type }) => {
      if (type !== "notify") return;

      for (const msg of msgs) {
        if (msg.key.fromMe) continue;
        if (isJidBroadcast(msg.key.remoteJid)) continue;

        const parsed = this._parseMessage(msg);
        if (!parsed) continue;

        this.messages.unshift(parsed);
        if (this.messages.length > 200) this.messages.pop();

        console.error(`📨 New message from ${parsed.from}: ${parsed.text?.substring(0, 80) || "[media]"}`);
        this.emit("message", parsed);
      }
    });

    return this.sock;
  }

  _parseMessage(msg) {
    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    const phoneJid = isGroup
      ? msg.key.participantPn || msg.key.participant
      : msg.key.senderPn || jid;

    const isLid = (phoneJid || "").endsWith("@lid");
    const from = (phoneJid || "")
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .replace("@g.us", "") || "unknown";

    if (isLid) {
      console.error(`⚠️  LID-only message (no phone number): ${phoneJid} — whitelist won't match.`);
    }

    const content = msg.message;
    if (!content) return null;

    let text = null;
    let mediaType = null;

    if (content.conversation) {
      text = content.conversation;
    } else if (content.extendedTextMessage?.text) {
      text = content.extendedTextMessage.text;
    } else if (content.imageMessage) {
      text = content.imageMessage.caption || "";
      mediaType = "image";
    } else if (content.videoMessage) {
      text = content.videoMessage.caption || "";
      mediaType = "video";
    } else if (content.audioMessage) {
      mediaType = content.audioMessage.ptt ? "voice" : "audio";
    } else if (content.documentMessage) {
      text = content.documentMessage.fileName || "";
      mediaType = "document";
    } else if (content.stickerMessage) {
      mediaType = "sticker";
    }

    return {
      id: msg.key.id,
      from,
      jid,
      senderJid: phoneJid,
      isLid,
      isGroup,
      groupName: isGroup ? jid : null,
      text,
      mediaType,
      timestamp: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      raw: msg,
    };
  }

  async downloadAudio(rawMsg) {
    const buffer = await downloadMediaMessage(rawMsg, "buffer", {}, { logger });
    return buffer;
  }

  async sendMessage(to, text) {
    if (!this.isConnected) throw new Error("WhatsApp not connected");
    const jid = to.includes("@") ? to : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text });
    return { success: true, to: jid, text };
  }

  async sendGroupMessage(groupJid, text) {
    if (!this.isConnected) throw new Error("WhatsApp not connected");
    await this.sock.sendMessage(groupJid, { text });
    return { success: true, to: groupJid, text };
  }

  getRecentMessages(limit = 20, fromNumber = null) {
    let msgs = this.messages;
    if (fromNumber) {
      const normalized = fromNumber.replace(/[^0-9]/g, "");
      msgs = msgs.filter((m) => m.from.includes(normalized));
    }
    return msgs.slice(0, limit);
  }

  _clearAuth() {
    try {
      if (existsSync(AUTH_DIR)) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        console.error("🗑️  Auth cleared.");
      }
    } catch (e) {
      console.error("Failed to clear auth:", e.message);
    }
    this.isConnected = false;
    this.qrCode = null;
    this.phoneNumber = null;
    this.retryCount = 0;
  }

  async logout() {
    try {
      if (this.sock) await this.sock.logout().catch(() => {});
    } catch { /* ignore */ }
    this._clearAuth();
    setTimeout(() => this.connect(), 500);
  }

  getStatus() {
    return {
      connected: this.isConnected,
      phoneNumber: this.phoneNumber ? `+${this.phoneNumber}` : null,
      qrPending: this.qrCode !== null,
      storedMessages: this.messages.length,
    };
  }
}
