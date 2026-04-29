import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList, Eye, Users, Plus, X, Edit2, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { ordersAPI, productionUsersAPI } from '../services/api';

const getOrderStatusColor = (status) => {
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

const getProductionStatusColor = (status) => {
  const colors = {
    order_received: 'bg-blue-50 text-blue-700 border-blue-100',
    started: 'bg-amber-50 text-amber-700 border-amber-100',
    in_progress: 'bg-violet-50 text-violet-700 border-violet-100',
    ready_to_dispatch: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };
  return colors[String(status || '').toLowerCase()] || 'bg-dark-100 text-dark-600 border-dark-200';
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};

const ProductionManagement = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('reports');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingLogin, setViewingLogin] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLogin, setEditingLogin] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    production_address: 'Main Production Unit',
    password: '',
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    identifier: '',
    production_address: 'Main Production Unit',
    is_active: true,
  });

  const fetchItems = async () => {
    try {
      setLoading(true);
      const [ordersRes, usersRes] = await Promise.all([
        ordersAPI.list({ page: 1, page_size: 100, production_assigned: true }),
        productionUsersAPI.list({ page: 1, page_size: 100 }),
      ]);

      setItems(ordersRes?.data?.data || []);
      setLogins(usersRes?.data?.data || []);
    } catch (error) {
      toast.error('Failed to load production data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      identifier: '',
      production_address: 'Main Production Unit',
      password: '',
    });
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setFormData({
      name: '',
      identifier: '',
      production_address: 'Main Production Unit',
      password: '',
    });
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const openViewLogin = (login) => {
    setViewingLogin(login || null);
    setShowViewModal(true);
  };

  const closeViewLogin = () => {
    setShowViewModal(false);
    setViewingLogin(null);
  };

  const openEditLogin = (login) => {
    setEditingLogin(login || null);
    setEditFormData({
      name: String(login?.name || ''),
      identifier: String(login?.identifier || ''),
      production_address: String(login?.production_address || 'Main Production Unit'),
      is_active: Boolean(login?.is_active ?? true),
    });
    setShowEditModal(true);
  };

  const closeEditLogin = () => {
    setShowEditModal(false);
    setEditingLogin(null);
    setEditFormData({
      name: '',
      identifier: '',
      production_address: 'Main Production Unit',
      is_active: true,
    });
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (!editingLogin?.id) {
      toast.error('Production login not loaded');
      return;
    }

    const trimmedName = String(editFormData.name || '').trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }

    const trimmedIdentifier = String(editFormData.identifier || '').trim().toLowerCase();
    if (!trimmedIdentifier) {
      toast.error('Identifier is required');
      return;
    }

    const trimmedAddress = String(editFormData.production_address || '').trim();
    if (!trimmedAddress) {
      toast.error('Production address is required');
      return;
    }

    try {
      setEditSubmitting(true);
      await productionUsersAPI.update(editingLogin.id, {
        name: trimmedName,
        identifier: trimmedIdentifier,
        production_address: trimmedAddress,
        is_active: Boolean(editFormData.is_active),
      });
      toast.success('Production login updated');
      closeEditLogin();
      await fetchItems();
    } catch (error) {
      const message = error?.response?.data?.detail || 'Failed to update production login';
      toast.error(message);
      console.error(error);
    } finally {
      setEditSubmitting(false);
    }
  };

  const deleteLogin = async (login) => {
    if (!login?.id) {
      toast.error('Production login not loaded');
      return;
    }

    const label = login?.name || login?.identifier || 'this login';
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete ${label}?`)) return;

    try {
      setDeletingId(login.id);
      await productionUsersAPI.delete(login.id);
      toast.success('Production login deleted');
      await fetchItems();
    } catch (error) {
      const message = error?.response?.data?.detail || 'Failed to delete production login';
      toast.error(message);
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedName = String(formData.name || '').trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }

    const trimmedIdentifier = String(formData.identifier || '').trim().toLowerCase();
    if (!trimmedIdentifier) {
      toast.error('Identifier is required');
      return;
    }

    const trimmedAddress = String(formData.production_address || '').trim();
    if (!trimmedAddress) {
      toast.error('Production address is required');
      return;
    }

    const password = String(formData.password || '').trim();
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      setSubmitting(true);
      await productionUsersAPI.create({
        name: trimmedName,
        identifier: trimmedIdentifier,
        production_address: trimmedAddress,
        password: password,
        is_active: true,
      });
      toast.success('Production login created successfully');
      closeCreateModal();
      await fetchItems();
    } catch (error) {
      const message = error?.response?.data?.detail || 'Failed to create production login';
      toast.error(message);
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const rows = useMemo(() => {
    return Array.isArray(items) ? items : [];
  }, [items]);

  const loginRows = useMemo(() => {
    return (Array.isArray(logins) ? logins : []).map((u) => ({
      id: u.id,
      name: u.name,
      identifier: u.identifier,
      production_address: u.production_address,
      is_active: Boolean(u.is_active),
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
  }, [logins]);

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
          <h1 className="text-3xl font-bold font-heading text-dark-900">Production Management</h1>
          <p className="text-dark-500 mt-1">
            {activeSection === 'logins'
              ? 'Production portal login users.'
              : 'Orders assigned to production.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="inline-flex rounded-xl border border-dark-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveSection('reports')}
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2',
                activeSection === 'reports'
                  ? 'bg-violet-600 text-white'
                  : 'text-dark-700 hover:bg-dark-50'
              )}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Production Reports</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('logins')}
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2',
                activeSection === 'logins'
                  ? 'bg-violet-600 text-white'
                  : 'text-dark-700 hover:bg-dark-50'
              )}
            >
              <Users className="w-4 h-4" />
              <span>Production Logins</span>
            </button>
          </div>

          {activeSection === 'logins' && (
            <button
              onClick={openCreateModal}
              className="btn-primary flex items-center justify-center gap-2"
              type="button"
            >
              <Plus className="w-4 h-4" />
              <span>Create Production Login</span>
            </button>
          )}
        </div>
      </div>

      {activeSection === 'logins' ? (
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-dark-100">
            <div className="text-sm font-semibold text-dark-900">Production Logins</div>
            <div className="text-xs text-dark-500 mt-1">Logins used to access the Production portal.</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dark-100">
              <thead className="bg-dark-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Identifier</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Active</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Updated</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {loginRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-dark-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                          <Users className="w-8 h-8 text-dark-300" />
                        </div>
                        <p className="text-lg font-medium text-dark-900">No production logins found</p>
                        <p className="text-sm mt-1">Click Create Production Login to add one.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  loginRows.map((r) => (
                    <tr key={r.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-dark-900">{r.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-700">{r.identifier || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={r.is_active
                            ? 'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100'
                            : 'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-red-50 text-red-700 border-red-100'
                          }
                        >
                          {r.is_active ? 'active' : 'disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatDate(r.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatDate(r.updated_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openViewLogin(r)}
                            className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                            title="View"
                            disabled={deletingId === r.id}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditLogin(r)}
                            className="p-1.5 text-dark-700 hover:bg-dark-100 rounded-lg transition-colors"
                            title="Edit"
                            disabled={deletingId === r.id}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLogin(r)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                            disabled={deletingId === r.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dark-100">
              <thead className="bg-dark-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Order #</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Production</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Order Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Production Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-dark-500">
                      <div className="flex flex-col items-center justify-center">
                        <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                          <ClipboardList className="w-8 h-8 text-dark-300" />
                        </div>
                        <p className="text-lg font-medium text-dark-900">No assigned orders found</p>
                        <p className="text-sm mt-1">Orders will appear here after they are assigned to production.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-violet-700 font-mono">
                          #{row.order_number || row.id}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-dark-900">{row.customer_name || '-'}</div>
                        <div className="text-sm text-dark-500">{row.customer_email || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-700">{row.production_identifier || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={clsx(
                            'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border',
                            getOrderStatusColor(row.status)
                          )}
                        >
                          {String(row.status || '-').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={clsx(
                            'px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border',
                            getProductionStatusColor(row.production_status)
                          )}
                        >
                          {String(row.production_status || '-').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="text-sm font-medium text-dark-900">
                          {Number.isFinite(Number(row.total)) ? Number(row.total).toFixed(2) : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatDate(row.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center gap-2"
                          onClick={() => navigate(`/orders/${row.id}`)}
                          disabled={!row.id}
                          title="View order"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Production Login Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-dark-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-dark-900">Create Production Login</h2>
              <button
                onClick={closeCreateModal}
                className="text-dark-400 hover:text-dark-600 transition-colors"
                type="button"
                disabled={submitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g., John Smith"
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Identifier</label>
                <input
                  type="text"
                  name="identifier"
                  value={formData.identifier}
                  onChange={handleFormChange}
                  placeholder="e.g., john@example.com or phone number"
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Production Address</label>
                <input
                  type="text"
                  name="production_address"
                  value={formData.production_address}
                  onChange={handleFormChange}
                  placeholder="e.g., Main Production Unit"
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={submitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Password</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleFormChange}
                  placeholder="Minimum 6 characters"
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={submitting}
                  required
                  minLength="6"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex gap-3 pt-4 border-t border-dark-100">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="flex-1 px-4 py-2.5 bg-dark-100 text-dark-700 rounded-lg font-medium hover:bg-dark-200 transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Production Login Modal */}
      {showViewModal && viewingLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-dark-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-dark-900">Production Login</h2>
              <button
                onClick={closeViewLogin}
                className="text-dark-400 hover:text-dark-600 transition-colors"
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Name</div>
                <div className="text-sm text-dark-900 mt-1">{viewingLogin.name || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Identifier</div>
                <div className="text-sm text-dark-900 mt-1 break-words">{viewingLogin.identifier || '-'}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Production Address</div>
                <div className="text-sm text-dark-900 mt-1 whitespace-pre-wrap break-words">{viewingLogin.production_address || '-'}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</div>
                  <div className="text-sm text-dark-900 mt-1">{viewingLogin.is_active ? 'Active' : 'Disabled'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</div>
                  <div className="text-sm text-dark-900 mt-1">{formatDate(viewingLogin.created_at)}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Updated</div>
                <div className="text-sm text-dark-900 mt-1">{formatDate(viewingLogin.updated_at)}</div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-dark-100">
              <button type="button" className="btn-secondary w-full" onClick={closeViewLogin}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Production Login Modal */}
      {showEditModal && editingLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-dark-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-dark-900">Edit Production Login</h2>
              <button
                onClick={closeEditLogin}
                className="text-dark-400 hover:text-dark-600 transition-colors"
                type="button"
                disabled={editSubmitting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Name</label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={editSubmitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Identifier</label>
                <input
                  type="text"
                  name="identifier"
                  value={editFormData.identifier}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={editSubmitting}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700 mb-2">Production Address</label>
                <input
                  type="text"
                  name="production_address"
                  value={editFormData.production_address}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2.5 border border-dark-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none transition-all"
                  disabled={editSubmitting}
                  required
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={Boolean(editFormData.is_active)}
                  onChange={handleEditChange}
                  disabled={editSubmitting}
                  className="h-4 w-4 rounded border-dark-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm text-dark-700">Active</span>
              </label>

              <div className="flex gap-3 pt-4 border-t border-dark-100">
                <button
                  type="button"
                  onClick={closeEditLogin}
                  className="flex-1 px-4 py-2.5 bg-dark-100 text-dark-700 rounded-lg font-medium hover:bg-dark-200 transition-colors"
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionManagement;
