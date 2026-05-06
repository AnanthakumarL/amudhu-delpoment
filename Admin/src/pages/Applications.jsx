import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, FileText, RefreshCw } from 'lucide-react';
import { applicationsAPI } from '../services/api';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
};

const Applications = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get('job_id') || undefined;
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);

  const fetchItems = async () => {
    if (!jobId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const pageSize = 100;

    try {
      setLoading(true);

      const first = await applicationsAPI.list({ page: 1, page_size: pageSize, job_id: jobId });
      const firstPage = first.data;
      const firstItems = firstPage?.data || [];
      const totalPages = Number(firstPage?.total_pages || 1) || 1;

      const allItems = Array.isArray(firstItems) ? [...firstItems] : [];
      for (let page = 2; page <= totalPages; page += 1) {
        const res = await applicationsAPI.list({ page, page_size: pageSize, job_id: jobId });
        const pageItems = res.data?.data || [];
        if (Array.isArray(pageItems)) allItems.push(...pageItems);
      }

      setItems(allItems);
    } catch (error) {
      toast.error('Failed to load applications');
      console.error(error);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchItems();
  }, [jobId]);

  const rows = useMemo(() => {
    return Array.isArray(items) ? items : [];
  }, [items]);

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
          <h1 className="text-3xl font-bold font-heading text-dark-900">Applications</h1>
          <p className="text-dark-500 mt-1">Applications received for job openings.</p>
          {jobId ? (
            <p className="text-sm text-gray-500 mt-1">Showing applications for the selected job.</p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Open Applications from a job in Careers to view its applications.</p>
          )}
        </div>

        <button
          onClick={() => (jobId ? fetchItems() : null)}
          className="btn-secondary flex items-center gap-2"
          type="button"
          disabled={!jobId}
          title={jobId ? 'Refresh' : 'Select a job first'}
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-dark-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-dark-100">
            <thead className="bg-dark-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Applicant</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Job</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-dark-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-dark-50 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-dark-300" />
                      </div>
                      <p className="text-lg font-medium text-dark-900">{jobId ? 'No applications yet' : 'Select a job'}</p>
                      <p className="text-sm mt-1">
                        {jobId
                          ? 'Applications will appear here once received.'
                          : 'Go to Careers and click View Applications for a job.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-dark-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-dark-900">{row.applicant_name || '-'}</div>
                      <div className="text-sm text-dark-500">{row.applicant_email || row.applicant_phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-dark-700">{row.job_title || row.job_id || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-100">
                        {String(row.status || 'new')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-dark-600">{formatDateTime(row.created_at)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/applications/${row.id}`)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        title="View application"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="font-medium">View</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Applications;
