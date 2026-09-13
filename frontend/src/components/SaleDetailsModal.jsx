import React, { useState } from 'react';
import { XIcon } from './icons';
import api from '../api';

const SaleDetailsModal = ({ sale, onClose }) => {
  const [pdfLoading, setPdfLoading] = useState(null);

  if (!sale) return null;

  const isEstimate = sale.transactionType === 'ESTIMATE';

  const handleViewPdf = async () => {
    try {
      setPdfLoading('view');
      const response = await api.get(`/sales/${sale._id}/pdf/view`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Failed to view PDF:', err);
      alert(err.response?.data?.message || err.message || 'Failed to open PDF.');
    } finally {
      setPdfLoading(null);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setPdfLoading('download');
      const response = await api.get(`/sales/${sale._id}/pdf/download`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sanitizedCustomer = (sale.customerSnapshot?.name || sale.customer?.name || 'Customer').replace(/[^a-zA-Z0-9-]/g, '_');
      const prefix = isEstimate ? 'Estimate' : (sale.billType === 'BILL_OF_SUPPLY' ? 'BillOfSupply' : 'TaxInvoice');
      const safeInv = (sale.invoiceNumber || 'Invoice').replace(/[^a-zA-Z0-9-]/g, '_');
      a.download = `${prefix}_${safeInv}_${sanitizedCustomer}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      alert(err.response?.data?.message || err.message || 'Failed to download PDF.');
    } finally {
      setPdfLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-800 my-auto max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 rounded-t-2xl sm:rounded-t-3xl">
          <div className="min-w-0 pr-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
              Invoice Details: {sale.invoiceNumber}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
              {new Date(sale.invoiceDate).toLocaleDateString('en-IN')} &bull; Customer: {sale.customerSnapshot?.name || sale.customer?.name || 'Unknown'}
              {sale.billType === 'BILL_OF_SUPPLY' && <span className="ml-2 text-emerald-500">(Bill of Supply)</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleViewPdf}
              disabled={!!pdfLoading}
              type="button"
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition disabled:opacity-50"
            >
              {pdfLoading === 'view' ? 'Loading...' : 'View PDF'}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={!!pdfLoading}
              type="button"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition disabled:opacity-50"
            >
              {pdfLoading === 'download' ? 'Saving...' : 'Download PDF'}
            </button>
            <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition">
              <XIcon size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1">
          {/* Payment Status Badge */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs font-semibold text-slate-500 uppercase">Status:</span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
              sale.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              sale.status === 'DRAFT' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' :
              'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              {sale.status}
            </span>
            <span className="text-xs font-semibold text-slate-500 uppercase ml-4">Payment:</span>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${
              sale.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              sale.paymentStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
              'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
              {sale.paymentStatus === 'PARTIAL'
                ? `₹${((sale.paidAmount || 0) / 100).toFixed(2)} / ₹${(sale.grandTotal / 100).toFixed(2)}`
                : sale.paymentStatus || 'UNPAID'}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[600px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Product</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-center">HSN</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Qty</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Rate</th>
                  {!isEstimate && (
                    <>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Taxable</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">GST %</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">CGST</th>
                      <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">SGST</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {sale.items?.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-white">
                      {item.productName || item.product?.name}
                      {item.sku && <span className="block text-xs text-slate-500 font-normal">{item.sku}</span>}
                      {item.specification && <span className="block text-xs text-slate-400 font-normal italic">{item.specification}</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-center">
                      {item.hsnCode || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">
                      {item.quantity} {item.unitName}
                      {item.secondaryQty > 0 && <span className="block text-xs text-slate-500">({item.secondaryQty} {item.secondaryUnitName})</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.rate / 100).toFixed(2)}</td>
                    {!isEstimate && (
                      <>
                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.taxableValue / 100).toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">{item.gstRate}%</td>
                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.cgst / 100).toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300 text-right">₹{(item.sgst / 100).toFixed(2)}</td>
                      </>
                    )}
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
                <span>₹{(sale.subTotal / 100).toFixed(2)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Discount</span>
                  <span>-₹{(sale.discount / 100).toFixed(2)}</span>
                </div>
              )}
              {sale.deliveryCharge > 0 && (
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Delivery</span>
                  <span>+₹{(sale.deliveryCharge / 100).toFixed(2)}</span>
                </div>
              )}
              {!isEstimate && (
                <>
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>CGST</span>
                    <span>₹{(sale.totalCgst / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>SGST</span>
                    <span>₹{(sale.totalSgst / 100).toFixed(2)}</span>
                  </div>
                  {sale.totalIgst > 0 && (
                    <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                      <span>IGST</span>
                      <span>₹{(sale.totalIgst / 100).toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-base font-bold text-slate-900 dark:text-white">
                <span>Grand Total</span>
                <span>₹{(sale.grandTotal / 100).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleDetailsModal;
