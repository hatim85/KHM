import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSales, createSale } from '../features/salesSlice';
import { Link } from 'react-router-dom';
import { openDB } from 'idb';

const EstimatedBills = () => {
  const dispatch = useDispatch();
  const { data: sales, loading, error } = useSelector(state => state.sales);
  const [statusFilter, setStatusFilter] = useState(''); 
  const [offlineBills, setOfflineBills] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkOfflineBills = async () => {
    try {
      const db = await openDB('khm-offline-db', 1);
      if (db.objectStoreNames.contains('offlineSales')) {
        const bills = await db.getAll('offlineSales');
        setOfflineBills(bills);
      }
    } catch (e) {
      console.log('No offline db found or error checking');
    }
  };

  useEffect(() => {
    // Only fetch ESTIMATE bills
    const filters = { stream: 'ESTIMATE' };
    if (statusFilter) filters.status = statusFilter;
    dispatch(fetchSales(filters));
    checkOfflineBills();
  }, [dispatch, statusFilter]);

  const syncOfflineBills = async () => {
    if (!navigator.onLine) {
      alert("You are still offline. Please connect to the internet to sync.");
      return;
    }
    
    setIsSyncing(true);
    const db = await openDB('khm-offline-db', 1);
    const bills = await db.getAll('offlineSales');
    
    for (const bill of bills) {
      try {
        await dispatch(createSale(bill)).unwrap();
        await db.delete('offlineSales', bill.id);
      } catch (err) {
        console.error("Failed to sync bill", bill, err);
      }
    }
    
    setIsSyncing(false);
    checkOfflineBills();
    dispatch(fetchSales({ stream: 'ESTIMATE' })); // Refresh list
  };

  return (
    <div className="space-y-6">
      {offlineBills.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-blue-400 font-bold text-sm">Offline Bills Pending Sync</h3>
            <p className="text-blue-400/80 text-xs mt-1">You have {offlineBills.length} estimated bill(s) saved offline.</p>
          </div>
          <button 
            onClick={syncOfflineBills} 
            disabled={isSyncing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Estimated Bills</h1>
          <p className="text-slate-400 text-sm mt-1">Manage non-GST sales, stock reduction, and accounts receivable.</p>
        </div>
        <Link
          to="/sales/estimate/new"
          className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-amber-500/30 active:scale-95 flex items-center gap-2"
        >
          <span>+</span> Create Estimate Bill
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Bill #</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Grand Total</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && sales.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 text-sm">Loading bills...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500 text-sm">No estimated bills found.</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-slate-800/20 transition cursor-pointer">
                    <td className="py-4 px-6">
                      <p className="text-sm text-slate-200">{new Date(sale.invoiceDate).toLocaleDateString('en-IN')}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-medium text-slate-300">{sale.customer?.name || 'Unknown'}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-mono text-slate-400">{sale.invoiceNumber}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        sale.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 
                        sale.status === 'DRAFT' ? 'bg-slate-700 text-slate-300' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <p className="text-sm font-bold text-white">₹{(sale.grandTotal / 100).toFixed(2)}</p>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {(sale.pdf && sale.pdf.objectKey) || sale.pdfUrl ? (
                        <div className="flex justify-center gap-3">
                          <a href={`/api/sales/${sale._id}/pdf/view`} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                            View
                          </a>
                          <a href={`/api/sales/${sale._id}/pdf/download`} className="text-amber-400 hover:text-amber-300 transition text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Generating...</span>
                      )}
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

export default EstimatedBills;
