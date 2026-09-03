import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { createSale } from '../features/salesSlice';
import { customerThunks, productThunks } from '../features/masterDataSlice';
import { fetchSettings } from '../features/settingsSlice';
import { openDB } from 'idb';

const NewTaxBill = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const { data: customers } = useSelector(state => state.masterData.customers);
  const { data: products } = useSelector(state => state.masterData.products);
  const { data: settings } = useSelector(state => state.settings);
  const { loading, error } = useSelector(state => state.sales);

  const [formData, setFormData] = useState({
    transactionType: 'TAX',
    customer: '',
    invoiceNumber: `INV-${Date.now()}`, 
    invoiceDate: new Date().toISOString().split('T')[0],
    status: 'COMPLETED',
    discount: 0,
    remarks: '',
    dispatchThrough: '',
  });

  const [items, setItems] = useState([
    { product: '', quantity: 1, rate: 0, gstRate: 0 }
  ]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    dispatch(customerThunks.fetchAll());
    dispatch(productThunks.fetchAll());
    dispatch(fetchSettings());

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [dispatch]);

  const handleProductSelect = (index, productId) => {
    const product = products.find(p => p._id === productId);
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      product: productId,
      rate: product ? (product.sellingPrice / 100).toFixed(2) : 0,
      gstRate: product ? product.gstRate || 0 : 0,
    };
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItemRow = () => {
    setItems([...items, { product: '', quantity: 1, rate: 0, gstRate: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Tax Logic
  const companyStateCode = settings?.stateCode || '24';
  const selectedCustomer = customers.find(c => c._id === formData.customer);
  const customerStateCode = selectedCustomer ? (selectedCustomer.stateCode || '24') : '24';
  const isIntraState = companyStateCode === customerStateCode;

  let subTotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const calculatedItems = items.map(item => {
    const rate = parseFloat(item.rate) || 0;
    const qty = parseFloat(item.quantity) || 0;
    const taxableValue = rate * qty;
    
    const gstRate = parseFloat(item.gstRate) || 0;
    const taxAmount = taxableValue * (gstRate / 100);
    
    let cgst = 0, sgst = 0, igst = 0;
    if (isIntraState) {
      cgst = taxAmount / 2;
      sgst = taxAmount / 2;
    } else {
      igst = taxAmount;
    }

    const lineTotal = taxableValue + taxAmount;
    
    subTotal += taxableValue;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;

    return { ...item, taxableValue, cgst, sgst, igst, lineTotal };
  });

  const parsedDiscount = parseFloat(formData.discount) || 0;
  const totalTax = totalCgst + totalSgst + totalIgst;
  const grandTotal = subTotal + totalTax - parsedDiscount;

  const saveToIndexedDB = async (payload) => {
    const db = await openDB('khm-offline-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('offlineSales')) {
          db.createObjectStore('offlineSales', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
    await db.add('offlineSales', { ...payload, timestamp: Date.now() });
    alert("You are offline. The GST invoice has been saved locally and will sync when you reconnect.");
    navigate('/sales/tax');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(i => !i.product)) return alert("Please select a product for all rows.");

    const submissionData = {
      ...formData,
      discount: Math.round(parsedDiscount * 100),
      items: items.map(i => ({
        product: i.product,
        quantity: Number(i.quantity),
        rate: Math.round(Number(i.rate) * 100),
      }))
    };

    if (isOffline) {
      await saveToIndexedDB(submissionData);
      return;
    }

    const result = await dispatch(createSale(submissionData));
    if (!result.error) {
      navigate('/sales/tax');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {isOffline && (
        <div className="bg-amber-500/20 border border-amber-500/40 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-amber-500 text-xl">⚠️</span>
            <div>
              <h3 className="text-amber-500 font-bold text-sm">Offline Mode Active</h3>
              <p className="text-amber-500/80 text-xs mt-0.5">Invoices created now will be saved to your device and synced when you reconnect.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/sales/tax')} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition">
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">New Tax Bill</h1>
          <p className="text-slate-400 text-sm mt-1">Create an official GST Invoice.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Header */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl -z-10 opacity-30 bg-indigo-500"></div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer *</label>
            <select required value={formData.customer} onChange={(e) => setFormData({...formData, customer: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
              <option value="">Select Customer</option>
              {customers.map(c => <option key={c._id} value={c._id}>{c.name} {c.gstin ? `(GST: ${c.gstin})` : '(B2C)'}</option>)}
            </select>
            {selectedCustomer && (
              <p className="text-[10px] text-slate-500 mt-1">
                State Code: {customerStateCode} ({isIntraState ? 'Intra-State: CGST/SGST' : 'Inter-State: IGST'})
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Invoice Number *</label>
            <input required type="text" value={formData.invoiceNumber} onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Invoice Date *</label>
            <input required type="date" value={formData.invoiceDate} onChange={(e) => setFormData({...formData, invoiceDate: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
          </div>
        </div>

        {/* Item Rows */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1000px]">
              <thead>
                <tr className="bg-slate-800/40 border-b border-slate-800">
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">#</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-[250px]">Product (HSN)</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24 text-center">TAX Stock</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Qty</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">Rate (Ex. GST)</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32 text-right">Taxable</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24 text-right">GST %</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24 text-right">Tax Amt</th>
                  <th className="py-4 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32 text-right">Total (₹)</th>
                  <th className="py-4 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {calculatedItems.map((item, index) => {
                  const selectedProductInfo = products.find(p => p._id === item.product);
                  const taxStock = selectedProductInfo?.taxStock || 0;
                  const taxAmt = item.cgst + item.sgst + item.igst;
                  return (
                    <tr key={index} className="hover:bg-slate-800/20 transition group">
                      <td className="py-3 px-4 text-sm text-slate-500 font-mono">{index + 1}</td>
                      <td className="py-3 px-4">
                        <select required value={item.product} onChange={(e) => handleProductSelect(index, e.target.value)} className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white outline-none appearance-none">
                          <option value="">Search Product...</option>
                          {products.map(p => <option key={p._id} value={p._id}>{p.name} {p.hsnCode ? `(${p.hsnCode})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs font-bold font-mono px-2 py-1 rounded ${taxStock > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {item.product ? taxStock : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <input required type="number" min="1" step="any" value={item.quantity} onChange={(e) => handleItemChange(index, 'quantity', e.target.value)} className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white outline-none" />
                      </td>
                      <td className="py-3 px-4">
                        <input required type="number" min="0" step="0.01" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', e.target.value)} className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white outline-none font-mono" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-medium text-slate-300 font-mono">{item.taxableValue.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-xs text-slate-400 font-mono">{item.gstRate}%</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm text-slate-400 font-mono">{taxAmt.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-bold text-white font-mono">{item.lineTotal.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button type="button" onClick={() => removeItemRow(index)} className="text-rose-500/50 hover:text-rose-400 transition" title="Remove Row">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-slate-800/20 border-t border-slate-800">
            <button type="button" onClick={addItemRow} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium flex items-center gap-1 transition">
              <span>+</span> Add another line
            </button>
          </div>
        </div>

        {/* Totals & Submit */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Remarks / Notes</label>
              <textarea rows="3" value={formData.remarks} onChange={(e) => setFormData({...formData, remarks: e.target.value})} className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-white outline-none resize-none"></textarea>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Dispatch Through (Optional)</label>
              <input type="text" value={formData.dispatchThrough} onChange={(e) => setFormData({...formData, dispatchThrough: e.target.value})} placeholder="e.g. VRL Logistics, Self" className="w-full bg-slate-900/60 border border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-white outline-none" />
            </div>
            
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Document Status</label>
                <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none font-medium">
                  <option value="DRAFT">Save as Draft (No stock movement)</option>
                  <option value="COMPLETED">Completed Tax Bill (Reduces stock, updates ledger, generates PDF)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Taxable Value</span>
                <span className="text-sm text-white font-mono font-medium">₹{subTotal.toFixed(2)}</span>
              </div>
              
              {isIntraState ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">CGST</span>
                    <span className="text-sm text-white font-mono">₹{totalCgst.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">SGST</span>
                    <span className="text-sm text-white font-mono">₹{totalSgst.toFixed(2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">IGST</span>
                  <span className="text-sm text-white font-mono">₹{totalIgst.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Discount (₹)</span>
                <input type="number" min="0" step="0.01" value={formData.discount} onChange={(e) => setFormData({...formData, discount: e.target.value})} className="w-24 bg-slate-950/60 border border-slate-700 focus:border-indigo-500 rounded px-2 py-1 text-sm text-right text-white outline-none font-mono" />
              </div>
              
              <div className="h-px w-full bg-slate-800 my-2"></div>
              
              <div className="flex justify-between items-end">
                <span className="text-base font-bold text-slate-300">Grand Total</span>
                <span className="text-3xl font-bold text-indigo-400 font-mono tracking-tight">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full mt-8 px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'Processing...' : isOffline ? 'Save Offline' : (formData.status === 'COMPLETED' ? 'Save & Generate GST PDF' : 'Save Draft')}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};

export default NewTaxBill;
