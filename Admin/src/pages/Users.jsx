import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Search, RefreshCw, Users as UsersIcon, MessageCircle, Globe, Shield, UserCheck, UserX } from 'lucide-react';
import { clsx } from 'clsx';
import { usersAPI, accountsAPI } from '../services/api';

const SOURCE_TABS = [
  { key: 'all',       label: 'All Users' },
  { key: 'web',       label: 'Website' },
  { key: 'whatsapp',  label: 'WhatsApp' },
  { key: 'admin',     label: 'Admin' },
];

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const sourceLabel = (u) => {
  if (u._source === 'admin') return { label: 'Admin', color: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (u._source === 'whatsapp') return { label: 'WhatsApp', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return { label: 'Website', color: 'bg-blue-50 text-blue-700 border-blue-100' };
};

const SourceIcon = ({ source }) => {
  if (source === 'whatsapp') return <MessageCircle className="w-3.5 h-3.5" />;
  if (source === 'admin') return <Shield className="w-3.5 h-3.5" />;
  return <Globe className="w-3.5 h-3.5" />;
};

const Users = () => {
  const [authUsers, setAuthUsers]     = useState([]);
  const [accounts, setAccounts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [activeTab, setActiveTab]     = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch admin/website login users + WhatsApp/web accounts in parallel
      const [authRes, accRes] = await Promise.all([
        usersAPI.list({ page: 1, page_size: 200 }).catch(() => ({ data: { data: [] } })),
        accountsAPI.list({ page: 1, page_size: 200 }).catch(() => ({ data: { data: [] } })),
      ]);

      // Fetch more pages if needed
      const authTotal  = authRes?.data?.total_pages || 1;
      const accTotal   = accRes?.data?.total_pages  || 1;

      let allAuth = authRes?.data?.data || [];
      let allAcc  = accRes?.data?.data  || [];

      const extraAuthPages = Array.from({ length: Math.max(0, authTotal - 1) }, (_, i) =>
        usersAPI.list({ page: i + 2, page_size: 200 }).catch(() => ({ data: { data: [] } }))
      );
      const extraAccPages = Array.from({ length: Math.max(0, accTotal - 1) }, (_, i) =>
        accountsAPI.list({ page: i + 2, page_size: 200 }).catch(() => ({ data: { data: [] } }))
      );

      const [extraAuth, extraAcc] = await Promise.all([
        Promise.all(extraAuthPages),
        Promise.all(extraAccPages),
      ]);

      for (const r of extraAuth) allAuth = [...allAuth, ...(r?.data?.data || [])];
      for (const r of extraAcc)  allAcc  = [...allAcc,  ...(r?.data?.data  || [])];

      setAuthUsers(allAuth);
      setAccounts(allAcc);
    } catch (err) {
      toast.error('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Merge into a unified list
  const merged = (() => {
    const list = [];

    // Auth users (admin panel login users)
    for (const u of authUsers) {
      list.push({
        _id:        u.id,
        _source:    'admin',
        name:       u.name,
        identifier: u.identifier,
        email:      null,
        phone:      null,
        role:       'Admin',
        is_active:  u.is_active,
        created_at: u.created_at,
      });
    }

    // Accounts (website + WhatsApp customers)
    for (const a of accounts) {
      const phone   = a.attributes?.phone  || null;
      const address = a.attributes?.address || null;
      const isWA    = a.email?.endsWith('@wa.local') || (phone && !a.email?.includes('@') === false && a.email?.endsWith('@wa.local'));
      const source  = isWA ? 'whatsapp' : 'web';

      list.push({
        _id:        a.id,
        _source:    source,
        name:       a.name,
        identifier: phone || a.email,
        email:      a.email?.endsWith('@wa.local') ? null : a.email,
        phone,
        address,
        role:       a.role || 'customer',
        is_active:  a.is_active,
        created_at: a.created_at,
      });
    }

    return list;
  })();

  const filtered = merged.filter((u) => {
    if (activeTab === 'web'      && u._source !== 'web')       return false;
    if (activeTab === 'whatsapp' && u._source !== 'whatsapp')  return false;
    if (activeTab === 'admin'    && u._source !== 'admin')     return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.identifier?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  // Summary counts
  const counts = {
    all:      merged.length,
    web:      merged.filter(u => u._source === 'web').length,
    whatsapp: merged.filter(u => u._source === 'whatsapp').length,
    admin:    merged.filter(u => u._source === 'admin').length,
    active:   merged.filter(u => u.is_active !== false).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-heading text-dark-900">Users</h1>
          <p className="text-dark-500 mt-1">All registered users — website accounts, WhatsApp customers, and admin logins.</p>
        </div>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-2" type="button">
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-dark-900 mt-1">{counts.all}</p>
            </div>
            <div className="bg-violet-50 text-violet-600 p-2.5 rounded-xl">
              <UsersIcon className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-500 uppercase tracking-wide">Website</p>
              <p className="text-2xl font-bold text-dark-900 mt-1">{counts.web}</p>
            </div>
            <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl">
              <Globe className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-500 uppercase tracking-wide">WhatsApp</p>
              <p className="text-2xl font-bold text-dark-900 mt-1">{counts.whatsapp}</p>
            </div>
            <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl">
              <MessageCircle className="w-5 h-5" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-dark-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-dark-500 uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-dark-900 mt-1">{counts.active}</p>
            </div>
            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="bg-white rounded-2xl shadow-sm border border-dark-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-dark-100">
          {/* Source tabs */}
          <div className="flex gap-1 bg-dark-50 p-1 rounded-xl w-fit">
            {SOURCE_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
                  activeTab === tab.key
                    ? 'bg-white text-dark-900 shadow-sm'
                    : 'text-dark-500 hover:text-dark-700'
                )}
                type="button"
              >
                {tab.label}
                <span className={clsx(
                  'ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.key ? 'bg-violet-100 text-violet-700' : 'bg-dark-200 text-dark-500'
                )}>
                  {counts[tab.key] ?? merged.length}
                </span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
            <input
              type="text"
              placeholder="Search name, phone, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-dark-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 w-64"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-dark-100">
              <thead className="bg-dark-50/50">
                <tr>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Source</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Contact</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Address</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-14 h-14 bg-dark-50 rounded-full flex items-center justify-center">
                          <UsersIcon className="w-7 h-7 text-dark-300" />
                        </div>
                        <p className="text-dark-500 font-medium">No users found</p>
                        {search && <p className="text-dark-400 text-sm">Try a different search term</p>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const src = sourceLabel(u);
                    return (
                      <tr key={`${u._source}-${u._id}`} className="hover:bg-dark-50/40 transition-colors">
                        {/* Name + identifier */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0',
                              u._source === 'admin'    ? 'bg-violet-100 text-violet-700' :
                              u._source === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' :
                                                         'bg-blue-100 text-blue-700'
                            )}>
                              {(u.name || '?')[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-dark-900">{u.name || '—'}</p>
                              {u.identifier && u.identifier !== u.email && u.identifier !== u.phone && (
                                <p className="text-xs text-dark-400">{u.identifier}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Source badge */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className={clsx(
                            'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border',
                            src.color
                          )}>
                            <SourceIcon source={u._source} />
                            {src.label}
                          </span>
                        </td>

                        {/* Contact */}
                        <td className="px-5 py-4">
                          <div className="space-y-0.5">
                            {u.email && <p className="text-sm text-dark-600">{u.email}</p>}
                            {u.phone && <p className="text-sm text-dark-500">📞 {u.phone}</p>}
                            {!u.email && !u.phone && <p className="text-sm text-dark-400">—</p>}
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="text-sm text-dark-600 capitalize">{u.role || '—'}</p>
                        </td>

                        {/* Address */}
                        <td className="px-5 py-4 max-w-[200px]">
                          <p className="text-sm text-dark-500 truncate" title={u.address || ''}>
                            {u.address || '—'}
                          </p>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          {u.is_active !== false ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                              <UserCheck className="w-3 h-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border bg-red-50 text-red-600 border-red-100">
                              <UserX className="w-3 h-3" /> Inactive
                            </span>
                          )}
                        </td>

                        {/* Joined */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="text-sm text-dark-500">{formatDate(u.created_at)}</p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {filtered.length > 0 && (
              <div className="px-5 py-3 border-t border-dark-100 text-xs text-dark-400">
                Showing {filtered.length} of {merged.length} users
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Users;
