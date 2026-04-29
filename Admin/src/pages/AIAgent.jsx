import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bot, Wifi, WifiOff, QrCode, RefreshCw, LogOut, Send,
  MessageSquare, Users, Coins, TrendingUp, ChevronRight,
  X, Clock, Zap, IndianRupee, AlertCircle, CheckCircle2,
  Loader2, ArrowLeft, Trash2, Sparkles, Settings2, ShieldCheck, Plus, Phone,
  Radio, Image, Video, FileText, Link, Upload, CheckCheck
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const BOT_API = import.meta.env.VITE_BOT_API_URL || 'http://localhost:7998';

// ── helpers ───────────────────────────────────────────────────────────────────
const botFetch = (path, opts = {}) =>
  fetch(`${BOT_API}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });

function formatINR(val) {
  return `₹${Number(val || 0).toFixed(4)}`;
}
function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-IN');
}
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN');
}
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// ── Status badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ connected, qrPending }) => {
  if (connected) return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
      <CheckCircle2 size={14} /> Connected
    </span>
  );
  if (qrPending) return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-medium">
      <QrCode size={14} /> Waiting for QR Scan
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
      <AlertCircle size={14} /> Disconnected
    </span>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color = 'violet' }) => {
  const colors = {
    violet: 'bg-violet-50 text-violet-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-dark-100 p-5 flex items-center gap-4">
      <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', colors[color])}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xs text-dark-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-dark-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-dark-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

// ── Chat log drawer ───────────────────────────────────────────────────────────
const ChatDrawer = ({ phone, onClose, onSend }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendText, setSendText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await botFetch(`/api/chats/${phone}`);
      const data = await r.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const handleSend = async () => {
    if (!sendText.trim()) return;
    setSending(true);
    try {
      const r = await botFetch('/api/send', { method: 'POST', body: JSON.stringify({ to: phone, text: sendText.trim() }) });
      if (r.ok) {
        toast.success('Message sent');
        setSendText('');
        onSend?.();
      } else {
        toast.error('Failed to send');
      }
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear AI conversation history for this user?')) return;
    await botFetch(`/api/chats/${phone}/clear`, { method: 'POST' });
    toast.success('History cleared');
    load();
  };

  const totalCost = logs.reduce((s, l) => s + (l.costINR || 0), 0);
  const totalTokens = logs.reduce((s, l) => s + (l.inputTokens || 0) + (l.outputTokens || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="relative ml-auto w-full max-w-2xl h-full bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-dark-100 flex-shrink-0">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-50 text-dark-400">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-dark-900 truncate">+{phone}</p>
            <p className="text-xs text-dark-400">{logs.length} AI exchanges • {formatNumber(totalTokens)} tokens • {formatINR(totalCost)}</p>
          </div>
          <button onClick={handleClear} title="Clear history" className="p-1.5 rounded-lg hover:bg-red-50 text-dark-400 hover:text-red-600">
            <Trash2 size={18} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-50 text-dark-400">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="animate-spin text-violet-500" size={28} />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-dark-400">
              <MessageSquare size={36} className="mb-2 opacity-30" />
              <p className="text-sm">No AI exchange logs yet</p>
            </div>
          ) : logs.map((log) => (
            <div key={log.id} className="space-y-2">
              {/* User bubble */}
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-violet-600 text-white rounded-2xl rounded-tr-md px-4 py-2.5">
                  <p className="text-sm leading-relaxed">{log.userText}</p>
                  <p className="text-xs text-violet-200 mt-1 text-right">{formatTime(log.timestamp)}</p>
                </div>
              </div>
              {/* Bot reply */}
              <div className="flex justify-start">
                <div className="max-w-[80%] bg-dark-50 rounded-2xl rounded-tl-md px-4 py-2.5">
                  <p className="text-sm leading-relaxed text-dark-800 whitespace-pre-wrap">{log.reply}</p>
                  {/* Token/cost info */}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-dark-100 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-dark-400">
                      <Zap size={11} />
                      {formatNumber(log.inputTokens)} in / {formatNumber(log.outputTokens)} out
                    </span>
                    <span className="flex items-center gap-1 text-xs text-dark-400">
                      <IndianRupee size={11} />
                      {formatINR(log.costINR)}
                    </span>
                    <span className="text-xs text-dark-300 ml-auto">{log.provider}/{log.model?.split('-').slice(-2).join('-')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Send message */}
        <div className="px-5 py-4 border-t border-dark-100 flex-shrink-0">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-dark-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder={`Send message to +${phone}…`}
              value={sendText}
              onChange={e => setSendText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={sending || !sendText.trim()}
              className="px-4 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Broadcast Modal ───────────────────────────────────────────────────────────
const MSG_TYPES = [
  { id: 'text',     label: 'Text',     icon: MessageSquare },
  { id: 'image',    label: 'Image',    icon: Image         },
  { id: 'video',    label: 'Video',    icon: Video         },
  { id: 'document', label: 'Document', icon: FileText      },
];

const ACCEPT = {
  image:    'image/*',
  video:    'video/*',
  document: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip',
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const BroadcastModal = ({ onClose, whitelist, botOnline }) => {
  const [type,    setType]    = useState('text');
  const [text,    setText]    = useState('');
  const [file,    setFile]    = useState(null);      // File object
  const [preview, setPreview] = useState(null);      // object URL for image/video
  const [sending, setSending] = useState(false);
  const [result,  setResult]  = useState(null);      // { sent, failed, results }
  const fileRef = useRef(null);

  const recipientCount = whitelist.length;

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (type === 'image' || type === 'video') {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
  };

  const handleTypeChange = (t) => {
    setType(t);
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSend = async () => {
    if (type === 'text' && !text.trim()) return toast.error('Enter a message');
    if (type !== 'text' && !file) return toast.error('Select a file to send');
    if (!recipientCount) return toast.error('No allowed users configured');

    setSending(true);
    setResult(null);
    try {
      const body = { type, text: text.trim() };

      if (file) {
        body.mediaBase64 = await fileToBase64(file);
        body.mimeType    = file.type;
        body.fileName    = file.name;
      }

      const r = await botFetch('/api/broadcast', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error || 'Broadcast failed'); return; }
      setResult(d);
      toast.success(`Sent to ${d.sent} of ${d.total} users`);
    } catch {
      toast.error('Bot server not reachable');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-dark-100 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Radio size={18} className="text-violet-600" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-dark-900">Broadcast Message</h2>
            <p className="text-xs text-dark-400">
              Send to {recipientCount} allowed {recipientCount === 1 ? 'user' : 'users'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-50 text-dark-400">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Recipient info */}
          {recipientCount === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle size={16} className="flex-shrink-0" />
              No allowed users configured. Add numbers in the Allowed Users tab first.
            </div>
          ) : (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-2 text-sm text-violet-700">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              Will be sent to <strong>{recipientCount}</strong> number{recipientCount > 1 ? 's' : ''} with 0.6s delay between each.
            </div>
          )}

          {/* Message type selector */}
          <div>
            <p className="text-xs font-medium text-dark-500 uppercase tracking-wider mb-2">Message Type</p>
            <div className="grid grid-cols-4 gap-2">
              {MSG_TYPES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => handleTypeChange(id)}
                  className={clsx(
                    'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all',
                    type === id
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-dark-100 text-dark-500 hover:border-dark-200 hover:bg-dark-50'
                  )}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* File picker (non-text types) */}
          {type !== 'text' && (
            <div>
              <p className="text-xs font-medium text-dark-500 uppercase tracking-wider mb-2">
                {type === 'image' ? 'Image' : type === 'video' ? 'Video' : 'Document'} File
              </p>
              <div
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors text-center',
                  file ? 'border-violet-300 bg-violet-50' : 'border-dark-200 hover:border-violet-300 hover:bg-violet-50/40'
                )}
              >
                {/* Preview */}
                {preview && type === 'image' && (
                  <img src={preview} alt="preview" className="max-h-40 mx-auto rounded-lg mb-3 object-contain" />
                )}
                {preview && type === 'video' && (
                  <video src={preview} className="max-h-40 mx-auto rounded-lg mb-3" controls />
                )}

                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-violet-700">
                    <CheckCircle2 size={16} />
                    <span className="font-medium truncate max-w-xs">{file.name}</span>
                    <span className="text-xs text-dark-400">({(file.size / 1024).toFixed(0)} KB)</span>
                  </div>
                ) : (
                  <div className="text-dark-400">
                    <Upload size={24} className="mx-auto mb-1.5 opacity-50" />
                    <p className="text-sm">Click to select {type}</p>
                    <p className="text-xs mt-0.5 opacity-60">
                      {type === 'image' ? 'JPG, PNG, GIF, WebP' : type === 'video' ? 'MP4, MOV, AVI' : 'PDF, DOC, XLS, TXT…'}
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT[type] || '*'}
                onChange={handleFile}
                className="hidden"
              />
            </div>
          )}

          {/* Text / caption */}
          <div>
            <p className="text-xs font-medium text-dark-500 uppercase tracking-wider mb-2">
              {type === 'text' ? 'Message' : 'Caption (optional)'}
            </p>
            <textarea
              className="w-full border border-dark-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={type === 'text' ? 4 : 2}
              placeholder={type === 'text' ? 'Type your message…' : 'Add a caption…'}
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-xl border border-dark-100 overflow-hidden">
              <div className="px-4 py-3 bg-dark-50 flex items-center gap-3 border-b border-dark-100">
                <CheckCheck size={16} className="text-green-600" />
                <p className="text-sm font-medium text-dark-900">
                  Sent {result.sent}/{result.total} &nbsp;·&nbsp;
                  <span className="text-red-600">{result.failed} failed</span>
                </p>
              </div>
              <div className="divide-y divide-dark-50 max-h-40 overflow-y-auto">
                {result.results.map((r) => (
                  <div key={r.phone} className="flex items-center gap-3 px-4 py-2 text-sm">
                    {r.success
                      ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      : <AlertCircle  size={14} className="text-red-500   flex-shrink-0" />}
                    <span className="text-dark-700">+91 {r.phone.slice(-10)}</span>
                    {!r.success && <span className="text-xs text-red-400 ml-auto truncate max-w-[180px]">{r.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-dark-100 flex items-center justify-between gap-3 flex-shrink-0 bg-white">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-dark-200 text-dark-600 hover:bg-dark-50 text-sm font-medium transition-colors">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleSend}
              disabled={sending || !botOnline || !recipientCount}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {sending ? (
                <><Loader2 size={16} className="animate-spin" /> Sending…</>
              ) : (
                <><Radio size={16} /> Send to {recipientCount} {recipientCount === 1 ? 'user' : 'users'}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Allowed Users panel ───────────────────────────────────────────────────────
const AllowedUsers = ({ botOnline }) => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await botFetch('/api/whitelist');
      if (r.ok) setList(await r.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const raw = input.replace(/\D/g, '');
    // Normalize: strip leading 91 if 12-digit Indian format → keep last 10
    const phone = raw.length === 12 && raw.startsWith('91') ? raw.slice(2) : raw.slice(-10);
    if (phone.length !== 10) return toast.error('Enter a valid 10-digit mobile number');
    setAdding(true);
    try {
      const r = await botFetch('/api/whitelist', { method: 'POST', body: JSON.stringify({ phone }) });
      if (r.ok) {
        toast.success(`+${phone} added to allowed list`);
        setInput('');
        load();
      } else {
        const d = await r.json();
        toast.error(d.error || 'Failed to add');
      }
    } catch { toast.error('Bot server not reachable'); }
    finally { setAdding(false); }
  };

  const handleRemove = async (phone) => {
    if (!confirm(`Remove +${phone} from allowed list?`)) return;
    setRemoving(phone);
    try {
      const r = await botFetch(`/api/whitelist/${phone}`, { method: 'DELETE' });
      if (r.ok) { toast.success('Number removed'); load(); }
      else toast.error('Failed to remove');
    } catch { toast.error('Bot server not reachable'); }
    finally { setRemoving(null); }
  };

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck size={20} className="text-violet-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-violet-800">Phone Number Whitelist</p>
          <p className="text-sm text-violet-600 mt-0.5">
            The AI will <strong>only reply</strong> to numbers in this list. Group messages are always ignored.
            {list.length === 0 && <span className="block mt-1 text-amber-600 font-medium">⚠️ No numbers added yet — the bot is currently replying to everyone.</span>}
          </p>
        </div>
      </div>

      {/* Add number */}
      <div className="bg-white rounded-2xl border border-dark-100 p-5">
        <h2 className="font-semibold text-dark-900 mb-4 flex items-center gap-2">
          <Plus size={17} className="text-violet-600" /> Add Allowed Number
        </h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border border-dark-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              placeholder="e.g. 9876543210  (10-digit mobile number)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              disabled={!botOnline}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim() || !botOnline}
            className="px-5 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Add
          </button>
        </div>
        {!botOnline && (
          <p className="text-xs text-amber-600 mt-2">Bot server offline — changes won't apply until reconnected.</p>
        )}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-dark-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
          <h2 className="font-semibold text-dark-900">Allowed Numbers</h2>
          <span className="text-xs text-dark-400">{list.length} {list.length === 1 ? 'number' : 'numbers'}</span>
        </div>
        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-violet-500" size={24} />
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-dark-400">
            <ShieldCheck size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No numbers added — bot replies to everyone</p>
          </div>
        ) : (
          <div className="divide-y divide-dark-50">
            {list.map((phone) => (
              <div key={phone} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Phone size={16} className="text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-dark-900">+91 {phone.slice(-10)}</p>
                  <p className="text-xs text-dark-400">AI replies enabled</p>
                </div>
                <button
                  onClick={() => handleRemove(phone)}
                  disabled={removing === phone}
                  className="p-2 rounded-lg hover:bg-red-50 text-dark-400 hover:text-red-600 transition-colors disabled:opacity-50"
                  title="Remove"
                >
                  {removing === phone ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Provider config ───────────────────────────────────────────────────────────
const PROVIDERS = [
  {
    id: 'auto',
    label: 'Auto',
    desc: 'Smart fallback chain: GPT → Gemini → DeepSeek → Claude',
    color: 'violet',
    icon: '⚡',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    desc: 'Best for text & tool use. No media support.',
    color: 'blue',
    icon: '🔵',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    desc: 'Best for images & voice. Full tool support.',
    color: 'green',
    icon: '🟢',
  },
  {
    id: 'claude',
    label: 'Claude',
    desc: 'Lightweight fallback. Token-limited per request.',
    color: 'orange',
    icon: '🟠',
  },
  {
    id: 'gpt',
    label: 'GPT',
    desc: 'gpt-5-nano for text & images, gpt-4o-audio-preview for voice.',
    color: 'pink',
    icon: '🩷',
  },
];

const providerColors = {
  violet: { card: 'border-violet-400 bg-violet-50', badge: 'bg-violet-100 text-violet-700', ring: 'ring-violet-400' },
  blue:   { card: 'border-blue-400   bg-blue-50',   badge: 'bg-blue-100   text-blue-700',   ring: 'ring-blue-400'   },
  green:  { card: 'border-green-400  bg-green-50',  badge: 'bg-green-100  text-green-700',  ring: 'ring-green-400'  },
  orange: { card: 'border-orange-400 bg-orange-50', badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-400' },
  pink:   { card: 'border-pink-400   bg-pink-50',   badge: 'bg-pink-100   text-pink-700',   ring: 'ring-pink-400'   },
};

// ── Model Selector ────────────────────────────────────────────────────────────
const ModelSelector = ({ currentProvider, onProviderChange, botOnline }) => {
  const [saving, setSaving]           = useState(false);
  const [gptModels, setGptModels]     = useState([]);
  const [currentGptModel, setCurrentGptModel] = useState('gpt-4.1-nano');
  const [gptModelSaving, setGptModelSaving]   = useState(false);

  useEffect(() => {
    botFetch('/api/gpt-model').then(r => r.json()).then(d => {
      if (d.models) setGptModels(d.models);
      if (d.model)  setCurrentGptModel(d.model);
    }).catch(() => {});
  }, [botOnline]);

  const handleGptModelChange = async (model) => {
    if (!botOnline || model === currentGptModel) return;
    setGptModelSaving(true);
    try {
      const r = await botFetch('/api/gpt-model', { method: 'POST', body: JSON.stringify({ model }) });
      if (r.ok) { setCurrentGptModel(model); toast.success(`GPT model → ${model}`); }
      else toast.error('Failed to change GPT model');
    } catch { toast.error('Bot server not reachable'); }
    finally { setGptModelSaving(false); }
  };

  const handleSelect = async (id) => {
    if (id === currentProvider || !botOnline) return;
    setSaving(true);
    try {
      const r = await botFetch('/api/provider', {
        method: 'POST',
        body: JSON.stringify({ provider: id }),
      });
      if (r.ok) {
        onProviderChange(id);
        toast.success(`AI model switched to ${PROVIDERS.find(p => p.id === id)?.label}`);
      } else {
        const d = await r.json();
        toast.error(d.error || 'Failed to switch model');
      }
    } catch {
      toast.error('Bot server not reachable');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-dark-100 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings2 size={18} className="text-violet-600" />
        <h2 className="font-semibold text-dark-900">AI Model Control</h2>
        {saving && <Loader2 size={14} className="animate-spin text-dark-400 ml-1" />}
        {!botOnline && (
          <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            Bot offline — changes won't apply
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {PROVIDERS.map((p) => {
          const isActive = currentProvider === p.id;
          const c = providerColors[p.color];
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              disabled={saving}
              className={clsx(
                'relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none',
                isActive
                  ? `${c.card} ${c.ring} ring-2`
                  : 'border-dark-100 bg-white hover:border-dark-200 hover:bg-dark-50/40',
                saving && 'opacity-60 cursor-not-allowed'
              )}
            >
              {isActive && (
                <span className={clsx('absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full', c.badge)}>
                  Active
                </span>
              )}
              <div className="text-2xl mb-2">{p.icon}</div>
              <p className={clsx('font-semibold text-sm', isActive ? 'text-dark-900' : 'text-dark-700')}>
                {p.label}
              </p>
              <p className="text-xs text-dark-400 mt-0.5 leading-snug">{p.desc}</p>
              {p.id === 'gpt' && gptModels.length > 0 && (
                <div
                  className="mt-3"
                  onClick={e => e.stopPropagation()}
                >
                  <label className="text-xs text-dark-500 font-medium block mb-1">Model</label>
                  <select
                    value={currentGptModel}
                    onChange={e => handleGptModelChange(e.target.value)}
                    disabled={gptModelSaving || !botOnline}
                    className="w-full text-xs border border-dark-200 rounded-lg px-2 py-1.5 bg-white text-dark-800 focus:outline-none focus:ring-1 focus:ring-pink-400 disabled:opacity-50"
                  >
                    {gptModels.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  {gptModelSaving && <p className="text-xs text-pink-500 mt-1">Saving…</p>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AIAgent() {
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [tab, setTab] = useState('overview'); // 'overview' | 'chats' | 'allowed'
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [whitelist, setWhitelist] = useState([]);
  const [currentProvider, setCurrentProvider] = useState('auto');

  const pollRef = useRef(null);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await botFetch('/api/status');
      if (r.ok) setStatus(await r.json());
      else setStatus(null);
    } catch { setStatus(null); }
  }, []);

  const fetchProvider = useCallback(async () => {
    try {
      const r = await botFetch('/api/provider');
      if (r.ok) { const d = await r.json(); setCurrentProvider(d.provider || 'auto'); }
    } catch { /* ignore */ }
  }, []);

  const fetchQr = useCallback(async () => {
    try {
      const r = await botFetch('/api/qr');
      if (r.ok) {
        const d = await r.json();
        setQr(d.qr || null);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const r = await botFetch('/api/analytics');
      if (r.ok) {
        const d = await r.json();
        setAnalytics(d);
        setUsers(d.users || []);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchWhitelist = useCallback(async () => {
    try {
      const r = await botFetch('/api/whitelist');
      if (r.ok) setWhitelist(await r.json());
    } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(() => {
    fetchStatus();
    fetchQr();
    fetchAnalytics();
    fetchProvider();
    fetchWhitelist();
  }, [fetchStatus, fetchQr, fetchAnalytics, fetchProvider, fetchWhitelist]);

  // Poll fast (1s) when waiting for QR or disconnected, slow (6s) when connected
  useEffect(() => {
    refresh();
    const tick = () => {
      const s = statusRef.current;
      const needsFast = !s || !s.connected;
      pollRef.current = setTimeout(async () => {
        await Promise.all([fetchStatus(), fetchQr()]);
        // Only fetch analytics at a slower rate
        tick();
      }, needsFast ? 1000 : 6000);
    };
    // Fetch analytics on a fixed 6s cadence separately
    const analyticsInterval = setInterval(fetchAnalytics, 6000);
    tick();
    return () => {
      clearTimeout(pollRef.current);
      clearInterval(analyticsInterval);
    };
  }, [refresh, fetchStatus, fetchQr, fetchAnalytics]);

  const handleLogout = async () => {
    if (!confirm('Log out WhatsApp? You will need to scan the QR code again.')) return;
    setLoadingLogout(true);
    try {
      const r = await botFetch('/api/logout', { method: 'POST' });
      const d = await r.json();
      if (r.ok) { toast.success(d.message || 'Logged out'); refresh(); }
      else toast.error(d.error || 'Logout failed');
    } finally {
      setLoadingLogout(false);
    }
  };

  const botOnline = !!status;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Bot size={22} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-dark-900">AI Agent</h1>
            <p className="text-sm text-dark-400">WhatsApp bot control & analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status ? <StatusBadge connected={status.connected} qrPending={status.qrPending} /> : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-dark-100 text-dark-500 text-sm">
              <Loader2 size={14} className="animate-spin" /> Connecting…
            </span>
          )}
          <button onClick={refresh} className="p-2 rounded-lg hover:bg-dark-50 text-dark-400 hover:text-dark-900 transition-colors" title="Refresh">
            <RefreshCw size={18} />
          </button>
          {status?.connected && (
            <button
              onClick={handleLogout}
              disabled={loadingLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loadingLogout ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── Bot offline notice ── */}
      {!botOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">Bot server not reachable</p>
            <p className="text-sm text-amber-600 mt-0.5">
              Make sure the bot is running: <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">cd whatsapp-mcp && npm run bot</code>
              &nbsp;(server at <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">{BOT_API}</code>)
            </p>
          </div>
        </div>
      )}

      {/* ── QR Code (when not connected) ── */}
      {botOnline && !status?.connected && (
        <div className="bg-white border border-dark-100 rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-amber-600">
            <QrCode size={20} />
            <h2 className="font-semibold">Scan QR Code to Connect WhatsApp</h2>
          </div>
          {qr ? (
            <>
              <img src={qr} alt="WhatsApp QR Code" className="w-64 h-64 rounded-xl border border-dark-100" />
              <p className="text-sm text-dark-500 text-center max-w-xs">
                Open <strong>WhatsApp</strong> on your phone → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan this QR code
              </p>
              <p className="text-xs text-dark-400">QR refreshes automatically every second</p>
            </>
          ) : (
            <div className="w-64 h-64 flex items-center justify-center bg-dark-50 rounded-xl border border-dark-100">
              <div className="text-center text-dark-400">
                <Loader2 size={32} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Waiting for QR code…</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Connected status ── */}
      {status?.connected && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
          <div>
            <p className="font-medium text-green-800">WhatsApp Connected</p>
            <p className="text-sm text-green-600">Active number: <strong>{status.phoneNumber}</strong></p>
          </div>
          <div className="ml-auto text-sm text-green-600 flex items-center gap-1.5">
            <Sparkles size={14} />
            AI: <strong className="capitalize">{currentProvider}</strong>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-dark-50 rounded-xl p-1 w-fit">
        {[['overview', TrendingUp, 'Overview'], ['chats', MessageSquare, 'Chat Logs'], ['allowed', ShieldCheck, 'Allowed Users']].map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === key ? 'bg-white text-dark-900 shadow-sm' : 'text-dark-500 hover:text-dark-900'
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Model selector */}
          <ModelSelector
            currentProvider={currentProvider}
            onProviderChange={setCurrentProvider}
            botOnline={botOnline}
          />

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={Users}       color="violet" label="Total Users"    value={formatNumber(analytics?.totalUsers)}   sub="unique WhatsApp numbers" />
            <StatCard icon={MessageSquare} color="blue" label="AI Exchanges"   value={formatNumber(analytics?.totalMessages)} sub="total conversations" />
            <StatCard icon={Zap}         color="orange" label="Total Tokens"   value={formatNumber((analytics?.totalInputTokens || 0) + (analytics?.totalOutputTokens || 0))} sub={`${formatNumber(analytics?.totalInputTokens)} in / ${formatNumber(analytics?.totalOutputTokens)} out`} />
            <StatCard icon={IndianRupee} color="green"  label="Total Cost"     value={formatINR(analytics?.totalCostINR)}    sub="across all conversations" />
          </div>

          {/* Per-user cost table */}
          <div className="bg-white rounded-2xl border border-dark-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between">
              <h2 className="font-semibold text-dark-900">User Cost Breakdown</h2>
              <span className="text-xs text-dark-400">{users.length} users</span>
            </div>
            {users.length === 0 ? (
              <div className="py-12 text-center text-dark-400">
                <Coins size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No data yet — start the bot and receive messages</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-dark-50 text-dark-500 text-xs uppercase tracking-wider">
                      <th className="px-5 py-3 text-left font-medium">Phone</th>
                      <th className="px-5 py-3 text-right font-medium">Messages</th>
                      <th className="px-5 py-3 text-right font-medium">Input tokens</th>
                      <th className="px-5 py-3 text-right font-medium">Output tokens</th>
                      <th className="px-5 py-3 text-right font-medium">Cost (INR)</th>
                      <th className="px-5 py-3 text-right font-medium">Last active</th>
                      <th className="px-5 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-50">
                    {users.map((u) => (
                      <tr key={u.phone} className="hover:bg-dark-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-dark-900">+{u.phone}</td>
                        <td className="px-5 py-3.5 text-right text-dark-600">{u.messageCount}</td>
                        <td className="px-5 py-3.5 text-right text-dark-500">{formatNumber(u.totalInputTokens)}</td>
                        <td className="px-5 py-3.5 text-right text-dark-500">{formatNumber(u.totalOutputTokens)}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-green-700">{formatINR(u.totalCostINR)}</td>
                        <td className="px-5 py-3.5 text-right text-dark-400 text-xs">{timeAgo(u.lastMessage)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => { setSelectedPhone(u.phone); setTab('chats'); }}
                            className="text-violet-600 hover:text-violet-800 flex items-center gap-1 ml-auto text-xs font-medium"
                          >
                            View <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Chat Logs tab ── */}
      {tab === 'chats' && (
        <div className="bg-white rounded-2xl border border-dark-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-dark-900">Chat Logs</h2>
              <p className="text-xs text-dark-400 mt-0.5">Click a user to view their full conversation with token + cost breakdown</p>
            </div>
            <button
              onClick={() => setShowBroadcast(true)}
              disabled={!botOnline}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 text-sm font-medium transition-colors flex-shrink-0"
            >
              <Radio size={15} /> Broadcast
            </button>
          </div>
          {users.length === 0 ? (
            <div className="py-12 text-center text-dark-400">
              <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No chat logs yet</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-50">
              {users.map((u) => (
                <button
                  key={u.phone}
                  onClick={() => setSelectedPhone(u.phone)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-dark-50/60 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 text-violet-700 font-bold text-sm">
                    {u.phone.slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark-900">+{u.phone}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-dark-400 flex items-center gap-1">
                        <MessageSquare size={11} /> {u.messageCount} messages
                      </span>
                      <span className="text-xs text-dark-400 flex items-center gap-1">
                        <Zap size={11} /> {formatNumber(u.totalInputTokens + u.totalOutputTokens)} tokens
                      </span>
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <IndianRupee size={11} /> {formatINR(u.totalCostINR)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-dark-400">{timeAgo(u.lastMessage)}</span>
                    <ChevronRight size={16} className="text-dark-300" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Allowed Users tab ── */}
      {tab === 'allowed' && <AllowedUsers botOnline={botOnline} />}

      {/* ── Broadcast modal ── */}
      {showBroadcast && (
        <BroadcastModal
          onClose={() => setShowBroadcast(false)}
          whitelist={whitelist}
          botOnline={botOnline}
        />
      )}

      {/* ── Chat drawer ── */}
      {selectedPhone && (
        <ChatDrawer
          phone={selectedPhone}
          onClose={() => setSelectedPhone(null)}
          onSend={refresh}
        />
      )}
    </div>
  );
}
