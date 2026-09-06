import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createNote, fetchNoteOriginals, clearOriginals } from '../features/notesSlice';
import { customerThunks, supplierThunks, productThunks } from '../features/masterDataSlice';
import { ArrowLeftIcon, XIcon, PlusIcon } from '../components/icons';

const NewNote = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: customers } = useSelector((state) => state.masterData.customers);
  const { data: suppliers } = useSelector((state) => state.masterData.suppliers);
  const { data: products } = useSelector((state) => state.masterData.products);
  const { originals, loading, error } = useSelector((state) => state.notes);

  const [noteType, setNoteType] = useState(searchParams.get('type') || 'CREDIT_NOTE');
  const [partyId, setPartyId] = useState(searchParams.get('partyId') || '');
  const [originalId, setOriginalId] = useState(searchParams.get('originalId') || '');
  const [reason, setReason] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('COMPLETED');
  const [items, setItems] = useState([
    { description: '', product: '', quantity: 1, rate: '', gstRate: '' },
  ]);

  const isCredit = noteType === 'CREDIT_NOTE';
  const partyType = isCredit ? 'Customer' : 'Supplier';
  const parties = isCredit ? customers : suppliers;

  useEffect(() => {
    dispatch(customerThunks.fetchAll());
    dispatch(supplierThunks.fetchAll());
    dispatch(productThunks.fetchAll());
  }, [dispatch]);

  useEffect(() => {
    if (partyId) {
      dispatch(fetchNoteOriginals({ partyType, partyId }));
    } else {
      dispatch(clearOriginals());
    }
  }, [dispatch, partyType, partyId]);

  const handleTypeChange = (t) => {
    setNoteType(t);
    setPartyId('');
    setOriginalId('');
    dispatch(clearOriginals());
  };

  const handleItemChange = (index, field, value) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const addItemRow = () => {
    setItems([...items, { description: '', product: '', quantity: 1, rate: '', gstRate: '' }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const selectedOriginal = originals.find((o) => String(o._id) === String(originalId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!partyId) return alert(`Please select a ${isCredit ? 'customer' : 'supplier'}.`);
    if (!originalId) return alert('Please select the original invoice/purchase being adjusted.');
    if (items.some((i) => !i.description.trim())) return alert('Each line needs a description.');

    const payload = {
      noteType,
      ...(isCredit ? { customer: partyId } : { supplier: partyId }),
      originalId,
      ...(searchParams.get('returnId') ? { linkedReturnId: searchParams.get('returnId') } : {}),
      noteDate,
      status,
      reason,
      items: items.map((i) => ({
        description: i.description.trim(),
        ...(i.product ? { product: i.product } : {}),
        quantity: Number(i.quantity) || 1,
        ...(i.rate !== '' ? { rate: Math.round(Number(i.rate) * 100) } : {}),
        ...(i.gstRate !== '' ? { gstRate: Number(i.gstRate) } : {}),
      })),
    };

    const result = await dispatch(createNote(payload));
    if (!result.error) {
      navigate('/notes');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/notes')} className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition" title="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">New {isCredit ? 'Credit' : 'Debit'} Note</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {isCredit
              ? 'Reduce a sales invoice (returns, excess charged, missed discount). Numbered CN-…'
              : 'Adjust a purchase upward with a supplier debit. Numbered DN-…'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Note Type *</label>
            <select value={noteType} onChange={(e) => handleTypeChange(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
              <option value="CREDIT_NOTE">Credit Note (sales)</option>
              <option value="DEBIT_NOTE">Debit Note (purchase)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{isCredit ? 'Customer *' : 'Supplier *'}</label>
            <select required value={partyId} onChange={(e) => { setPartyId(e.target.value); setOriginalId(''); }} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
              <option value="">Select {isCredit ? 'Customer' : 'Supplier'}</option>
              {parties.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Note Date *</label>
            <input required type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Original {isCredit ? 'Invoice' : 'Purchase'} *</label>
            <select required value={originalId} onChange={(e) => setOriginalId(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none font-mono">
              <option value="">{partyId ? 'Select original document' : 'Select a party first'}</option>
              {originals.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.invoiceNumber} — ₹{(o.grandTotal / 100).toFixed(2)} (outstanding ₹{(o.outstanding / 100).toFixed(2)})
                </option>
              ))}
            </select>
            {selectedOriginal && (
              <p className="text-[11px] text-slate-500 mt-1">Note value cannot exceed outstanding ₹{(selectedOriginal.outstanding / 100).toFixed(2)}.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none font-medium">
              <option value="DRAFT">Draft (no ledger effect)</option>
              <option value="COMPLETED">Completed (posts ledger + adjusts outstanding)</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12">#</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[220px]">Description *</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Product (optional)</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Qty</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Rate (₹)</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">GST %</th>
                  <th className="py-4 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-3 px-4 text-sm text-slate-500 font-mono">{index + 1}</td>
                    <td className="py-3 px-4">
                      <input required type="text" value={item.description} onChange={(e) => handleItemChange(index, 'description', e.target.value)} placeholder="e.g. Goods returned — damaged" className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none" />
                    </td>
                    <td className="py-3 px-4">
                      <select value={item.product} onChange={(e) => handleItemChange(index, 'product', e.target.value)} className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none appearance-none">
                        <option value="">Free-form (no product)</option>
                        {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                      {item.product && <p className="text-[10px] text-slate-500 mt-1">Rate + GST mirror the original line.</p>}
                    </td>
                    <td className="py-3 px-4">
                      <input required type="number" min="0" step="any" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none" />
                    </td>
                    <td className="py-3 px-4">
                      <input type="number" min="0" step="0.01" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', e.target.value)} placeholder={item.product ? 'Original rate' : '0.00'} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none font-mono" />
                    </td>
                    <td className="py-3 px-4">
                      <input type="number" min="0" max="28" step="any" value={item.gstRate} onChange={(e) => handleItemChange(index, 'gstRate', e.target.value)} placeholder={item.product ? 'From original' : '0'} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none font-mono" />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button type="button" onClick={() => removeItemRow(index)} className="text-rose-500/50 hover:text-rose-400 transition" title="Remove Row"><XIcon size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={addItemRow} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition">
              <PlusIcon size={15} /> Add another line
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reason *</label>
          <textarea required rows="2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned damaged goods; excess amount charged on invoice" className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white outline-none resize-none"></textarea>
        </div>

        <button type="submit" disabled={loading} className="w-full px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 active:scale-95 transition disabled:opacity-50">
          {loading ? 'Processing...' : (status === 'COMPLETED' ? `Create ${isCredit ? 'Credit' : 'Debit'} Note (posts ledger)` : 'Save Draft')}
        </button>
      </form>
    </div>
  );
};

export default NewNote;
