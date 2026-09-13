import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSales, createSale, convertEstimate, cancelSale } from '../features/salesSlice';
import { Link } from 'react-router-dom';
import { openDB } from 'idb';
import { PlusIcon } from '../components/icons';
import { usePopup } from '../context/PopupContext';
import Pagination from '../components/Pagination';
import SaleDetailsModal from '../components/SaleDetailsModal';
import api from '../api';

const EstimatedBills = () => {
  const dispatch = useDispatch();
  const { data: sales, pagination, loading, error } = useSelector(state => state.sales);
  const [statusFilter, setStatusFilter] = useState('');
  const [payFilter, setPayFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('invoiceDate');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [offlineBills, setOfflineBills] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showConfirm, showAlert } = usePopup();
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  const handleViewPdf = async (sale) => {
    try {
      setPdfLoadingId(`${sale._id}_view`);
      const response = await api.get(`/sales/${sale._id}/pdf/view`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('Failed to view PDF:', err);
      showAlert(err.response?.data?.message || err.message || 'Failed to open PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleDownloadPdf = async (sale) => {
    try {
      setPdfLoadingId(`${sale._id}_download`);
      const response = await api.get(`/sales/${sale._id}/pdf/download`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sanitizedCustomer = (sale.customerSnapshot?.name || sale.customer?.name || 'Customer').replace(/[^a-zA-Z0-9-]/g, '_');
      const safeInv = (sale.invoiceNumber || 'Estimate').replace(/[^a-zA-Z0-9-]/g, '_');
      a.download = `Estimate_${safeInv}_${sanitizedCustomer}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download PDF:', err);
      showAlert(err.response?.data?.message || err.message || 'Failed to download PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  };

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
    const filters = { 
      stream: 'ESTIMATE', 
      page, 
      limit: 15,
      sortBy,
      sortDesc
    };
    if (statusFilter) filters.status = statusFilter;
    if (payFilter) filters.paymentStatus = payFilter;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;
    dispatch(fetchSales(filters));
    checkOfflineBills();
  }, [dispatch, statusFilter, payFilter, startDate, endDate, sortBy, sortDesc, page, search]);

  const syncOfflineBills = async () => {
    if (!navigator.onLine) {
      await showAlert("You are still offline. Please connect to the internet to sync.");
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

  const handleConvert = async (sale) => {
    const isConfirmed = await showConfirm(`Convert estimate ${sale.invoiceNumber} into a NEW tax invoice? The estimate is preserved; stock is not moved twice.`);
    if (!isConfirmed) return;
    const result = await dispatch(convertEstimate(sale._id));
    if (!result.error) {
      const split = result.payload?.splitBills || (result.payload?.data ? [result.payload.data] : []);
      if (split.length > 1) {
        await showAlert(`Converted with GST split:\n• Tax Invoice ${split.find((s) => s.billType !== 'BILL_OF_SUPPLY')?.invoiceNumber}\n• Bill of Supply ${split.find((s) => s.billType === 'BILL_OF_SUPPLY')?.invoiceNumber} (0% GST items)`);
      } else {
        await showAlert(`Converted to ${split[0]?.billType === 'BILL_OF_SUPPLY' ? 'bill of supply' : 'tax invoice'} ${split[0]?.invoiceNumber}`);
      }
      dispatch(fetchSales({ stream: 'ESTIMATE' }));
    }
  };

  const handleCancel = async (sale) => {
    const isConfirmed = await showConfirm(`Cancel estimate ${sale.invoiceNumber}? Its number is retained and never reused.`);
    if (!isConfirmed) return;
    const result = await dispatch(cancelSale(sale._id));
    if (!result.error) dispatch(fetchSales({ stream: 'ESTIMATE' }));
  };

  return (
    <div className="space-y-6">
      {offlineBills.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <h3 className="text-blue-600 dark:text-blue-400 font-bold text-sm">Offline Bills Pending Sync</h3>
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Estimated Bills</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">Manage non-GST sales, stock reduction, and accounts receivable.</p>
        </div>
        <Link
          to="/sales/estimate/new"
          className="w-full sm:w-auto justify-center px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-amber-500/30 active:scale-95 flex items-center gap-2 shrink-0"
        >
          <PlusIcon size={16} /> Create Estimate Bill
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
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
          >
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payment</label>
          <select
            value={payFilter}
            onChange={(e) => { setPayFilter(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
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
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
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
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
          >
            <option value="invoiceDate-true">Date (Newest)</option>
            <option value="invoiceDate-false">Date (Oldest)</option>
            <option value="grandTotal-true">Total (Highest)</option>
            <option value="grandTotal-false">Total (Lowest)</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search invoice no..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[760px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Customer</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bill #</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Grand Total</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Payment</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">PDF</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {loading && sales.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 text-sm">Loading bills...</td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-500 text-sm">No estimated bills found.</td>
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        sale.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                        sale.status === 'DRAFT' ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">₹{(sale.grandTotal / 100).toFixed(2)}</p>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        sale.paymentStatus === 'PAID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                        sale.paymentStatus === 'PARTIAL' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}>
                        {sale.paymentStatus === 'PARTIAL'
                          ? `₹${((sale.paidAmount || 0) / 100).toFixed(0)} / ₹${(sale.grandTotal / 100).toFixed(0)}`
                          : sale.paymentStatus || 'UNPAID'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleViewPdf(sale); }}
                          disabled={pdfLoadingId === `${sale._id}_view`}
                          className="text-amber-600 dark:text-amber-400 hover:text-amber-300 transition text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {pdfLoadingId === `${sale._id}_view` ? (
                            <span className="animate-pulse">Loading...</span>
                          ) : (
                            'View'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDownloadPdf(sale); }}
                          disabled={pdfLoadingId === `${sale._id}_download`}
                          className="text-amber-600 dark:text-amber-400 hover:text-amber-300 transition text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {pdfLoadingId === `${sale._id}_download` ? (
                            <span className="animate-pulse">Saving...</span>
                          ) : (
                            'Download'
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedSale(sale); }} className="text-amber-600 dark:text-amber-400 hover:text-amber-300 transition text-xs font-medium">
                          Details
                        </button>
                        {sale.status === 'COMPLETED' && (
                          <button onClick={(e) => { e.stopPropagation(); handleConvert(sale); }} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 transition text-xs font-medium">
                            Convert
                          </button>
                        )}
                        {sale.status !== 'CANCELLED' && (
                          <button onClick={(e) => { e.stopPropagation(); handleCancel(sale); }} className="text-rose-600 dark:text-rose-400 hover:text-rose-300 transition text-xs font-medium">
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={pagination} onPageChange={setPage} />
      </div>

      {selectedSale && <SaleDetailsModal sale={selectedSale} onClose={() => setSelectedSale(null)} />}
    </div>
  );
};

export default EstimatedBills;
