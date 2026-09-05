import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAuditLogs } from '../features/auditSlice';

const AuditLogs = () => {
  const dispatch = useDispatch();
  const { data: logs, loading, error, total, page, pages } = useSelector(state => state.audit);

  const [filters, setFilters] = useState({
    action: '',
    entity: '',
    startDate: '',
    endDate: '',
    page: 1,
  });

  useEffect(() => {
    dispatch(fetchAuditLogs(filters));
  }, [dispatch, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= pages) {
      setFilters(prev => ({ ...prev, page: newPage }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Audit Logs</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Track all critical actions performed in the ERP for security and accountability.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl">
        <input 
          type="text" 
          placeholder="Search Actions (e.g. SALE)" 
          value={filters.action} 
          onChange={(e) => handleFilterChange('action', e.target.value)}
          className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
        />
        <select 
          value={filters.entity} 
          onChange={(e) => handleFilterChange('entity', e.target.value)}
          className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
        >
          <option value="">All Entities</option>
          <option value="Sale">Sale</option>
          <option value="Purchase">Purchase</option>
          <option value="Payment">Payment</option>
          <option value="Expense">Expense</option>
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">From</span>
          <input 
            type="date" 
            value={filters.startDate} 
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">To</span>
          <input 
            type="date" 
            value={filters.endDate} 
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <button 
          onClick={() => setFilters({ action: '', entity: '', startDate: '', endDate: '', page: 1 })}
          className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition ml-auto"
        >
          Clear Filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Timestamp</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Entity</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Summary</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {loading && logs.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-slate-500 text-sm">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-slate-500 text-sm">No audit logs found.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="py-4 px-6 text-sm text-indigo-600 dark:text-indigo-300 font-medium">
                      {log.user?.name || log.metadata?.actor || 'SYSTEM'}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        log.action.includes('CREATED') ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        log.action.includes('DELETED') || log.action.includes('CANCEL') ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                        'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-300 font-mono">
                      {log.entity}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-200 truncate max-w-sm" title={log.summary}>
                      {log.summary}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500 font-mono text-xs">
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div className="bg-slate-100 dark:bg-slate-800/20 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Showing <span className="font-bold text-slate-900 dark:text-white">{logs.length}</span> of <span className="font-bold text-slate-900 dark:text-white">{total}</span> logs
            </span>
            <div className="flex gap-2">
              <button 
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition"
              >
                Prev
              </button>
              <button 
                disabled={page === pages}
                onClick={() => handlePageChange(page + 1)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
