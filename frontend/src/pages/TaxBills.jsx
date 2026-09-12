import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSales, createSale, cancelSale } from '../features/salesSlice';
import { Link } from 'react-router-dom';
import { openDB } from 'idb';
import { PlusIcon } from '../components/icons';
import { usePopup } from '../context/PopupContext';
import Pagination from '../components/Pagination';

const TaxBills = () => {
  const dispatch = useDispatch();
  const { data: sales, pagination, loading, error } = useSelector(state => state.sales);
  const { showConfirm, showAlert } = usePopup();
  const [statusFilter, setStatusFilter] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [billTypeFilter, setBillTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('invoiceDate');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [offlineBills, setOfflineBills] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const checkOfflineBills = async () => {
    try {
      const db = await openDB('khm-offline-db', 1);
      if (db.objectStoreNames.contains('offlineSales')) {
        const bills = await db.getAll('offlineSales');
        const taxBills = bills.filter(b => b.transactionType === 'TAX');
        setOfflineBills(taxBills);
      }
    } catch (e) {
      console.log('No offline db found or error checking');
    }
  };

  useEffect(() => {
    // Only fetch TAX bills (includes Bills of Supply — same stream, BOS- series)
    const filters = { 
      stream: 'TAX',
      page,
      limit: 15,
      sortBy,
      sortDesc
    };
    if (statusFilter) filters.status = statusFilter;
    if (payFilter) filters.paymentStatus = payFilter;
    if (billTypeFilter) filters.billType = billTypeFilter;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    dispatch(fetchSales(filters));
    checkOfflineBills();
  }, [dispatch, statusFilter, payFilter, billTypeFilter, startDate, endDate, sortBy, sortDesc, page]);

  const syncOfflineBills = async () => {
    if (!navigator.onLine) {
      await showAlert("You are still offline. Please connect to the internet to sync.");
      return;
    }
    
    setIsSyncing(true);
    const db = await openDB('khm-offline-db', 1);
    
    for (const bill of offlineBills) {
      try {
        await dispatch(createSale(bill)).unwrap();
        await db.delete('offlineSales', bill.id);
      } catch (err) {
        console.error("Failed to sync bill", bill, err);
      }
    }
    
    setIsSyncing(false);
    checkOfflineBills();
    dispatch(fetchSales({ stream: 'TAX' })); 
  };

  const handleCancel = async (sale) => {
    const label = sale.billType === 'BILL_OF_SUPPLY' ? 'bill of supply' : 'tax invoice';
    const isConfirmed = await showConfirm(`Cancel ${label} ${sale.invoiceNumber}? Its number is retained and never reused. Paid bills must have payments reversed first.`);
    if (!isConfirmed) return;
    
    const result = await dispatch(cancelSale(sale._id));
    if (result.error) {
      await showAlert(typeof result.payload === 'string' ? result.payload : 'Cancellation failed.');
    } else {
      const filters = { 
        stream: 'TAX',
        page,
        limit: 15,
        sortBy,
        sortDesc
      };
      if (statusFilter) filters.status = statusFilter;
      if (payFilter) filters.paymentStatus = payFilter;
      if (billTypeFilter) filters.billType = billTypeFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      dispatch(fetchSales(filters));
    }
  };

  return (
    <div className="space-y-6">
      {offlineBills.length > 0 && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">Offline Tax Bills Pending Sync</h3>
            <p className="text-indigo-400/80 text-xs mt-1">You have {offlineBills.length} GST invoice(s) saved offline.</p>
          </div>
          <button 
            onClick={syncOfflineBills} 
            disabled={isSyncing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Tax Bills (GST Invoices &amp; Bills of Supply)</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">Tax invoices for GST items and Bills of Supply for 0% GST exempt items. Bills of Supply carry the Notification No. 12/2017 exemption note.</p>
        </div>
        <Link
          to="/sales/tax/new"
          className="w-full sm:w-auto justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2 shrink-0"
        >
          <PlusIcon size={16} /> Create Tax Bill
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Status + payment filters + Date filters */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Doc Type</label>
          <select
            value={billTypeFilter}
            onChange={(e) => { setBillTypeFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          >
            <option value="">All</option>
            <option value="TAX_INVOICE">Tax Invoice</option>
            <option value="BILL_OF_SUPPLY">Bill of Supply</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payment</label>
          <select
            value={payFilter}
            onChange={(e) => { setPayFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          >
            <option value="">All</option>
            <option value="UNPAID">Unpaid</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sort</label>
          <select
            value={`${sortBy}-${sortDesc}`}
            onChange={(e) => {
              const [s, d] = e.target.value.split('-');
              setSortBy(s);
              setSortDesc(d === 'true');
              setPage(1);
            }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-500"
          >
            <option value="invoiceDate-true">Date (Newest)</option>
            <option value="invoiceDate-false">Date (Oldest)</option>
            <option value="grandTotal-true">Total (Highest)</option>
            <option value="grandTotal-false">Total (Lowest)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Invoice #</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Taxable</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">GST</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Grand Total</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">PDF</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {loading && sales.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-500 text-sm">Loading invoices...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-500 text-sm">No tax bills found.</td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition cursor-pointer">
                    <td className="py-4 px-6">
                      <p className="text-sm text-slate-700 dark:text-slate-200">{new Date(sale.invoiceDate).toLocaleDateString('en-IN')}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{sale.customerSnapshot?.name || sale.customer?.name || 'Unknown'}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{sale.invoiceNumber}</p>
                    </td>
                    <td className="py-4 px-6">
                      {sale.billType === 'BILL_OF_SUPPLY' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" title="0% GST exempt — carries the Notification No. 12/2017 exemption note">
                          BILL OF SUPPLY
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                          TAX INVOICE
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        sale.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                        sale.status === 'DRAFT' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-sm text-slate-600 dark:text-slate-300">
                      ₹{(sale.subTotal / 100).toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right text-sm text-slate-600 dark:text-slate-300">
                      ₹{((sale.totalCgst + sale.totalSgst + sale.totalIgst) / 100).toFixed(2)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">₹{(sale.grandTotal / 100).toFixed(2)}</p>
                    </td>
                    <td className="py-4 px-6 text-center">
                      {(sale.pdf && sale.pdf.objectKey) || sale.pdfUrl ? (
                        <div className="flex justify-center gap-3">
                          <a href={`/api/sales/${sale._id}/pdf/view`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 transition text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                            View
                          </a>
                          <a href={`/api/sales/${sale._id}/pdf/download`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 transition text-xs font-medium" onClick={(e) => e.stopPropagation()}>
                            Download
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">Generating...</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {sale.status !== 'CANCELLED' ? (
                        <button onClick={(e) => { e.stopPropagation(); handleCancel(sale); }} className="text-rose-600 dark:text-rose-400 hover:text-rose-300 transition text-xs font-medium">
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>
    </div>
  );
};

export default TaxBills;
