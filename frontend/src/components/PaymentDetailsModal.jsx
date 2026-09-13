import React from 'react';
import { XIcon } from './icons';

const PaymentDetailsModal = ({ payment, onClose }) => {
  if (!payment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 rounded-t-2xl sm:rounded-t-3xl">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
              {payment.type === 'RECEIPT' ? 'Receipt' : 'Payment'} Details: {payment.voucherNumber}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
              {new Date(payment.date).toLocaleDateString('en-IN')} &bull; {payment.partySnapshot?.name || payment.partyId?.name || 'Unknown'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition flex-shrink-0">
            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1">
          {/* Status Badge */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs font-semibold text-slate-500 uppercase">Status:</span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
              payment.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              payment.status === 'REVERSED' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' :
              'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {payment.status}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase ml-4">Stream:</span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
              payment.stream === 'TAX' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {payment.stream}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
             <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Amount</p>
                <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">₹{(payment.amount / 100).toFixed(2)}</p>
             </div>
             <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Mode</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{payment.paymentMode?.replace('_', ' ')}</p>
             </div>
          </div>

          <div className="space-y-4">
             {payment.referenceNumber && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Reference Number</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{payment.referenceNumber}</p>
                </div>
             )}
             
             {payment.notes && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notes</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{payment.notes}</p>
                </div>
             )}

             {payment.allocations && payment.allocations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Allocated Invoices</h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Invoice No.</th>
                          <th className="py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Amount Allocated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                        {payment.allocations.map((alloc, idx) => (
                          <tr key={idx}>
                            <td className="py-2 px-3 text-sm text-slate-700 dark:text-slate-300 font-mono">
                               {alloc.invoiceNumber || alloc.invoiceId?.invoiceNumber || '—'}
                            </td>
                            <td className="py-2 px-3 text-sm font-medium text-slate-900 dark:text-white text-right">
                               ₹{(alloc.amountAllocated / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentDetailsModal;
