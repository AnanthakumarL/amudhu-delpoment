import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import { applicationsAPI } from '../services/api';

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
      <div className="sm:col-span-2 text-sm text-dark-900 break-words">{value ?? '-'}</div>
    </div>
  );
};

const ApplicationDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);

  const fetchItem = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const res = await applicationsAPI.get(id);
      setItem(res.data);
    } catch (error) {
      toast.error('Failed to load application');
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
        <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => navigate('/applications')}>
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="bg-white rounded-xl shadow-sm border border-dark-100 p-6 text-dark-600">Application not found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600 flex-shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-heading text-dark-900">Application Details</h1>
            <p className="text-dark-500 mt-1">{item.applicant_name || '-'} — {item.job_title || item.job_id || '-'}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => navigate('/applications')}>
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
          <div className="text-sm font-semibold text-dark-900">Applicant</div>
        </div>
        <div className="px-6">
          <FieldRow label="Name" value={item.applicant_name} />
          <FieldRow label="Email" value={item.applicant_email} />
          <FieldRow label="Phone" value={item.applicant_phone} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Job</div>
        </div>
        <div className="px-6">
          <FieldRow label="Job title" value={item.job_title} />
          <FieldRow label="Job id" value={item.job_id} />
          <FieldRow label="Status" value={item.status} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Message</div>
        </div>
        <div className="px-6 py-4 text-sm text-dark-800 whitespace-pre-wrap">{item.message || '-'}</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-dark-100">
          <div className="text-sm font-semibold text-dark-900">Metadata</div>
        </div>
        <div className="px-6">
          <FieldRow label="Created" value={formatDateTime(item.created_at)} />
          <FieldRow label="Updated" value={formatDateTime(item.updated_at)} />
          <FieldRow label="Resume URL" value={item.resume_url || '-'} />
        </div>
      </div>
    </div>
  );
};

export default ApplicationDetails;
