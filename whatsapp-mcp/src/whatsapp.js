import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  downloadMediaMessage,
  jidDecode,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "path";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
// On Render, DATA_ROOT=/data (persistent disk). Locally it's the project root.
const DATA_ROOT  = process.env.DATA_ROOT || path.join(__dirname, "..");
const AUTH_DIR   = path.join(DATA_ROOT, "auth_info");
const LID_FILE   = path.join(DATA_ROOT, "data", "lid_map.json");

// Silent logger - only show QR and errors
const logger = pino({ level: "silent" });

export class WhatsAppClient extends EventEmitter {
  constructor() {
    super();
    this.sock        = null;
    this.isConnected = false;
    this.qrCode      = null;
    this.messages    = [];
    this.phoneNumber = null;
    this.retryCount  = 0;
    this.maxRetries  = 5;
    // LID → real phone number (e.g. "60520551973045" → "919345550885")
    this.lidMap = this._loadLidMap();
  }

  _loadLidMap() {
    try {
      if (existsSync(LID_FILE)) return new Map(Object.entries(JSON.parse(readFileSync(LID_FILE, "utf8"))));
    } catch {}
    return new Map();
  }

  _saveLidMap() {
    try {
      const dir = path.dirname(LID_FILE);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(LID_FILE, JSON.stringify(Object.fromEntries(this.lidMap), null, 2));
    } catch (err) {
      console.error("[LidMap] Save failed:", err.message);
    }
  }

  _indexContacts(contacts) {
    let changed = false;
    for (const c of contacts) {
      // c.id is the phone JID, c.lid is the LID JID
      if (!c.id || !c.lid) continue;
      const phone = c.id.replace(/@[^@]+$/, "");
      const lid   = c.lid.replace(/@[^@]+$/, "");
      if (phone && lid && this.lidMap.get(lid) !== phone) {
        this.lidMap.set(lid, phone);
        changed = true;
      }
    }
    if (changed) this._saveLidMap();
  }

  /**
   * Query WhatsApp for a phone number's actual JID/LID.
   * Stores the lid→phone mapping so incoming messages resolve correctly.
   * @param {string} phone  10-digit Indian number (no country code)
   * @returns {string|null} The LID number if one was found, otherwise null
   */
  async resolvePhoneToLid(phone) {
    if (!this.sock || !this.isConnected) return null;
    try {
      const full = phone.length === 10 ? `91${phone}` : phone;
      const results = await this.sock.onWhatsApp(full);
      if (!results?.length || !results[0].exists) return null;
      const r = results[0];

      // Some Baileys versions return both jid + lid on the result
      const lidJid = r.lid || (r.jid?.endsWith("@lid") ? r.jid : null);
      const lidNum = lidJid ? lidJid.replace(/@[^@]+$/, "") : null;
      if (lidNum) {
        this.lidMap.set(lidNum, full);
        this._saveLidMap();
        console.error(`[LidMap] ${phone} → LID ${lidNum}`);
        return lidNum;
      }

      // Fallback: jid differs from input full number → treat as LID
      const jidNum = r.jid?.replace(/@[^@]+$/, "");
      if (jidNum && jidNum !== full) {
        this.lidMap.set(jidNum, full);
        this._saveLidMap();
        console.error(`[LidMap] ${phone} → LID ${jidNum} (via jid field)`);
        return jidNum;
      }
    } catch (err) {
      console.error(`[LidMap] resolvePhoneToLid(${phone}) failed: ${err.message}`);
    }
    return null;
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false, // we handle QR ourselves
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ["WhatsApp MCP Bot", "Chrome", "120.0.0"],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    // Connection updates
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

        // Index any contacts already in the in-memory store (populated during auth)
        const existing = Object.values(this.sock?.contacts || {});
        if (existing.length) {
          console.error(`[LidMap] Indexing ${existing.length} existing contacts`);
          this._indexContacts(existing);
        }
      }

      if (connection === "close") {
        this.isConnected = false;
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = reason !== DisconnectReason.loggedOut;

        console.error(
          `❌ Connection closed. Reason: ${reason}. Reconnect: ${shouldReconnect}`
        );
        this.emit("disconnected", reason);

        if (reason === DisconnectReason.loggedOut) {
          // Clear saved credentials so next connect() shows a fresh QR
          this._clearAuth();
          console.error("🔄 Logged out — clearing auth and reconnecting for new QR...");
          setTimeout(() => this.connect(), 1000);
        } else if (shouldReconnect && this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.min(1000 * 2 ** this.retryCount, 30000);
          console.error(
            `🔄 Reconnecting in ${delay / 1000}s (attempt ${this.retryCount}/${this.maxRetries})...`
          );
          setTimeout(() => this.connect(), delay);
        }
      }
    });

    // Save credentials whenever updated
    this.sock.ev.on("creds.update", saveCreds);

    // Build LID → phone map from contact syncs
    this.sock.ev.on("contacts.upsert", (contacts) => this._indexContacts(contacts));
    this.sock.ev.on("contacts.update", (updates)  => this._indexContacts(updates));

    // Incoming messages
    this.sock.ev.on("messages.upsert", ({ messages: msgs, type }) => {
      if (type !== "notify") return;

      for (const msg of msgs) {
        if (msg.key.fromMe) continue; // skip our own messages
        if (isJidBroadcast(msg.key.remoteJid)) continue; // skip broadcast

        const parsed = this._parseMessage(msg);
        if (!parsed) continue;

        // Keep last 200 messages
        this.messages.unshift(parsed);
        if (this.messages.length > 200) this.messages.pop();

        console.error(
          `📨 [RAW: ${msg.key.remoteJid}] [PHONE: ${parsed.phone}] ${parsed.text?.substring(0, 80) || "[media]"}`
        );
        this.emit("message", parsed);
      }
    });

    return this.sock;
  }

  _parseMessage(msg) {
    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    /**
     * Resolve any JID to a plain phone number string.
     *
     * JID types Baileys can hand us:
     *   919876543210@s.whatsapp.net  → normal phone JID   ✅ user = phone
     *   60520551973045@lid           → LID (not a phone)  ⚠️ must look up
     *   1234567890@g.us              → group              (handled separately)
     *
     * For LIDs, modern Baileys puts the real phone JID on the message key
     * itself (key.senderPn / key.participantPn) — that's our primary source.
     */
    const resolveJid = (j, pnHint) => {
      if (!j) return null;

      const decoded = jidDecode(j);
      if (!decoded?.user || !decoded?.server) return null;

      const { user, server } = decoded;

      // ── Normal phone JID ──────────────────────────────────────────────────
      if (server === "s.whatsapp.net") {
        return user; // e.g. "919345550885"
      }

      // ── LID — must resolve to real phone ──────────────────────────────────
      if (server === "lid") {
        // 1. Phone hint carried directly on the message key (most reliable)
        if (pnHint) {
          const pn = jidDecode(pnHint)?.user;
          if (pn) {
            if (this.lidMap.get(user) !== pn) {
              this.lidMap.set(user, pn);
              this._saveLidMap();
              console.error(`[LidMap] resolved via msg key: ${user}@lid → ${pn}`);
            }
            return pn;
          }
        }

        // 2. Persisted lidMap (survives restarts)
        if (this.lidMap.has(user)) return this.lidMap.get(user);

        // 3. Baileys signalRepository LID mapping (newer versions)
        try {
          const pnJid = this.sock?.signalRepository?.lidMapping?.getPNForLID?.(j);
          const pn    = pnJid ? jidDecode(pnJid)?.user : null;
          if (pn) {
            this.lidMap.set(user, pn);
            this._saveLidMap();
            console.error(`[LidMap] resolved via signalRepository: ${user}@lid → ${pn}`);
            return pn;
          }
        } catch {}

        // 4. Baileys in-memory contacts store
        const contacts = this.sock?.contacts || {};
        for (const [cJid, c] of Object.entries(contacts)) {
          if (!cJid.endsWith("@s.whatsapp.net")) continue;
          const phone  = cJid.replace("@s.whatsapp.net", "");
          const lidNum = (c.lid || "").replace(/@[^@]+$/, "");
          if (lidNum === user) {
            this.lidMap.set(user, phone); // cache for next time
            this._saveLidMap();
            console.error(`[LidMap] resolved via contacts: ${user}@lid → ${phone}`);
            return phone;
          }
        }

        // 5. Unresolvable — log and return null (caller will skip message)
        console.error(`[LidMap] ⚠️  Cannot resolve LID ${user} — no contact mapping yet`);
        return null;
      }

      // ── Any other server type (groups handled outside) ────────────────────
      return user;
    };

    // phone  → business logic only  (whitelist, AI, DB)   e.g. "919345550885"
    // sendJid → transport only      (sock.sendMessage)    e.g. "919345550885@s.whatsapp.net"
    const phone = isGroup
      ? resolveJid(msg.key.participant, msg.key.participantPn) || "unknown"
      : resolveJid(jid, msg.key.senderPn);

    if (!phone) return null; // LID not yet resolvable — drop silently

    // Always send back on a canonical @s.whatsapp.net JID (not an @lid address)
    const sendJid = isGroup ? jid : `${phone}@s.whatsapp.net`;

    const content = msg.message;
    if (!content) return null;

    let text      = null;
    let mediaType = null;
    let mediaMime = null;

    if (content.conversation) {
      text = content.conversation;
    } else if (content.extendedTextMessage?.text) {
      text = content.extendedTextMessage.text;
    } else if (content.imageMessage) {
      text      = content.imageMessage.caption || "";
      mediaType = "image";
      mediaMime = content.imageMessage.mimetype || "image/jpeg";
    } else if (content.videoMessage) {
      text      = content.videoMessage.caption || "";
      mediaType = "video";
      mediaMime = content.videoMessage.mimetype || "video/mp4";
    } else if (content.audioMessage) {
      mediaType = "audio";
      mediaMime = content.audioMessage.mimetype || "audio/ogg; codecs=opus";
    } else if (content.documentMessage) {
      text      = content.documentMessage.fileName || "";
      mediaType = "document";
      mediaMime = content.documentMessage.mimetype || "application/octet-stream";
    } else if (content.stickerMessage) {
      mediaType = "sticker";
      mediaMime = content.stickerMessage.mimetype || "image/webp";
    }

    return {
      id:        msg.key.id,
      phone,               // "919345550885"                   — use for identity / logic
      jid:       sendJid,  // "919345550885@s.whatsapp.net"    — use for sock.sendMessage
      rawJid:    jid,      // original JID (may be LID-based)  — kept for debugging
      isGroup,
      groupName: isGroup ? jid : null,
      text,
      mediaType,
      mediaMime,
      timestamp: msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      raw: msg,
    };
  }

  async downloadMedia(msg) {
    try {
      const buffer = await downloadMediaMessage(
        msg.raw,
        "buffer",
        {},
        { logger, reuploadRequest: this.sock.updateMediaMessage }
      );
      return { data: buffer.toString("base64"), mimeType: msg.mediaMime };
    } catch (err) {
      console.error(`⚠️  Failed to download media: ${err.message}`);
      return null;
    }
  }

  async sendMessage(to, text) {
    if (!this.isConnected) throw new Error("WhatsApp not connected");

    // Normalize number to JID
    const jid = to.includes("@")
      ? to
      : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;

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
      msgs = msgs.filter((m) => m.phone.includes(normalized));
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
    // Reconnect immediately so QR appears right away
    setTimeout(() => this.connect(), 500);
  }

  getStatus() {
    return {
      connected: this.isConnected,
      phoneNumber: this.phoneNumber
        ? `+${this.phoneNumber}`
        : null,
      qrPending: this.qrCode !== null,
      storedMessages: this.messages.length,
    };
  }
}
