import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Briefcase, MapPin, IndianRupee, Plus, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { jobsAPI } from '../services/api';

const STATUS_STYLES = {
  open: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  closed: 'bg-dark-100 text-dark-600 border-dark-200',
  pending: 'bg-blue-50 text-blue-700 border-blue-100',
};

const normalizeStatus = (value) => {
  if (!value) return 'open';
  return String(value).toLowerCase().replace(/\s+/g, '_');
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const Careers = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionJobId, setActionJobId] = useState('');

  const [jobName, setJobName] = useState('');
  const [description, setDescription] = useState('');
  const [payRupees, setPayRupees] = useState('');
  const [location, setLocation] = useState('');

  const fetchItems = async () => {
    try {
      setLoading(true);
      const pageSize = 100;
      const first = await jobsAPI.list({ page: 1, page_size: pageSize });
      const firstPage = first.data;
      const firstItems = firstPage?.data || [];

      const totalPages = Number(firstPage?.total_pages || 1) || 1;
      const allItems = Array.isArray(firstItems) ? [...firstItems] : [];

      for (let page = 2; page <= totalPages; page += 1) {
        const res = await jobsAPI.list({ page, page_size: pageSize });
        const pageItems = res.data?.data || [];
        if (Array.isArray(pageItems)) allItems.push(...pageItems);
      }

      setItems(allItems);
    } catch (error) {
      toast.error('Failed to load career jobs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const rows = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    return list.filter((row) => String(row?.attributes?.type || '').toLowerCase() === 'career');
  }, [items]);

  const resetForm = () => {
    setJobName('');
    setDescription('');
    setPayRupees('');
    setLocation('');
  };

  const handleCreate = async () => {
    const title = jobName.trim();
    const notes = description.trim();
    const pay = toNumberOrNull(payRupees);
    const loc = location.trim();

    if (!title) {
      toast.error('Job name is required');
      return;
    }
    if (!notes) {
      toast.error('Description is required');
      return;
    }
    if (pay === null || pay <= 0) {
      toast.error('Pay (₹) must be a valid number');
      return;
    }
    if (!loc) {
      toast.error('Location is required');
      return;
    }

    try {
      setSaving(true);
      await jobsAPI.create({
        title,
        status: 'open',
        notes,
        attributes: {
          type: 'career',
          pay_rupees: pay,
          location: loc,
        },
      });
      toast.success('Job created');
      resetForm();
      setShowCreate(false);
      fetchItems();
    } catch (error) {
      toast.error('Failed to create job');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (row) => {
    const currentStatus = normalizeStatus(row?.status);
    const nextStatus = currentStatus === 'closed' ? 'open' : 'closed';

    try {
      setActionJobId(row.id);
      await jobsAPI.update(row.id, { status: nextStatus });
      toast.success(`Job marked as ${nextStatus}`);
      fetchItems();
    } catch (error) {
      toast.error('Failed to update job status');
      console.error(error);
    } finally {
      setActionJobId('');
    }
  };

  const handleDelete = async (row) => {
    const ok = window.confirm('Delete this job?');
    if (!ok) return;

    try {
      setActionJobId(row.id);
      await jobsAPI.delete(row.id);
      toast.success('Job deleted');
      fetchItems();
    } catch (error) {
      toast.error('Failed to delete job');
      console.error(error);
    } finally {
      setActionJobId('');
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Careers</h1>
          <p className="text-dark-500 mt-1">Create and manage job openings.</p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={fetchItems} className="btn-secondary flex items-center gap-2" type="button">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowCreate((v) => !v)}
            className="btn-primary flex items-center gap-2"
            type="button"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Job</span>
          </button>
        </div>
      </div>

      {showCreate ? (
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-dark-100">
            <h2 className="text-lg font-semibold text-dark-900">New Job</h2>
            <p className="text-sm text-dark-500 mt-1">Enter job details and save.</p>
          </div>

          <div className="p-6 grid grid-cols-1 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-700">Job name</label>
              <input
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                className="mt-2 input-field"
                placeholder="e.g., Sales Executive"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 input-field min-h-[120px]"
                placeholder="Describe responsibilities and requirements"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-dark-700">Pay (₹)</label>
                <input
                  value={payRupees}
                  onChange={(e) => setPayRupees(e.target.value)}
                  className="mt-2 input-field"
                  placeholder="e.g., 25000"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-700">Location</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-2 input-field"
                  placeholder="e.g., Chennai"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetForm();
                  setShowCreate(false);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleCreate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Job'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Job</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Pay</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-dark-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                        <Briefcase className="w-8 h-8 text-dark-300" />
                      </div>
                      <p className="text-lg font-medium text-dark-900">No job openings yet</p>
                      <p className="text-sm mt-1">Click “Create New Job” to add one.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const status = normalizeStatus(row.status);
                  const statusClass = STATUS_STYLES[status] || 'bg-dark-100 text-dark-600 border-dark-200';
                  const pay = row?.attributes?.pay_rupees;
                  const loc = row?.attributes?.location;
                  const isActing = actionJobId === row.id;
                  const toggleLabel = status === 'closed' ? 'Open' : 'Close';

                  return (
                    <tr key={row.id} className="hover:bg-dark-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 flex-shrink-0">
                            <Briefcase className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-dark-900">{row.title || '-'}</div>
                            <div className="text-sm text-dark-500 mt-1">{row.notes || '-'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-dark-700">
                          <IndianRupee className="w-4 h-4 text-dark-400" />
                          <span>{pay ?? '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-dark-700">
                          <MapPin className="w-4 h-4 text-dark-400" />
                          <span>{loc ?? '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx('px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border', statusClass)}>
                          {String(row.status || 'open')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-dark-600">{formatDateTime(row.created_at)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => navigate(`/applications?job_id=${row.id}`)}
                            disabled={isActing}
                          >
                            View Applications
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleToggleStatus(row)}
                            disabled={isActing}
                          >
                            {isActing ? 'Updating...' : toggleLabel}
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleDelete(row)}
                            disabled={isActing}
                          >
                            {isActing ? '...' : 'Delete'}
                          </button>
                        </div>
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

export default Careers;
