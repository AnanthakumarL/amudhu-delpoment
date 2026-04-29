import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Clock, PackageCheck, RefreshCw, Trash2, Truck, Users } from 'lucide-react';
import { deliveryManagementAPI, deliveryUsersAPI } from '../services/api';

const STATUS_STYLES = {
  pending: 'bg-blue-50 text-blue-700 border-blue-100',
  in_transit: 'bg-amber-50 text-amber-700 border-amber-100',
  out_for_delivery: 'bg-amber-50 text-amber-700 border-amber-100',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-dark-100 text-dark-600 border-dark-200',
};

const normalizeStatus = (value) => {
  if (!value) return 'pending';
  const normalized = String(value).toLowerCase().replace(/\s+/g, '_');
  return normalized;
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
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

const DeliveryManagement = () => {
  const [items, setItems] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('reports');
  const [assigningId, setAssigningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const isFetchingRef = useRef(false);

  const fetchItems = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      setLoading(true);
      const pageSize = 100;

      const loginsPromise = deliveryUsersAPI.list({ page: 1, page_size: 100 });

      const first = await deliveryManagementAPI.list({ page: 1, page_size: pageSize });
      const firstPage = first?.data;
      const firstItems = Array.isArray(firstPage?.data) ? firstPage.data : [];
      const totalPages = Math.max(1, safeToNumber(firstPage?.total_pages) || 1);

      const all = [...firstItems];
      for (let page = 2; page <= totalPages; page += 1) {
        const res = await deliveryManagementAPI.list({ page, page_size: pageSize });
        const pageData = res?.data;
        const pageItems = Array.isArray(pageData?.data) ? pageData.data : [];
        all.push(...pageItems);
      }

      setItems(all);

      try {
        const usersRes = await loginsPromise;
        setLogins(usersRes?.data?.data || []);
      } catch (error) {
        setLogins([]);
        console.error(error);
      }
    } catch (error) {
      toast.error('Failed to load deliveries');
      console.error(error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };


  useEffect(() => {
    fetchItems();
  }, []);

  const rows = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  const loginRows = useMemo(() => {
    return (Array.isArray(logins) ? logins : []).map((u) => ({
      id: u.id,
      name: u.name,
      identifier: u.identifier,
      delivery_address: u.delivery_address,
      is_active: Boolean(u.is_active),
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
  }, [logins]);

  const summary = useMemo(() => {
    let deliveredCount = 0;
    let outForDeliveryCount = 0;
    let pendingCount = 0;

    rows.forEach((row) => {
      const status = normalizeStatus(row?.status);

      if (status === 'delivered') {
        deliveredCount += 1;
        return;
      }

      if (status === 'in_transit' || status === 'out_for_delivery') {
        outForDeliveryCount += 1;
        return;
      }

      if (status === 'cancelled') {
        return;
      }

      pendingCount += 1;
    });

    return {
      deliveredCount,
      outForDeliveryCount,
      pendingCount,
    };
  }, [rows]);

  const assignDeliveryUser = async (row) => {
    if (!row?.id) {
      toast.error('Delivery not loaded');
      return;
    }

    const current = String(row?.delivery_identifier || '').trim();
    const identifier = window.prompt('Enter delivery user 10-digit phone number', current);
    if (identifier === null) return;

    const digits = String(identifier).replace(/\D/g, '');
    if (digits.length !== 10) {
      toast.error('Enter exactly 10 digits');
      return;
    }

    const nextIdentifier = digits;
    if (!nextIdentifier) {
      toast.error('Enter a 10-digit phone number');
      return;
    }

    try {
      setAssigningId(row.id);
      await deliveryManagementAPI.update(row.id, {
        delivery_identifier: nextIdentifier,
        delivery_assigned_at: new Date().toISOString(),
      });
      toast.success(current ? 'Delivery reassigned' : 'Delivery assigned');
      await fetchItems();
    } catch (error) {
      toast.error(current ? 'Failed to reassign delivery' : 'Failed to assign delivery');
      console.error(error);
    } finally {
      setAssigningId(null);
    }
  };

  const deleteLogin = async (login) => {
    if (!login?.id) {
      toast.error('Delivery login not loaded');
      return;
    }

    const label = login?.name || login?.identifier || 'this login';
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete ${label}?`)) return;

    try {
      setDeletingId(login.id);
      await deliveryUsersAPI.delete(login.id);
      toast.success('Delivery login deleted');
      await fetchItems();
    } catch (error) {
      const message = error?.response?.data?.detail || 'Failed to delete delivery login';
      toast.error(message);
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Delivery Management</h1>
          <p className="text-dark-500 mt-1">
            {activeSection === 'logins' ? 'Delivery portal login users.' : 'All delivery list appears here.'}
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
              <Truck className="w-4 h-4" />
              <span>Deliveries</span>
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
              <span>Delivery Logins</span>
            </button>
          </div>

          <button
            onClick={fetchItems}
            className="btn-secondary flex items-center justify-center gap-2"
            type="button"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {activeSection === 'logins' ? (
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-dark-100">
            <div className="text-sm font-semibold text-dark-900">Delivery Logins</div>
            <div className="text-xs text-dark-500 mt-1">Logins used to access the Delivery portal.</div>
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
                  <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Action</th>
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
                        <p className="text-lg font-medium text-dark-900">No delivery logins found</p>
                        <p className="text-sm mt-1">Delivery users will appear here after they log in.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  loginRows.map((r) => (
                    <tr key={r.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-dark-900">{r.name || r.identifier || '-'}</div>
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
                        <div className="flex items-center justify-end">
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-dark-500">Orders Delivered</p>
                  <p className="text-2xl font-bold text-dark-900 mt-2">{summary.deliveredCount}</p>
                </div>
                <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl">
                  <PackageCheck className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-dark-500">Out For Delivery</p>
                  <p className="text-2xl font-bold text-dark-900 mt-2">{summary.outForDeliveryCount}</p>
                </div>
                <div className="bg-amber-50 text-amber-700 p-3 rounded-xl">
                  <Truck className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-dark-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-dark-500">Pending</p>
                  <p className="text-2xl font-bold text-dark-900 mt-2">{summary.pendingCount}</p>
                </div>
                <div className="bg-blue-50 text-blue-700 p-3 rounded-xl">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
            <div className="w-full">
              <table className="w-full table-fixed divide-y divide-dark-100">
                <thead className="bg-dark-50/50">
                  <tr>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-40">Order</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-40">Tracking</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-28">Delivery Date</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-28">Status</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-44">Contact</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Address</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-44">Assigned To</th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider w-28">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-dark-500">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                            <Truck className="w-8 h-8 text-dark-300" />
                          </div>
                          <p className="text-lg font-medium text-dark-900">No deliveries found</p>
                          <p className="text-sm mt-1">Create delivery entries to see them here.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const status = normalizeStatus(row.status);
                      const statusClass = STATUS_STYLES[status] || 'bg-dark-100 text-dark-600 border-dark-200';

                      return (
                        <tr key={row.id} className="hover:bg-dark-50/50 transition-colors">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                                <PackageCheck className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-medium text-dark-900 truncate">{row.order_id || '-'}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-dark-600 font-mono bg-dark-50 px-2 py-1 rounded inline-block max-w-full truncate">{row.tracking_number || '-'}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-dark-600">{formatDate(row.delivery_date)}</div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span
                              className={clsx('px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border', statusClass)}
                            >
                              {String(row.status || 'pending')}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-dark-900">{row.contact_name || '-'}</div>
                            <div className="text-xs text-dark-500">{row.contact_phone || ''}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-dark-500 truncate">{row.address || '-'}</div>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-dark-900">{row.delivery_identifier || '-'}</div>
                            <div className="text-xs text-dark-500">{row.delivery_assigned_at ? formatDateTime(row.delivery_assigned_at) : ''}</div>
                          </td>

                          <td className="px-4 py-4 whitespace-nowrap">
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={assigningId === row.id}
                              onClick={() => assignDeliveryUser(row)}
                            >
                              {assigningId === row.id
                                ? (row.delivery_identifier ? 'Reassigning…' : 'Assigning…')
                                : (row.delivery_identifier ? 'Reassign' : 'Assign')}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DeliveryManagement;
