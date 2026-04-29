import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { ordersAPI, productsAPI } from '../services/api';
import { Plus, Edit2, Eye, X, Package, Trash2, Search, Filter, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

const Orders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordersRes, productsRes] = await Promise.all([
        ordersAPI.list(),
        productsAPI.list(),
      ]);
      setOrders(ordersRes.data.data || []);
      setProducts(productsRes.data.data || []);
    } catch (error) {
      toast.error('Failed to load data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (order = null) => {
    setEditingOrder(order);
    if (order) {
      reset({
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone,
        shipping_address: order.shipping_address,
        billing_address: order.billing_address,
        status: order.status,
      });
      setOrderItems(order.items || []);
    } else {
      reset({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        shipping_address: '',
        billing_address: '',
        status: 'pending',
      });
      setOrderItems([]);
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingOrder(null);
    setOrderItems([]);
    reset();
  };

  const addOrderItem = () => {
    setOrderItems([...orderItems, { product_id: '', quantity: 1, price: 0 }]);
  };

  const removeOrderItem = (index) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const updateOrderItem = (index, field, value) => {
    const newItems = [...orderItems];
    newItems[index][field] = value;

    // Auto-fill price when product is selected
    if (field === 'product_id') {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].price = product.price;
      }
    }

    setOrderItems(newItems);
  };

  const calculateTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.1; // 10% tax
    const shipping = 10; // Flat shipping
    const total = subtotal + tax + shipping;
    return { subtotal, tax, shipping, total };
  };

  const onSubmit = async (data) => {
    if (orderItems.length === 0) {
      toast.error('Please add at least one item to the order');
      return;
    }

    try {
      const { subtotal, tax, shipping, total } = calculateTotals();

      const orderData = {
        ...data,
        items: orderItems,
        subtotal,
        tax,
        shipping_cost: shipping,
        total,
      };

      if (editingOrder) {
        await ordersAPI.update(editingOrder.id, orderData);
        toast.success('Order updated successfully!');
      } else {
        await ordersAPI.create(orderData);
        toast.success('Order created successfully!');
      }
      closeModal();
      fetchData();
    } catch (error) {
      toast.error('Failed to save order');
      console.error(error);
    }
  };

  const parseBackendDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    let s = String(value).trim();
    if (!s) return null;

    // Normalize ISO strings that are UTC but missing timezone (FastAPI often sends `YYYY-MM-DDTHH:mm:ss.ffffff`)
    // and clamp fractional seconds to milliseconds for consistent browser parsing.
    const m = s.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
    );
    if (m) {
      const base = m[1];
      let fraction = m[2] || '';
      const tz = m[3] || 'Z';
      if (fraction) {
        // Keep only 3 digits after the dot
        const digits = fraction.slice(1).padEnd(3, '0').slice(0, 3);
        fraction = `.${digits}`;
      }
      s = `${base}${fraction}${tz}`;
    }

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatOrderReceivedAt = (value) => {
    const d = parseBackendDate(value);
    if (!d) return '-';
    return d.toLocaleString();
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
    return colors[status] || 'bg-dark-100 text-dark-800 border-dark-200';
  };

  const getProductionStatusColor = (status) => {
    const colors = {
      order_received: 'bg-blue-50 text-blue-700 border-blue-100',
      started: 'bg-amber-50 text-amber-700 border-amber-100',
      in_progress: 'bg-violet-50 text-violet-700 border-violet-100',
      ready_to_dispatch: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    };
    return colors[String(status || '').toLowerCase()] || 'bg-dark-100 text-dark-600 border-dark-200';
  };

  const formatProductionStatus = (status) => {
    if (!status) return '-';
    return String(status).replace(/_/g, ' ');
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : 'Unknown Product';
  };

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
          <h1 className="text-3xl font-bold font-heading text-dark-900">Orders</h1>
          <p className="text-dark-500 mt-1">Track and manage customer orders</p>
        </div>
        <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Create Order</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Order #</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Items</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Production Status</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center text-dark-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                        <Package className="w-8 h-8 text-dark-300" />
                      </div>
                      <p className="text-lg font-medium text-dark-900">No orders yet</p>
                      <p className="text-sm mt-1">Orders will appear here once customers start buying.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-dark-50/50 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-violet-700 font-mono">#{order.order_number}</div>
                        {order.source === 'whatsapp' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            WhatsApp
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-dark-400">{formatOrderReceivedAt(order.created_at)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-dark-900">{order.customer_name}</div>
                      <div className="text-sm text-dark-500">{order.customer_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-dark-600">{order.items?.length || 0} items</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-dark-900">₹{order.total.toFixed(2)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border",
                        getStatusColor(order.status)
                      )}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={clsx(
                          'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border',
                          getProductionStatusColor(order.production_status)
                        )}
                      >
                        {formatProductionStatus(order.production_status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/orders/${order.id || order._id}`)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openModal(order)}
                          className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                          title="Edit Status"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-dark-900/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-between items-center p-6 border-b border-dark-100">
                <h2 className="text-xl font-bold font-heading text-dark-900">
                  {editingOrder ? 'Edit Order' : 'Create Order'}
                </h2>
                <button onClick={closeModal} className="p-2 text-dark-400 hover:text-dark-600 hover:bg-dark-50 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form id="order-form" onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  {/* Customer Information */}
                  <div>
                    <h3 className="text-lg font-bold text-dark-900 mb-4 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs">1</span>
                      Customer Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label">Full Name</label>
                        <input
                          type="text"
                          {...register('customer_name', { required: 'Name is required' })}
                          className="input-field"
                        />
                        {errors.customer_name && <p className="text-red-500 text-sm mt-1">{errors.customer_name.message}</p>}
                      </div>
                      <div>
                        <label className="label">Email Address</label>
                        <input
                          type="email"
                          {...register('customer_email', { required: 'Email is required' })}
                          className="input-field"
                        />
                        {errors.customer_email && <p className="text-red-500 text-sm mt-1">{errors.customer_email.message}</p>}
                      </div>
                      <div>
                        <label className="label">Phone Number</label>
                        <input
                          type="tel"
                          {...register('customer_phone')}
                          className="input-field"
                        />
                      </div>
                      <div>
                        <label className="label">Order Status</label>
                        <select {...register('status')} className="input-field">
                          <option value="pending">Pending</option>
                          <option value="assigned">Assigned</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="label">Shipping Address</label>
                        <textarea
                          {...register('shipping_address', { required: 'Address is required' })}
                          className="input-field"
                          rows="2"
                        />
                        {errors.shipping_address && <p className="text-red-500 text-sm mt-1">{errors.shipping_address.message}</p>}
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-dark-900 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs">2</span>
                        Order Items
                      </h3>
                      <button type="button" onClick={addOrderItem} className="btn-secondary text-sm py-1.5">
                        <Plus className="w-4 h-4 mr-1" /> Add Item
                      </button>
                    </div>

                    <div className="space-y-3 bg-dark-50 p-4 rounded-xl border border-dark-100">
                      {orderItems.length === 0 && (
                        <p className="text-center text-dark-400 py-4 text-sm">No items added to this order yet.</p>
                      )}
                      {orderItems.map((item, index) => (
                        <div key={index} className="flex gap-3 items-start p-3 bg-white rounded-lg border border-dark-200 shadow-sm animate-fade-in">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-dark-500 mb-1 block">Product</label>
                            <select
                              value={item.product_id}
                              onChange={(e) => updateOrderItem(index, 'product_id', e.target.value)}
                              className="input-field py-1.5 text-sm"
                            >
                              <option value="">Select Product</option>
                              {products.map(product => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="w-24">
                            <label className="text-xs font-medium text-dark-500 mb-1 block">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateOrderItem(index, 'quantity', parseInt(e.target.value))}
                              min="1"
                              className="input-field py-1.5 text-sm"
                            />
                          </div>
                          <div className="w-32">
                            <label className="text-xs font-medium text-dark-500 mb-1 block">Price</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1.5 text-dark-400 text-sm">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.price}
                                onChange={(e) => updateOrderItem(index, 'price', parseFloat(e.target.value))}
                                className="input-field py-1.5 pl-6 text-sm"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeOrderItem(index)}
                            className="mt-6 text-dark-400 hover:text-red-600 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Summary */}
                  {orderItems.length > 0 && (
                    <div className="bg-white border border-dark-200 p-6 rounded-xl shadow-sm">
                      <h3 className="text-lg font-bold text-dark-900 mb-4">Summary</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between text-dark-600">
                          <span>Subtotal</span>
                          <span className="font-medium text-dark-900">₹{calculateTotals().subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-dark-600">
                          <span>Tax (10%)</span>
                          <span className="font-medium text-dark-900">₹{calculateTotals().tax.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-dark-600">
                          <span>Shipping</span>
                          <span className="font-medium text-dark-900">₹{calculateTotals().shipping.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold text-dark-900 pt-3 border-t border-dark-100">
                          <span>Total</span>
                          <div className="text-violet-600">₹{calculateTotals().total.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </form>
              </div>

              <div className="p-6 border-t border-dark-100 bg-dark-50/50 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" form="order-form" className="btn-primary">
                  {editingOrder ? 'Update Order' : 'Create Order'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default Orders;
