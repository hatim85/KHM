import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { fetchCustomerLedger, fetchSupplierLedger } from '../features/paymentSlice';
import { ArrowLeftIcon } from '../components/icons';

const LedgerView = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { partyType, partyId } = useParams(); // 'customer' or 'supplier'
  const [searchParams] = useSearchParams();
  const partyName = searchParams.get('name') || 'Party';

  const { ledger, loading, error } = useSelector(state => state.payments);
  const [streamFilter, setStreamFilter] = useState('');

  const isCustomer = partyType === 'customer';

  useEffect(() => {
    if (isCustomer) {
      dispatch(fetchCustomerLedger({ customerId: partyId, stream: streamFilter }));
    } else {
      dispatch(fetchSupplierLedger({ supplierId: partyId, stream: streamFilter }));
    }
  }, [dispatch, partyType, partyId, streamFilter, isCustomer]);

  const currentBalance = ledger.length > 0 ? ledger[ledger.length - 1].balanceAfter : 0;
  const balanceLabel = isCustomer
    ? (currentBalance > 0 ? 'They owe you' : currentBalance < 0 ? 'Advance paid' : 'Settled')
    : (currentBalance > 0 ? 'You owe them' : currentBalance < 0 ? 'Advance paid to them' : 'Settled');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition" title="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {partyName} — Statement of Account
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {isCustomer ? 'Customer' : 'Supplier'} Ledger · Running balance of all transactions
          </p>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Current Balance</p>
          <p className={`text-3xl font-bold font-mono mt-1 ${currentBalance > 0 ? (isCustomer ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : currentBalance < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
            ₹{(Math.abs(currentBalance) / 100).toFixed(2)}
          </p>
          <p className="text-xs text-slate-500 mt-1">{balanceLabel}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Transactions</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white font-mono mt-1">{ledger.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-end">
          <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
            <option value="">All Streams</option>
            <option value="TAX">TAX Only</option>
            <option value="ESTIMATE">ESTIMATE Only</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">{error}</div>
      )}

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stream</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reference</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Debit (₹)</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Credit (₹)</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {loading && ledger.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-slate-500 text-sm">Loading ledger...</td></tr>
              ) : ledger.length === 0 ? (
                <tr><td colSpan="7" className="py-8 text-center text-slate-500 text-sm">No transactions found for this party.</td></tr>
              ) : (
                ledger.map((entry, idx) => (
                  <tr key={entry._id || idx} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-300">{new Date(entry.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${entry.stream === 'TAX' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                        {entry.stream}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        entry.transactionType === 'SALE' || entry.transactionType === 'PURCHASE' 
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' 
                          : entry.transactionType === 'RECEIPT' || entry.transactionType === 'PAYMENT'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        {entry.transactionType}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500 font-mono">
                      {entry.referenceModel}
                    </td>
                    <td className="py-4 px-6 text-right text-sm font-mono">
                      {entry.debit > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">{(entry.debit / 100).toFixed(2)}</span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-4 px-6 text-right text-sm font-mono">
                      {entry.credit > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{(entry.credit / 100).toFixed(2)}</span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`text-sm font-bold font-mono ${entry.balanceAfter >= 0 ? 'text-slate-900 dark:text-white' : 'text-amber-600 dark:text-amber-400'}`}>
                        {entry.balanceAfter < 0 ? '-' : ''}₹{(Math.abs(entry.balanceAfter) / 100).toFixed(2)}
                      </span>
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

export default LedgerView;
