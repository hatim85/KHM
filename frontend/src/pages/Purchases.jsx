import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPurchases } from '../features/purchaseSlice';
import { Link } from 'react-router-dom';

const Purchases = () => {
  const dispatch = useDispatch();
  const { data: purchases, loading, error } = useSelector(state => state.purchases);
  const [streamFilter, setStreamFilter] = useState('ALL'); // ALL, TAX, ESTIMATE

  useEffect(() => {
    dispatch(fetchPurchases(streamFilter === 'ALL' ? {} : { stream: streamFilter }));
  }, [dispatch, streamFilter]);

  const filteredPurchases = purchases;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Purchases</h1>
          <p className="text-slate-400 text-sm mt-1">Manage inward stock and accounts payable.</p>
        </div>
        <Link
          to="/purchases/new"
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2"
        >
          <span>+</span> New Purchase Bill
        </Link>
      </div>

      {/* Stream Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl w-fit border border-slate-800">
        <button
          onClick={() => setStreamFilter('ALL')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${streamFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
        >
          All Bills
        </button>
        <button
          onClick={() => setStreamFilter('TAX')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${streamFilter === 'TAX' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
        >
          Tax Purchases
        </button>
        <button
          onClick={() => setStreamFilter('ESTIMATE')}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition ${streamFilter === 'ESTIMATE' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
        >
          Estimated Bills
        </button>
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
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date & Stream</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Supplier</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice #</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Grand Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && purchases.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">Loading purchases...</td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">No purchases found for this stream.</td>
                </tr>
              ) : (
                purchases.map((purchase) => (
                  <tr key={purchase._id} className="hover:bg-slate-800/20 transition cursor-pointer">
                    <td className="py-4 px-6">
                      <p className="text-sm text-slate-200">{new Date(purchase.invoiceDate).toLocaleDateString('en-IN')}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block ${purchase.transactionType === 'TAX' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {purchase.transactionType}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-medium text-slate-300">{purchase.supplier?.name || 'Unknown Supplier'}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-mono text-slate-400">{purchase.invoiceNumber}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        purchase.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400' : 
                        purchase.status === 'DRAFT' ? 'bg-slate-700 text-slate-300' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {purchase.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <p className="text-sm font-bold text-white">₹{(purchase.grandTotal / 100).toFixed(2)}</p>
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

export default Purchases;
