import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchReturns, fetchReturnable, createSalesReturn, createPurchaseReturn } from '../features/returnsSlice';
import { PlusIcon, XIcon } from '../components/icons';
import { fetchSales } from '../features/salesSlice';
import { fetchPurchases } from '../features/purchaseSlice';

const Returns = () => {
  const dispatch = useDispatch();
  const { data: returns, loading, error } = useSelector((state) => state.returns);
  const { data: sales } = useSelector((state) => state.sales);
  const { data: purchases } = useSelector((state) => state.purchases);
  const { returnable } = useSelector((state) => state.returns);

  const [tab, setTab] = useState('SALES_RETURN');
  const [streamFilter, setStreamFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [originalId, setOriginalId] = useState('');
  const [qtys, setQtys] = useState({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    const filters = { returnType: tab };
    if (streamFilter) filters.stream = streamFilter;
    dispatch(fetchReturns(filters));
    dispatch(fetchSales({}));
    dispatch(fetchPurchases({}));
  }, [dispatch, tab, streamFilter]);

  useEffect(() => {
    if (!originalId) return;
    const model = tab === 'SALES_RETURN' ? 'Sale' : 'Purchase';
    dispatch(fetchReturnable({ model, id: originalId }));
    setQtys({});
    setReason('');
  }, [dispatch, originalId, tab]);

  const isSales = tab === 'SALES_RETURN';
  const originals = (isSales ? sales : purchases).filter((d) => d.status === 'COMPLETED');

  const openModal = () => {
    setOriginalId('');
    setQtys({});
    setReason('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const items = Object.entries(qtys)
      .filter(([, q]) => Number(q) > 0)
      .map(([product, q]) => ({ product, quantity: Number(q) }));
    if (items.length === 0) return alert('Enter a return quantity for at least one line.');
    if (!reason.trim()) return alert('A reason is required for returns.');

    const payload = { items, reason: reason.trim() };
    const result = isSales
      ? await dispatch(createSalesReturn({ ...payload, saleId: originalId }))
      : await dispatch(createPurchaseReturn({ ...payload, purchaseId: originalId }));
    if (!result.error) {
      setShowModal(false);
      const filters = { returnType: tab };
      if (streamFilter) filters.stream = streamFilter;
      dispatch(fetchReturns(filters));
    }
  };

  const partyName = (r) => r.customerSnapshot?.name || r.supplierSnapshot?.name || '—';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Returns</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Partial or full returns linked to original documents. Stock, ledger, GST and outstanding update together.</p>
        </div>
        <button
          onClick={openModal}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2"
        >
          <PlusIcon size={16} /> New {isSales ? 'Sales' : 'Purchase'} Return
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {['SALES_RETURN', 'PURCHASE_RETURN'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === t ? 'bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/40' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              {t === 'SALES_RETURN' ? 'Sales Returns' : 'Purchase Returns'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stream</label>
          <select
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          >
            <option value="">TAX + Estimate</option>
            <option value="TAX">Tax only</option>
            <option value="ESTIMATE">Estimate only</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Return #</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Original</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Party</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stream</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {loading && returns.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-slate-500 text-sm">Loading returns...</td></tr>
              ) : returns.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-slate-500 text-sm">No returns found.</td></tr>
              ) : (
                returns.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-200">{new Date(r.returnDate).toLocaleDateString('en-IN')}</td>
                    <td className="py-4 px-6 text-sm font-mono text-indigo-600 dark:text-indigo-300">{r.returnNumber}</td>
                    <td className="py-4 px-6 text-sm font-mono text-slate-500 dark:text-slate-400">{r.originalNumber}</td>
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-300">{partyName(r)}</td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${r.stream === 'TAX' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                        {r.stream}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-sm font-bold text-slate-900 dark:text-white">₹{(r.grandTotal / 100).toFixed(2)}</td>
                    <td className="py-4 px-6 text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs" title={r.reason}>{r.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">New {isSales ? 'Sales' : 'Purchase'} Return</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Close"><XIcon size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Original Document (Completed only) *</label>
                <select required value={originalId} onChange={(e) => setOriginalId(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
                  <option value="">Select document</option>
                  {originals.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.invoiceNumber} — {(d.customerSnapshot?.name || d.supplierSnapshot?.name || d.customer?.name || d.supplier?.name || '')} — ₹{(d.grandTotal / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {returnable && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                  <table className="w-full text-left whitespace-nowrap">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Product</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Sold</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Returned</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Returnable</th>
                        <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                      {returnable.lines.map((line) => (
                        <tr key={String(line.product)}>
                          <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-200">{line.productName || 'Item'}</td>
                          <td className="py-3 px-4 text-sm text-right text-slate-500 dark:text-slate-400 font-mono">{line.soldQty}</td>
                          <td className="py-3 px-4 text-sm text-right text-slate-500 dark:text-slate-400 font-mono">{line.returnedQty}</td>
                          <td className="py-3 px-4 text-sm text-right text-emerald-600 dark:text-emerald-400 font-mono">{line.returnableQty}</td>
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number" min="0" max={line.returnableQty} step="any"
                              value={qtys[String(line.product)] || ''}
                              onChange={(e) => setQtys((prev) => ({ ...prev, [String(line.product)]: e.target.value }))}
                              disabled={line.returnableQty <= 0}
                              className="w-24 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-right text-slate-900 dark:text-white outline-none font-mono disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reason *</label>
                <input required type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
              </div>

              <button type="submit" disabled={loading} className="w-full px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl active:scale-95 transition disabled:opacity-50">
                {loading ? 'Processing...' : 'Create Return (updates stock, ledger, GST, outstanding)'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
