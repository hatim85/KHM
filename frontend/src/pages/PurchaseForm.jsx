import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { createPurchase } from '../features/purchaseSlice';
import { supplierThunks, productThunks } from '../features/masterDataSlice';
import { ArrowLeftIcon, XIcon, PlusIcon, CheckIcon, PencilIcon } from '../components/icons';

const PurchaseForm = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { data: suppliers } = useSelector(state => state.masterData.suppliers);
  const { data: products } = useSelector(state => state.masterData.products);
  const { loading, error } = useSelector(state => state.purchases);

  const [formData, setFormData] = useState({
    transactionType: 'TAX',
    supplier: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    status: 'COMPLETED',
    remarks: '',
  });

  const [items, setItems] = useState([
    { product: '', quantity: 1, rate: 0, taxRate: 0, secondaryQty: 0 }
  ]);

  useEffect(() => {
    dispatch(supplierThunks.fetchAll());
    dispatch(productThunks.fetchAll());
  }, [dispatch]);

  const handleProductSelect = (index, productId) => {
    const product = products.find(p => p._id === productId);
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      product: productId,
      rate: product ? (product.purchasePrice / 100).toFixed(2) : 0,
      taxRate: product ? product.gstRate : 0,
    };
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // A product selected on one line cannot be selected again on another.
  const availableProducts = (index) =>
    products.filter((p) => p._id === items[index].product || !items.some((o, j) => j !== index && o.product === p._id));

  const addItemRow = () => {
    setItems([...items, { product: '', quantity: 1, rate: 0, taxRate: 0, secondaryQty: 0 }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Calculations (preview mirrors backend pricing: rate follows pricingBasis)
  const isTax = formData.transactionType === 'TAX';
  let subTotal = 0;
  let taxTotal = 0;

  const calculatedItems = items.map(item => {
    const rate = parseFloat(item.rate) || 0;
    const qty = parseFloat(item.quantity) || 0;
    const prod = products.find(p => p._id === item.product);
    const sec = parseFloat(item.secondaryQty) || 0;
    const billQty = prod?.pricingBasis === 'SECONDARY' ? sec : qty;
    const lineTotal = rate * billQty;
    const lineTax = isTax ? (lineTotal * (item.taxRate / 100)) : 0;

    subTotal += lineTotal;
    taxTotal += lineTax;

    return {
      ...item,
      lineTotal,
      lineTax,
      total: lineTotal + lineTax
    };
  });

  const grandTotal = subTotal + taxTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(i => !i.product)) return alert("Please select a product for all rows.");

    // Convert everything to paise before sending to backend
    const submissionData = {
      ...formData,
      items: items.map(i => ({
        product: i.product,
        quantity: Number(i.quantity),
        rate: Math.round(Number(i.rate) * 100),
        taxRate: Number(i.taxRate),
        secondaryQty: Number(i.secondaryQty) || 0,
      }))
    };

    const result = await dispatch(createPurchase(submissionData));
    if (!result.error) {
      navigate('/purchases');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/purchases')} className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl transition" title="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">New Purchase Bill</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Inward goods and update inventory.</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Document Header */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-4 gap-6 relative overflow-hidden">
          {/* Decorative stream indicator */}
          <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl -z-10 opacity-30 ${isTax ? 'bg-indigo-500' : 'bg-amber-500'}`}></div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Stream / Ledger</label>
            <select
              value={formData.transactionType}
              onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
              className={`w-full border focus:ring-2 rounded-xl px-4 py-2.5 text-sm outline-none transition appearance-none font-bold ${isTax ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 focus:border-indigo-500 focus:ring-indigo-500/20' :
                  'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 focus:border-amber-500 focus:ring-amber-500/20'
                }`}
            >
              <option value="TAX">TAX INVOICE (With GST)</option>
              <option value="ESTIMATE">ESTIMATED BILL (No GST)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-2">
              {isTax ? "Stock adds to TAX stream. GST applied." : "Stock adds to ESTIMATE stream. No GST."}
            </p>
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Supplier *</label>
            <select required value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
              <option value="">Select Supplier</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Invoice Number *</label>
            <input required type="text" value={formData.invoiceNumber} onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono outline-none" />
          </div>

          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Invoice Date *</label>
            <input required type="date" value={formData.invoiceDate} onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none [color-scheme:light] dark:[color-scheme:dark]" />
          </div>
        </div>

        {/* Item Rows */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12">#</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[150px]">Product Item</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-23">Specification</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Qty</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40">Rate (₹)</th>
                  {isTax && (
                    <>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">GST %</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32 text-right">Tax (₹)</th>
                    </>
                  )}
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-40 text-right">Total (₹)</th>
                  <th className="py-4 px-6 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {calculatedItems.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition group">
                    <td className="py-3 px-6 text-sm text-slate-500 font-mono">{index + 1}</td>
                    <td className="py-3 px-6">
                      <select required value={item.product} onChange={(e) => handleProductSelect(index, e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none appearance-none">
                        <option value="">Search Product...</option>
                        {availableProducts(index).map(p => <option key={p._id} value={p._id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-6 text-sm text-slate-500 dark:text-slate-400">
                      {(() => {
                        const sp = products.find(p => p._id === item.product);
                        return sp?.specification || '-';
                      })()}
                    </td>
                    <td className="py-3 px-6">
                      <div className="space-y-2">

                        {/* Primary Quantity */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                            Qty ({products.find(p => p._id === item.product)?.unit?.shortName || 'unit'})
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
                            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
                          />
                        </div>

                        {/* Secondary Quantity */}
                        {(() => {
                          const sp = products.find(p => p._id === item.product);
                          const secondaryUnit = sp?.secondaryUnit;
                          const secondaryName = secondaryUnit?.shortName || '';

                          if (!secondaryName) return null;

                          return (
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                Secondary Qty ({secondaryName})
                              </label>

                              <input
                                required={sp?.pricingBasis === 'SECONDARY'}
                                type="number"
                                min="0"
                                step="any"
                                value={item.secondaryQty || ''}
                                onChange={(e) =>
                                  handleItemChange(index, 'secondaryQty', e.target.value)
                                }
                                placeholder={`Enter ${secondaryName}`}
                                title={`Measured quantity in ${secondaryName}`}
                                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white outline-none font-mono"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      <input required type="number" min="0" step="0.01" value={item.rate} onChange={(e) => handleItemChange(index, 'rate', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none font-mono" />
                      {(() => {
                        const sp = products.find(p => p._id === item.product);
                        const bu = sp?.pricingBasis === 'SECONDARY' && sp?.secondaryUnit?.shortName
                          ? sp.secondaryUnit.shortName
                          : (sp?.unit?.shortName || '');
                        return bu ? <p className="text-[10px] text-slate-500 mt-1">per {bu}</p> : null;
                      })()}
                    </td>
                    {isTax && (
                      <>
                        <td className="py-3 px-6">
                          <span value={item.taxRate} className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none appearance-none font-mono">{item.taxRate}</span>
                        </td>
                        <td className="py-3 px-6 text-right">
                          <span className="text-sm text-slate-500 dark:text-slate-400 font-mono">{item.lineTax.toFixed(2)}</span>
                        </td>
                      </>
                    )}
                    <td className="py-3 px-6 text-right">
                      <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">{item.total.toFixed(2)}</span>
                    </td>
                    <td className="py-3 px-6 text-center">
                      <button type="button" onClick={() => removeItemRow(index)} className="text-rose-500/50 hover:text-rose-400 transition" title="Remove Row">
                        <XIcon size={15} />
                      </button>
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
                  <option value="DRAFT">Save as Draft (No stock movement)</option>
                  <option value="COMPLETED">Completed (Adds stock & updates ledgers)</option>
                </select>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-6 bg-slate-200 dark:bg-slate-800">
                {formData.status === 'COMPLETED' ? <CheckIcon size={18} className="text-emerald-600 dark:text-emerald-400" /> : <PencilIcon size={18} className="text-slate-500 dark:text-slate-400" />}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500 dark:text-slate-400">Sub Total</span>
                <span className="text-sm text-slate-900 dark:text-white font-mono font-medium">₹{subTotal.toFixed(2)}</span>
              </div>
              {isTax && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Total GST</span>
                  <span className="text-sm text-slate-900 dark:text-white font-mono font-medium">₹{taxTotal.toFixed(2)}</span>
                </div>
              )}
              <div className="h-px w-full bg-slate-200 dark:bg-slate-800 my-2"></div>
              <div className="flex justify-between items-end">
                <span className="text-base font-bold text-slate-600 dark:text-slate-300">Grand Total</span>
                <span className="text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full mt-8 px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? 'Processing...' : formData.status === 'COMPLETED' ? 'Save & Complete Invoice' : 'Save as Draft'}
            </button>
          </div>
        </div>

      </form>
    </div>
  );
};

export default PurchaseForm;
