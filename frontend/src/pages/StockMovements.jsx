import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchStockMovements } from '../features/inventorySlice';
import { productThunks } from '../features/masterDataSlice';

const StockMovements = () => {
  const dispatch = useDispatch();
  const { movements, movementsLoading } = useSelector(state => state.inventory);
  const { data: products } = useSelector(state => state.masterData.products);
  
  const [streamFilter, setStreamFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  useEffect(() => {
    dispatch(productThunks.fetchAll());
  }, [dispatch]);

  useEffect(() => {
    const filters = {};
    if (streamFilter) filters.stream = streamFilter;
    if (typeFilter) filters.type = typeFilter;
    if (productFilter) filters.product = productFilter;
    dispatch(fetchStockMovements(filters));
  }, [dispatch, streamFilter, typeFilter, productFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Stock Movements Ledger</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Chronological history of all stock changes across both streams.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white rounded-xl px-4 py-2 outline-none appearance-none focus:border-indigo-500"
        >
          <option value="">All Streams</option>
          <option value="TAX">TAX Stream</option>
          <option value="ESTIMATE">ESTIMATE Stream</option>
        </select>
        
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white rounded-xl px-4 py-2 outline-none appearance-none focus:border-indigo-500"
        >
          <option value="">All Types</option>
          <option value="IN">Inward (IN)</option>
          <option value="OUT">Outward (OUT)</option>
          <option value="ADJUSTMENT">Adjustments</option>
        </select>

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white rounded-xl px-4 py-2 outline-none appearance-none focus:border-indigo-500 max-w-xs"
        >
          <option value="">All Products</option>
          {products.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Product</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stream</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Quantity</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Source</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {movementsLoading && movements.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 text-sm">Loading movements...</td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-500 text-sm">No stock movements found.</td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m._id} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-300">
                      {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{m.product?.name || 'Unknown'}</p>
                      {m.product?.sku && <p className="text-xs text-slate-500 font-mono">{m.product.sku}</p>}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${m.stream === 'TAX' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                        {m.stream}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        m.type === 'IN' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                        m.type === 'OUT' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 
                        'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      }`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`text-sm font-bold font-mono ${m.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-xs text-slate-500">{m.referenceModel}</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate block">{m.remarks || '—'}</span>
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

export default StockMovements;
