import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { createSale } from '../features/salesSlice';
import { customerThunks, productThunks } from '../features/masterDataSlice';
import { openDB } from 'idb';
import { AlertTriangleIcon, ArrowLeftIcon, XIcon, PlusIcon } from '../components/icons';
import SearchableSelect from '../components/SearchableSelect';

const NewEstimatedBill = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { data: customers } = useSelector(state => state.masterData.customers);
  const { data: products } = useSelector(state => state.masterData.products);
  const { loading, error } = useSelector(state => state.sales);

  const [formData, setFormData] = useState({
    transactionType: 'ESTIMATE',
    customer: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    status: 'COMPLETED',
    discount: 0,
    deliveryCharge: 0,
    remarks: '',
    dispatchThrough: '',
    customInvoiceNumber: '',
    customCustomerName: '',
  });

  const [isCustomMode, setIsCustomMode] = useState(false);

  const [items, setItems] = useState([
    { product: '', quantity: 1, rate: 0, secondaryQty: 0 }
  ]);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    dispatch(customerThunks.fetchAll());
    dispatch(productThunks.fetchAll());

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
    };
    setItems(newItems);
  };

  // A product selected on one line cannot be selected again on another.
  const availableProducts = (index) =>
    products.filter((p) => p._id === items[index].product || !items.some((o, j) => j !== index && o.product === p._id));

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItemRow = () => {
    setItems([...items, { product: '', quantity: 1, rate: 0, secondaryQty: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Calculations (preview mirrors backend pricing: rate follows pricingBasis)
  let subTotal = 0;
  const calculatedItems = items.map(item => {
    const rate = parseFloat(item.rate) || 0;
    const qty = parseFloat(item.quantity) || 0;
    const prod = products.find(p => p._id === item.product);
    const sec = parseFloat(item.secondaryQty) || 0;
    const billQty = prod?.pricingBasis === 'SECONDARY' ? sec : qty;
    const lineTotal = rate * billQty;
    subTotal += lineTotal;
    return { ...item, lineTotal };
  });

  const parsedDiscount = parseFloat(formData.discount) || 0;
  const parsedDeliveryCharge = parseFloat(formData.deliveryCharge) || 0;
  const grandTotal = subTotal - parsedDiscount + parsedDeliveryCharge;

  const saveToIndexedDB = async (payload) => {
    const db = await openDB('khm-offline-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('offlineSales')) {
          db.createObjectStore('offlineSales', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
    await db.add('offlineSales', { ...payload, timestamp: Date.now() });
    alert("You are offline. The bill has been saved locally and will sync when you reconnect.");
    navigate('/sales/estimate');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(i => !i.product)) return alert("Please select a product for all rows.");

    const submissionData = {
      ...formData,
      discount: Math.round(parsedDiscount * 100),
      deliveryCharge: Math.round(parsedDeliveryCharge * 100),
      items: items.map(i => ({
        product: i.product,
        quantity: Number(i.quantity),
        rate: Math.round(Number(i.rate) * 100),
        secondaryQty: Number(i.secondaryQty) || 0,
      }))
    };

    if (isOffline) {
      await saveToIndexedDB(submissionData);
      return;
    }

    const result = await dispatch(createSale(submissionData));
    if (!result.error) {
      navigate('/sales/estimate');
    }
  };

  const handleCustomPdfDownload = async () => {
    if (items.some(i => !i.product)) return alert("Please select a product for all rows.");
    if (!formData.customInvoiceNumber) return alert("Please enter an Invoice Number for the Custom PDF.");

    const submissionData = {
      ...formData,
      transactionType: 'ESTIMATE',
      customer: formData.customer,
      invoiceNumber: formData.customInvoiceNumber,
      discount: Math.round(parsedDiscount * 100),
      deliveryCharge: Math.round(parsedDeliveryCharge * 100),
      items: items.map(i => ({
        product: i.product,
        quantity: Number(i.quantity),
        rate: Math.round(Number(i.rate) * 100),
        secondaryQty: Number(i.secondaryQty) || 0,
      }))
    };

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/sales/custom-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(submissionData)
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to generate custom PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Custom_${formData.customInvoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {isOffline && (
        <div className="bg-amber-500/20 border border-amber-500/40 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangleIcon size={20} className="text-amber-600 dark:text-amber-500 shrink-0" />
            <div>
              <h3 className="text-amber-600 dark:text-amber-500 font-bold text-sm">Offline Mode Active</h3>
              <p className="text-amber-500/80 text-xs mt-0.5">Bills created now will be saved to your device and synced when you reconnect.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/sales/estimate')} className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition shrink-0" title="Back">
            <ArrowLeftIcon size={18} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">New Estimated Bill</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Create a non-GST estimate bill.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={isCustomMode} onChange={(e) => setIsCustomMode(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            Custom/Draft PDF Mode
          </label>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Header */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 blur-3xl -z-10 opacity-30 bg-amber-500"></div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Customer *</label>
            <SearchableSelect
              required
              value={formData.customer}
              onChange={(val) => setFormData({ ...formData, customer: val })}
              placeholder="Search Customer..."
              options={customers.map(c => ({ value: c._id, label: `${c.name} ${c.gstin ? `(GST: ${c.gstin})` : '(B2C)'}` }))}
            />
          </div>

          {/* Numbers are generated on the backend (PREFIX-FYMMDD-SEQ) and shown after saving. */}
          {isCustomMode && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Custom Invoice Number *</label>
              <input required type="text" value={formData.customInvoiceNumber} onChange={(e) => setFormData({ ...formData, customInvoiceNumber: e.target.value })} placeholder="e.g. EST/26-27/001" className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bill Date *</label>
            <input required type="date" value={formData.invoiceDate} onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </div>
        </div>

        {/* Transport */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Transport / Dispatch Through (Optional)</label>
            <input type="text" value={formData.dispatchThrough} onChange={(e) => setFormData({ ...formData, dispatchThrough: e.target.value })} placeholder="e.g. VRL Logistics, Self pickup" className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
          </div>
          <p className="text-xs text-slate-500 self-center">Printed on the bill under Transport / Delivery. Leave blank if not applicable.</p>
        </div>

        {/* Item Rows */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12">#</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[300px]">Product</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32 text-center">Specification</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32 text-center">EST Stock</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Qty</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">Rate (₹)</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40 text-right">Total (₹)</th>
                  <th className="py-4 px-6 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {calculatedItems.map((item, index) => {
                  const selectedProductInfo = products.find(p => p._id === item.product);
                  const availableStock = selectedProductInfo?.estimateStock ?? 0;
                  const secUnit = selectedProductInfo?.secondaryUnit;
                  const secName = secUnit?.shortName || '';
                  const basisUnit = selectedProductInfo?.pricingBasis === 'SECONDARY' && secName
                    ? secName
                    : (selectedProductInfo?.unit?.shortName || '');
                  return (
                    <tr key={index} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition group">
                      <td className="py-3 px-6 text-sm text-slate-500 font-mono">{index + 1}</td>
                      <td className="py-3 px-6">
                        <SearchableSelect
                          required
                          value={item.product}
                          onChange={(val) => handleProductSelect(index, val)}
                          placeholder="Search Product..."
                          options={availableProducts(index).map(p => ({ value: p._id, label: `${p.name} ${p.sku ? `(${p.sku})` : ''}` }))}
                        />
                      </td>
                      <td className="py-3 px-6 text-center">
                        <span className={`text-sm font-bold font-mono px-2 py-1 rounded`}>
                          {(() => {
                            const spec = products.find(p => p._id === item.product)?.specification;
                            return spec ? <p className="text-sm text-slate-500 mt-1">{spec}</p> : null;
                          })()}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <span className={`text-xs font-bold font-mono px-2 py-1 rounded ${availableStock > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                          {item.product ? availableStock : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        <div className="space-y-2">

                          {/* Primary Quantity */}
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                              Qty ({selectedProductInfo?.unit?.shortName || 'unit'})
                            </label>

                            <input
                              required
                              type="number"
                              min="1"
                              step="any"
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(index, 'quantity', e.target.value)
                              }
                              className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
                            />
                          </div>

                          {/* Secondary Quantity */}
                          {secUnit && (
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Secondary Qty ({secName})
                              </label>

                              <input
                                required={false}
                                type="number"
                                min="0"
                                step="any"
                                value={item.secondaryQty || ''}
                                onChange={(e) =>
                                  handleItemChange(index, 'secondaryQty', e.target.value)
                                }
                                placeholder={`Enter ${secName}`}
                                title={`Measured quantity in ${secName}`}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none font-mono"
                              />
                            </div>
                          )}

                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <input required type="number" min="0" step="0.01" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none font-mono" />
                        {basisUnit && <p className="text-[10px] text-slate-500 mt-1">per {basisUnit}</p>}
                      </td>
                      <td className="py-3 px-6 text-right">
                        <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{item.lineTotal.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <button type="button" onClick={() => removeItemRow(index)} className="text-rose-500/50 hover:text-rose-400 transition" title="Remove Row"><XIcon size={15} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-slate-100 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800">
            <button type="button" onClick={addItemRow} className="text-amber-600 dark:text-amber-500 hover:text-amber-400 text-sm font-medium flex items-center gap-1 transition">
              <PlusIcon size={15} /> Add another line
            </button>
          </div>
        </div>

        {/* Totals & Submit */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Remarks / Notes</label>
              <textarea rows="3" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} className="w-full bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm text-slate-900 dark:text-white outline-none resize-none"></textarea>
            </div>

            <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Document Status</label>
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none font-medium">
                  <option value="DRAFT">Save as Draft Estimate (No stock movement)</option>
                  <option value="COMPLETED">Completed Bill (Reduces stock, updates ledger, generates PDF)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">Sub Total</span>
                <span className="text-sm text-slate-900 dark:text-white font-mono font-medium">₹{subTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">Discount (₹)</span>
                <input type="number" min="0" step="0.01" value={formData.discount} onChange={(e) => setFormData({ ...formData, discount: e.target.value })} className="w-24 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded px-2 py-1 text-sm text-right text-slate-900 dark:text-white outline-none font-mono" />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">Delivery Charge (₹)</span>
                <input type="number" min="0" step="0.01" value={formData.deliveryCharge} onChange={(e) => setFormData({ ...formData, deliveryCharge: e.target.value })} className="w-24 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded px-2 py-1 text-sm text-right text-slate-900 dark:text-white outline-none font-mono" />
              </div>
              <div className="h-px w-full bg-slate-200 dark:bg-slate-800 my-2"></div>
              <div className="flex justify-between items-end">
                <span className="text-base font-bold text-slate-600 dark:text-slate-300">Grand Total</span>
                <span className="text-3xl font-bold text-amber-600 dark:text-amber-500 font-mono tracking-tight">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {!isCustomMode ? (
              <button type="submit" disabled={loading} className="w-full mt-8 px-6 py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-2xl shadow-xl shadow-amber-600/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Processing...' : isOffline ? 'Save Offline' : (formData.status === 'COMPLETED' ? 'Save & Generate PDF' : 'Save Estimate')}
              </button>
            ) : (
              <button type="button" onClick={handleCustomPdfDownload} disabled={loading} className="w-full mt-8 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl shadow-xl shadow-emerald-600/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
                Download Custom PDF
              </button>
            )}
          </div>
        </div>

      </form>
    </div>
  );
};

export default NewEstimatedBill;
