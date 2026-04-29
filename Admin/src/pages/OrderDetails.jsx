import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { ordersAPI, productsAPI } from '../services/api';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    assigned: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    processing: 'bg-blue-100 text-blue-800 border-blue-200',
    shipped: 'bg-violet-100 text-violet-800 border-violet-200',
    delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };
  return colors[String(status || '').toLowerCase()] || 'bg-dark-100 text-dark-800 border-dark-200';
};

const OrderDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [products, setProducts] = useState([]);

  const [productionIdentifier, setProductionIdentifier] = useState('');
  const [assigningProduction, setAssigningProduction] = useState(false);

  const isFetchingRef = useRef(false);

  const fetchDetails = async () => {
    if (!id) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setLoading(true);
      const [orderRes, productsRes] = await Promise.all([
        ordersAPI.get(id),
        productsAPI.list({ page: 1, page_size: 100 }),
      ]);

      const orderData = orderRes?.data || null;
      setOrder(orderData);
      setProductionIdentifier(String(orderData?.production_identifier || ''));

      const productsData = productsRes?.data?.data || [];
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (error) {
      toast.error('Failed to load order details');
      console.error(error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const productNameById = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (p?.id) map.set(String(p.id), p?.name || '');
    }
    return map;
  }, [products]);

  const items = useMemo(() => {
    const list = Array.isArray(order?.items) ? order.items : [];
    return list.map((item) => {
      const name =
        item?.product_name ||
        productNameById.get(String(item?.product_id || '')) ||
        'Unknown Product';
      const qty = Number(item?.quantity || 0);
      const price = Number(item?.price || 0);
      const lineTotal = Number(item?.subtotal ?? price * qty);
      return {
        ...item,
        _name: name,
        _qty: qty,
        _price: price,
        _lineTotal: lineTotal,
      };
    });
  }, [order?.items, productNameById]);

  const isProductionAssigned = Boolean(order?.production_identifier);

  const assignToProduction = async () => {
    const identifier = productionIdentifier.trim().toLowerCase();
    if (!identifier) {
      toast.error('Enter production email / identifier');
      return;
    }

    if (!order?.id) {
      toast.error('Order not loaded');
      return;
    }

    try {
      setAssigningProduction(true);
      const res = await ordersAPI.update(order.id, { production_identifier: identifier });
      toast.success(isProductionAssigned ? 'Order transferred to another production' : 'Order assigned to production');
      setOrder(res?.data || order);
    } catch (error) {
      toast.error(isProductionAssigned ? 'Failed to transfer order' : 'Failed to assign order');
      console.error(error);
    } finally {
      setAssigningProduction(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary flex items-center gap-2" onClick={() => navigate('/orders')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6 text-dark-600">Order not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={() => navigate('/orders')}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div>
            <h1 className="text-3xl font-bold font-heading text-dark-900">Order #{order.order_number || order.id}</h1>
            <p className="text-dark-500 mt-1">Created: {formatDateTime(order.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={clsx(
              'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border',
              getStatusColor(order.status)
            )}
          >
            {String(order.status || 'pending').toUpperCase()}
          </span>

          <button onClick={fetchDetails} className="btn-secondary flex items-center gap-2" type="button">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6">
          <h2 className="text-sm font-semibold text-dark-900 uppercase tracking-wider mb-4">Customer details</h2>
          <div className="space-y-2 text-sm">
            <div className="text-dark-900 font-medium">{order.customer_name || '-'}</div>
            <div className="text-dark-600">{order.customer_email || '-'}</div>
            <div className="text-dark-600">{order.customer_phone || '-'}</div>
            <div className="text-dark-600">{order.customer_identifier || '-'}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6">
          <h2 className="text-sm font-semibold text-dark-900 uppercase tracking-wider mb-4">Delivery info</h2>
          <div className="space-y-2 text-sm">
            <div className="text-dark-700 whitespace-pre-wrap">{order.shipping_address || '-'}</div>
            {order.billing_address ? (
              <div className="text-dark-500 whitespace-pre-wrap">Billing: {order.billing_address}</div>
            ) : null}
            {order.delivery_datetime ? (
              <div className="flex items-center gap-1.5 text-dark-600 mt-1">
                <span className="text-xs font-medium text-dark-500">Preferred delivery:</span>
                <span>{order.delivery_datetime}</span>
              </div>
            ) : null}
            {order.source === 'whatsapp' && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Order via WhatsApp
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6">
        <h2 className="text-sm font-semibold text-dark-900 uppercase tracking-wider mb-4">Production assignment</h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="label">Production identifier (email/phone)</label>
            <input
              className="input-field"
              value={productionIdentifier}
              onChange={(e) => setProductionIdentifier(e.target.value)}
              placeholder="ananth@gmail.com"
            />
            <p className="text-xs text-dark-500 mt-1">
              {order?.production_identifier
                ? `Currently assigned to: ${order.production_identifier}`
                : 'Not assigned yet'}
              {order?.production_assigned_at ? ` • Assigned: ${formatDateTime(order.production_assigned_at)}` : ''}
            </p>
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={assignToProduction}
            disabled={assigningProduction}
          >
            {assigningProduction
              ? isProductionAssigned
                ? 'Transferring…'
                : 'Assigning…'
              : isProductionAssigned
                ? 'Transfer to another production'
                : 'Assign to production'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <h2 className="text-sm font-semibold text-dark-900 uppercase tracking-wider">Order items</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Item</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Qty</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100 bg-white">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-dark-500">No items.</td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 text-sm font-medium text-dark-900">{item._name}</td>
                    <td className="px-6 py-4 text-sm text-dark-600 text-right">₹{Number(item._price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-dark-600 text-right">{item._qty}</td>
                    <td className="px-6 py-4 text-sm font-medium text-dark-900 text-right">₹{Number(item._lineTotal || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-dark-50 font-medium">
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-dark-600">Subtotal</td>
                <td className="px-6 py-3 text-right text-dark-900">₹{Number(order.subtotal || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-dark-600">Tax</td>
                <td className="px-6 py-3 text-right text-dark-900">₹{Number(order.tax || 0).toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-dark-600">Shipping</td>
                <td className="px-6 py-3 text-right text-dark-900">₹{Number(order.shipping_cost || 0).toFixed(2)}</td>
              </tr>
              <tr className="border-t border-dark-200">
                <td colSpan={3} className="px-6 py-4 text-right text-lg font-bold text-dark-900">Total</td>
                <td className="px-6 py-4 text-right text-lg font-bold text-violet-600">₹{Number(order.total || 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OrderDetails;
