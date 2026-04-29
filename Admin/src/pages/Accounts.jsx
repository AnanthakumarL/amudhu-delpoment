import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, IndianRupee, Percent, RefreshCw, ShoppingCart } from 'lucide-react';
import { ordersAPI, siteConfigAPI } from '../services/api';

const parseNotesParams = (notes) => {
  const raw = String(notes || '').trim();
  if (!raw) return {};

  const params = {};
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    params[key] = value;
  }

  return params;
};

const normalizePaymentStatus = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (['paid', 'success', 'succeeded', 'received'].includes(raw)) return 'paid';
  if (['partial', 'partial_paid', 'partial-paid', 'partially_paid', 'partially-paid'].includes(raw)) return 'partial';
  if (['unpaid', 'pending', 'due', 'not_paid', 'not-paid'].includes(raw)) return 'unpaid';
  return null;
};

const readAmountPaid = (params) => {
  if (!params) return null;
  const candidates = [
    params.amount_paid,
    params.paid_amount,
    params.amountpaid,
    params.paidamount,
  ];
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const derivePaymentStatus = (order) => {
  const status = String(order?.status || '').trim().toLowerCase();
  const total = Number(order?.total || 0);

  const params = parseNotesParams(order?.notes);
  const paymentMethod = String(params.payment_method || '').trim().toLowerCase();
  const statusFromNotes = normalizePaymentStatus(params.payment_status);
  const amountPaid = readAmountPaid(params);

  if (amountPaid !== null) {
    if (amountPaid >= total) return { paymentStatus: 'paid', paymentMethod, amountPaid };
    if (amountPaid > 0) return { paymentStatus: 'partial', paymentMethod, amountPaid };
    return { paymentStatus: 'unpaid', paymentMethod, amountPaid };
  }

  if (statusFromNotes) {
    return {
      paymentStatus: statusFromNotes,
      paymentMethod,
      amountPaid: statusFromNotes === 'paid' ? total : 0,
    };
  }

  // Fallback: once delivered, treat as paid (COD and many manual orders).
  if (status === 'delivered') {
    return { paymentStatus: 'paid', paymentMethod, amountPaid: total };
  }

  return { paymentStatus: 'unpaid', paymentMethod, amountPaid: 0 };
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const safeToNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (symbol, value) => {
  const n = safeToNumber(value);
  return `${symbol}${n.toFixed(2)}`;
};

const formatPaymentStatusLabel = (value) => {
  const s = String(value || '').toLowerCase();
  if (s === 'paid') return 'Paid';
  if (s === 'unpaid') return 'Unpaid';
  if (s === 'partial') return 'Partial Paid';
  return '-';
};

const Accounts = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ currency_symbol: '₹', tax_rate: 18 });
  const isFetchingRef = useRef(false);

  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setLoading(true);
      const configRes = await siteConfigAPI.get();
      const nextConfig = {
        currency_symbol: configRes?.data?.currency_symbol || '₹',
        tax_rate: safeToNumber(configRes?.data?.tax_rate) || 18,
      };
      setConfig(nextConfig);

      const pageSize = 100;
      const first = await ordersAPI.list({ page: 1, page_size: pageSize });
      const firstPage = first?.data;
      const firstOrders = Array.isArray(firstPage?.data) ? firstPage.data : [];
      const totalPages = safeToNumber(firstPage?.total_pages) || 1;

      const all = [...firstOrders];
      for (let page = 2; page <= totalPages; page += 1) {
        const res = await ordersAPI.list({ page, page_size: pageSize });
        const pageData = res?.data;
        const pageOrders = Array.isArray(pageData?.data) ? pageData.data : [];
        all.push(...pageOrders);
      }

      setOrders(all);
    } catch (error) {
      toast.error('Failed to load finance data');
      console.error(error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const rows = useMemo(() => {
    const taxRate = safeToNumber(config.tax_rate) || 18;

    return (Array.isArray(orders) ? orders : []).map((o) => {
      const orderStatus = String(o.status || '').trim().toLowerCase();
      const isCancelled = orderStatus === 'cancelled';
      const subtotal = safeToNumber(o.subtotal);
      const taxFromOrder = safeToNumber(o.tax);
      const tax = taxFromOrder > 0 ? taxFromOrder : subtotal * (taxRate / 100);
      const total = safeToNumber(o.total);
      const payment = derivePaymentStatus({ ...o, total });
      const dueAmount = Math.max(0, total - safeToNumber(payment.amountPaid));

      return {
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        status: o.status,
        created_at: o.created_at,
        subtotal,
        tax,
        total,
        payment_status: payment.paymentStatus,
        payment_method: payment.paymentMethod,
        amount_paid: safeToNumber(payment.amountPaid),
        due_amount: isCancelled ? 0 : payment.paymentStatus === 'paid' ? 0 : dueAmount,
      };
    });
  }, [orders, config.tax_rate]);

  const summary = useMemo(() => {
    const rowsExcludingCancelled = rows.filter((r) => String(r.status || '').toLowerCase() !== 'cancelled');
    const paidCount = rowsExcludingCancelled.filter((r) => r.payment_status === 'paid').length;
    const unpaidCount = rowsExcludingCancelled.filter((r) => r.payment_status === 'unpaid').length;
    const partialCount = rowsExcludingCancelled.filter((r) => r.payment_status === 'partial').length;
    const dueAmount = rowsExcludingCancelled.reduce((acc, r) => acc + safeToNumber(r.due_amount), 0);
    const gstTotal = rowsExcludingCancelled.reduce((acc, r) => acc + r.tax, 0);
    const totalOrders = rows.length;
    return { totalOrders, paidCount, unpaidCount, partialCount, dueAmount, gstTotal };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Accounts</h1>
          <p className="text-dark-500 mt-1">Finance dashboard: paid / unpaid / partial payments and GST per order.</p>
        </div>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-2" type="button">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-dark-500">Total Orders</p>
              <p className="text-2xl font-bold text-dark-900 mt-2">{summary.totalOrders}</p>
            </div>
            <div className="bg-violet-50 text-violet-700 p-3 rounded-xl">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-dark-500">Paid Orders</p>
              <p className="text-2xl font-bold text-dark-900 mt-2">{summary.paidCount}</p>
              <p className="text-xs text-dark-500 mt-2">
                Unpaid: {summary.unpaidCount} • Partial Paid: {summary.partialCount}
              </p>
            </div>
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-dark-500">Due Amount (Unpaid + Partial)</p>
              <p className="text-2xl font-bold text-dark-900 mt-2">{formatMoney(config.currency_symbol, summary.dueAmount)}</p>
            </div>
            <div className="bg-amber-50 text-amber-700 p-3 rounded-xl">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-dark-500">GST Total ({safeToNumber(config.tax_rate) || 18}%)</p>
              <p className="text-2xl font-bold text-dark-900 mt-2">{formatMoney(config.currency_symbol, summary.gstTotal)}</p>
            </div>
            <div className="bg-blue-50 text-blue-700 p-3 rounded-xl">
              <Percent className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Order</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Subtotal</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">GST</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Payment Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-dark-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                        <ShoppingCart className="w-8 h-8 text-dark-300" />
                      </div>
                      <p className="text-lg font-medium text-dark-900">No orders found</p>
                      <p className="text-sm mt-1">Orders will appear here once created.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  return (
                    <tr key={row.id || row.order_number} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-dark-900">{row.order_number || row.id || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{row.customer_name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{row.status || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatMoney(config.currency_symbol, row.subtotal)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatMoney(config.currency_symbol, row.tax)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-900 font-medium">{formatMoney(config.currency_symbol, row.total)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={row.payment_status === 'paid'
                            ? 'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100'
                            : row.payment_status === 'partial'
                              ? 'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-violet-50 text-violet-700 border-violet-100'
                              : 'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-amber-50 text-amber-700 border-amber-100'
                          }
                        >
                          {formatPaymentStatusLabel(row.payment_status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatDateTime(row.created_at)}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Accounts;
