import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchPayments, createPayment, clearPaymentError, fetchUnpaidInvoices } from '../features/paymentSlice';
import { customerThunks, supplierThunks } from '../features/masterDataSlice';
import { formatMoney } from '../utils/formatters';

const Payments = () => {
  const dispatch = useDispatch();
  const { data: payments, loading, error, unpaidInvoices } = useSelector(state => state.payments);
  const { data: customers } = useSelector(state => state.masterData.customers);
  const { data: suppliers } = useSelector(state => state.masterData.suppliers);

  const [showModal, setShowModal] = useState(false);
  const [streamFilter, setStreamFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [formData, setFormData] = useState({
    type: 'RECEIPT',
    stream: 'ESTIMATE',
    partyId: '',
    amount: '',
    paymentMode: 'CASH',
    referenceNumber: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
  });

  const partyType = formData.type === 'RECEIPT'
    ? 'Customer'
    : 'Supplier';

  const [allocations, setAllocations] = useState({});

  useEffect(() => {
    const filters = {};
    if (streamFilter) filters.stream = streamFilter;
    if (typeFilter) filters.type = typeFilter;
    dispatch(fetchPayments(filters));
    dispatch(customerThunks.fetchAll());
    dispatch(supplierThunks.fetchAll());
  }, [dispatch, streamFilter, typeFilter]);

  // Fetch unpaid invoices when party or stream changes
  useEffect(() => {
    if (!formData.partyId || !formData.stream) {
      setAllocations({});
      return;
    }

    dispatch(fetchUnpaidInvoices({
      partyType,
      partyId: formData.partyId,
      stream: formData.stream
    }));
  }, [
    dispatch,
    formData.partyId,
    formData.stream,
    formData.type,
    partyType
  ]);

  const partyList = partyType === 'Customer' ? customers : suppliers;

  const handleAllocationChange = (invoiceId, value) => {
    setAllocations(prev => ({
      ...prev,
      [invoiceId]: parseFloat(value) || 0
    }));
  };

  const autoAllocate = () => {
    let remaining = parseFloat(formData.amount) || 0;
    const newAllocations = {};

    unpaidInvoices.forEach(inv => {
      const outstanding = (inv.grandTotal - (inv.amountPaid || 0)) / 100;
      if (remaining > 0 && outstanding > 0) {
        const alloc = Math.min(remaining, outstanding);
        newAllocations[inv._id] = alloc;
        remaining -= alloc;
      }
    });
    setAllocations(newAllocations);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prepare allocations payload
    const payloadAllocations = [];
    Object.entries(allocations).forEach(([invoiceId, amount]) => {
      if (amount > 0) {
        payloadAllocations.push({
          invoiceId,
          model: partyType === 'Customer' ? 'Sale' : 'Purchase',
          amount: Math.round(amount * 100) // Convert to paise
        });
      }
    });

    const payload = {
      ...formData,
      partyType,
      amount: Math.round(parseFloat(formData.amount) * 100),
      allocations: payloadAllocations
    };

    const result = await dispatch(createPayment(payload));
    if (!result.error) {
      setShowModal(false);
      setFormData({
        type: 'RECEIPT',
        stream: 'ESTIMATE',
        partyId: '',
        amount: '',
        paymentMode: 'CASH',
        referenceNumber: '',
        notes: '',
        date: new Date().toISOString().split('T')[0],
      });
      setAllocations({});
    }
  };

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);
  const unallocated = (parseFloat(formData.amount) || 0) - totalAllocated;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Payments & Receipts</h1>
          <p className="text-slate-400 text-sm mt-1">Record incoming and outgoing money with invoice allocations.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2"
        >
          <span>+</span> New Payment / Receipt
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => dispatch(clearPaymentError())} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none appearance-none">
          <option value="">All Streams</option>
          <option value="TAX">TAX</option>
          <option value="ESTIMATE">ESTIMATE</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none appearance-none">
          <option value="">All Types</option>
          <option value="RECEIPT">Receipts (Money In)</option>
          <option value="PAYMENT">Payments (Money Out)</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Voucher</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Stream</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Party</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Mode</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && payments.length === 0 ? (
                <tr><td colSpan="8" className="py-8 text-center text-slate-500 text-sm">Loading...</td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan="8" className="py-8 text-center text-slate-500 text-sm">No payments found.</td></tr>
              ) : (
                payments.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-slate-300">{new Date(p.date).toLocaleDateString('en-IN')}</td>
                    <td className="py-4 px-6 text-sm font-mono text-slate-400">{p.voucherNumber}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${p.type === 'RECEIPT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                        {p.type === 'RECEIPT' ? '↓ Receipt' : '↑ Payment'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${p.stream === 'TAX' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {p.stream}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-slate-200">{p.partyId?.name || 'Unknown'}</td>
                    <td className="py-4 px-6 text-sm text-slate-400">{p.paymentMode.replace('_', ' ')}</td>
                    <td className="py-4 px-6 text-right">
                      <span className={`text-sm font-bold font-mono ${p.type === 'RECEIPT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.type === 'RECEIPT' ? '+' : '-'}₹{(p.amount / 100).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500 font-mono">{p.referenceNumber || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <h2 className="text-lg font-bold text-white">
                New {formData.type === 'RECEIPT' ? 'Receipt' : 'Payment'}
              </h2>
              <button onClick={() => { setShowModal(false); setAllocations({}); }} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Type</label>
                    <select required value={formData.type} onChange={(e) => { setFormData({ ...formData, type: e.target.value }); setAllocations({}); }} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                      <option value="RECEIPT">Receipt (Money In)</option>
                      <option value="PAYMENT">Payment (Money Out)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stream</label>
                    <select required value={formData.stream} onChange={(e) => { setFormData({ ...formData, stream: e.target.value }); setAllocations({}); }} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                      <option value="ESTIMATE">ESTIMATE</option>
                      <option value="TAX">TAX</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      {partyType}
                    </label>

                    <select
                      required
                      value={formData.partyId}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          partyId: e.target.value
                        });
                        setAllocations({});
                      }}
                      className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none"
                    >
                      <option value="">Select {partyType}</option>

                      {partyList.map(p => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount (₹) *</label>
                    <input required type="number" min="0.01" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date *</label>
                    <input required type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Mode</label>
                    <select value={formData.paymentMode} onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="UPI">UPI</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reference #</label>
                    <input type="text" value={formData.referenceNumber} onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" placeholder="UTR / Cheque No." />
                  </div>
                </div>
              </div>

              {/* Invoice Allocation Section */}
              {formData.partyId && unpaidInvoices && unpaidInvoices.length > 0 && (
                <div className="border border-slate-700 rounded-xl bg-slate-800/30 overflow-hidden mt-6">
                  <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white">Invoice Allocation</h3>
                    <button type="button" onClick={autoAllocate} className="text-xs bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 px-3 py-1.5 rounded-lg font-medium transition">
                      Auto-Allocate (FIFO)
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-900/40 text-xs text-slate-400 uppercase">
                        <tr>
                          <th className="px-4 py-2 font-semibold">Invoice</th>
                          <th className="px-4 py-2 font-semibold">Date</th>
                          <th className="px-4 py-2 font-semibold text-right">Outstanding</th>
                          <th className="px-4 py-2 font-semibold text-right">Allocate (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {unpaidInvoices.map(inv => {
                          const outstanding = (inv.grandTotal - (inv.amountPaid || 0)) / 100;
                          const currentAlloc = allocations[inv._id] || '';
                          return (
                            <tr key={inv._id} className="hover:bg-slate-800/40">
                              <td className="px-4 py-2.5 text-sm font-mono text-indigo-400">{inv.invoiceNumber}</td>
                              <td className="px-4 py-2.5 text-sm text-slate-300">{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</td>
                              <td className="px-4 py-2.5 text-sm text-right text-rose-400 font-mono">₹{outstanding.toFixed(2)}</td>
                              <td className="px-4 py-2.5 text-right w-32">
                                <input
                                  type="number"
                                  min="0"
                                  max={outstanding}
                                  step="0.01"
                                  value={currentAlloc}
                                  onChange={(e) => handleAllocationChange(inv._id, e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white font-mono outline-none focus:border-indigo-500 text-right"
                                  placeholder="0.00"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-900/60 p-3 flex justify-between items-center text-sm border-t border-slate-700">
                    <span className="text-slate-400">Total Allocated: <span className="text-white font-mono font-bold">₹{totalAllocated.toFixed(2)}</span></span>
                    <span className="text-slate-400">Unallocated: <span className={`font-mono font-bold ${unallocated < 0 ? 'text-red-400' : 'text-emerald-400'}`}>₹{unallocated.toFixed(2)}</span></span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                <textarea rows="2" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none resize-none"></textarea>
              </div>

              <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-slate-900 pb-2">
                <button type="button" onClick={() => { setShowModal(false); setAllocations({}); }} className="px-5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition">Cancel</button>
                <button
                  type="submit"
                  disabled={loading || unallocated < 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
