import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Factory, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { productionManagementAPI } from '../services/api';

const STATUS_STYLES = {
  planned: 'bg-blue-50 text-blue-700 border-blue-100',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-100',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-dark-100 text-dark-600 border-dark-200',
};

const normalizeStatus = (value) => {
  if (!value) return 'planned';
  return String(value).toLowerCase().replace(/\s+/g, '_');
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const FieldRow = ({ label, value }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 border-b border-dark-100">
      <div className="text-sm font-medium text-dark-700">{label}</div>
      <div className="sm:col-span-2 text-sm text-dark-900 break-words whitespace-pre-wrap">{value ?? '-'}</div>
    </div>
  );
};

const ProductionDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);

  const fetchItem = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const res = await productionManagementAPI.get(id);
      setItem(res?.data || null);
    } catch (error) {
      toast.error('Failed to load production details');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItem();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => navigate('/production-management')}>
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6 text-dark-600">Production record not found.</div>
      </div>
    );
  }

  const status = normalizeStatus(item.status);
  const statusClass = STATUS_STYLES[status] || 'bg-dark-100 text-dark-600 border-dark-200';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 flex-shrink-0">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-dark-900">Production Details</h1>
            <p className="text-dark-500 mt-1">{item.name || '-'} • {formatDateTime(item.production_date)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={clsx('px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border', statusClass)}>
            {String(item.status || 'planned')}
          </span>

          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => navigate('/production-management')}>
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={fetchItem}>
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Batch</div>
        </div>
        <div className="px-6">
          <FieldRow label="Name" value={item.name} />
          <FieldRow label="Production date" value={formatDateTime(item.production_date)} />
          <FieldRow label="Quantity" value={Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : '-'} />
          <FieldRow label="Product id" value={item.product_id || '-'} />
          <FieldRow label="Notes" value={item.notes || '-'} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Attributes</div>
        </div>
        <div className="px-6 py-4">
          <pre className="text-xs text-dark-800 whitespace-pre-wrap break-words">{JSON.stringify(item.attributes || {}, null, 2)}</pre>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Metadata</div>
        </div>
        <div className="px-6">
          <FieldRow label="ID" value={item.id || '-'} />
          <FieldRow label="Created" value={formatDateTime(item.created_at)} />
          <FieldRow label="Updated" value={formatDateTime(item.updated_at)} />
        </div>
      </div>
    </div>
  );
};

export default ProductionDetails;
