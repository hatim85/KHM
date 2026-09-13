import React from 'react';
import { XIcon } from './icons';

const PurchaseDetailsModal = ({ purchase, onClose }) => {
  if (!purchase) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 rounded-t-2xl sm:rounded-t-3xl">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">Purchase Details: {purchase.invoiceNumber}</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
              {new Date(purchase.invoiceDate).toLocaleDateString('en-IN')} &bull; Supplier: {purchase.supplierSnapshot?.name || purchase.supplier?.name || 'Unknown'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition flex-shrink-0">
            <XIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[540px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Product</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-center">HSN</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Qty</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Rate</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Tax %</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Tax Amt</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {purchase.items?.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white">
                      {item.productName}
                      {item.sku && <span className="block text-xs text-slate-500 font-normal">{item.sku}</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-center">
                      {item.hsnCode || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">
                      {item.quantity} {item.unitName}
                      {item.secondaryQty > 0 && <span className="block text-xs text-slate-500">({item.secondaryQty} {item.secondaryUnitName})</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.rate / 100).toFixed(2)}</td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">{item.taxRate}%</td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.taxAmount / 100).toFixed(2)}</td>
                    <td className="py-3 px-4 text-sm font-bold text-slate-900 dark:text-white text-right">₹{(item.total / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <div className="w-full sm:w-80 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>SubTotal</span>
                <span>₹{(purchase.subTotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Total Tax</span>
                <span>₹{(purchase.taxTotal / 100).toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-base font-bold text-slate-900 dark:text-white">
                <span>Grand Total</span>
                <span>₹{(purchase.grandTotal / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseDetailsModal;
