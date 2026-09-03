import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { productThunks, categoryThunks, brandThunks, unitThunks } from '../features/masterDataSlice';
import { adjustStock, resetAdjustSuccess, fetchLowStock } from '../features/inventorySlice';

const Products = () => {
  const dispatch = useDispatch();
  const { data: products, loading: productsLoading } = useSelector((state) => state.masterData.products);
  const { data: categories } = useSelector((state) => state.masterData.categories);
  const { data: brands } = useSelector((state) => state.masterData.brands);
  const { data: units } = useSelector((state) => state.masterData.units);
  const { lowStock, adjustLoading, adjustSuccess, error: inventoryError } = useSelector((state) => state.inventory);
  
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustData, setAdjustData] = useState({ product: '', productName: '', stream: 'TAX', quantity: '', reason: '' });
  
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    category: '',
    brand: '',
    unit: '',
    hsnCode: '',
    purchasePrice: '',
    sellingPrice: '',
    gstRate: 0,
    reorderLevel: 10,
    isActive: true,
  });

  useEffect(() => {
    dispatch(productThunks.fetchAll());
    dispatch(categoryThunks.fetchAll());
    dispatch(brandThunks.fetchAll());
    dispatch(unitThunks.fetchAll());
    dispatch(fetchLowStock());
  }, [dispatch]);

  useEffect(() => {
    if (adjustSuccess) {
      setShowAdjustModal(false);
      dispatch(productThunks.fetchAll());
      dispatch(fetchLowStock());
      const timer = setTimeout(() => dispatch(resetAdjustSuccess()), 3000);
      return () => clearTimeout(timer);
    }
  }, [adjustSuccess, dispatch]);

  const openModal = (product = null) => {
    if (product) {
      setEditingId(product._id);
      setFormData({
        sku: product.sku || '',
        name: product.name,
        description: product.description || '',
        category: product.category?._id || '',
        brand: product.brand?._id || '',
        unit: product.unit?._id || '',
        hsnCode: product.hsnCode || '',
        purchasePrice: (product.purchasePrice / 100).toFixed(2),
        sellingPrice: (product.sellingPrice / 100).toFixed(2),
        gstRate: product.gstRate || 0,
        reorderLevel: product.reorderLevel ?? 10,
        isActive: product.isActive,
      });
    } else {
      setEditingId(null);
      setFormData({
        sku: '', name: '', description: '', category: '', brand: '', unit: '',
        hsnCode: '', purchasePrice: '', sellingPrice: '', gstRate: 0, reorderLevel: 10, isActive: true
      });
    }
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const submissionData = {
      ...formData,
      purchasePrice: Math.round(parseFloat(formData.purchasePrice || 0) * 100),
      sellingPrice: Math.round(parseFloat(formData.sellingPrice || 0) * 100),
      gstRate: Number(formData.gstRate),
      reorderLevel: Number(formData.reorderLevel),
    };

    if (editingId) {
      await dispatch(productThunks.update({ id: editingId, data: submissionData }));
    } else {
      await dispatch(productThunks.create(submissionData));
    }
    closeModal();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      await dispatch(productThunks.remove(id));
    }
  };

  const openAdjustModal = (product) => {
    setAdjustData({ product: product._id, productName: product.name, stream: 'TAX', quantity: '', reason: '' });
    setShowAdjustModal(true);
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    await dispatch(adjustStock({
      product: adjustData.product,
      stream: adjustData.stream,
      quantity: Number(adjustData.quantity),
      reason: adjustData.reason,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Products Master</h1>
          <p className="text-slate-400 text-sm mt-1">Manage items, pricing, and categorizations.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/inventory/movements" className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm rounded-xl transition flex items-center gap-2">
            📋 Stock Ledger
          </Link>
          <Link to="/inventory/master" className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm rounded-xl transition flex items-center gap-2">
            🏷️ Categories
          </Link>
          <button onClick={() => openModal()} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2">
            <span>+</span> Add Product
          </button>
        </div>
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rose-400 text-lg">⚠️</span>
            <h3 className="text-sm font-bold text-rose-300">Low Stock Alerts ({lowStock.length} items)</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(item => (
              <div key={item._id} className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-rose-300 font-medium">{item.name}</span>
                <span className="text-rose-400/70 ml-2">
                  {item.totalStock} / {item.reorderLevel} {item.unitName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adjustSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          <p className="text-sm text-emerald-400">Stock adjusted successfully.</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Item Name / SKU</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category & Brand</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Selling Price</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-center">Current Stock</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {productsLoading && products.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">Loading products...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">No products found.</td>
                </tr>
              ) : (
                products.map((product) => {
                  const totalStock = (product.taxStock || 0) + (product.estimateStock || 0);
                  const isLow = totalStock < (product.reorderLevel ?? 10);
                  return (
                    <tr key={product._id} className={`hover:bg-slate-800/20 transition ${isLow ? 'bg-rose-500/5' : ''}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-200">{product.name}</p>
                          {isLow && <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">LOW</span>}
                        </div>
                        {product.sku && <p className="text-xs text-slate-500 font-mono mt-0.5">{product.sku}</p>}
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm text-slate-400">{product.category?.name || '—'}</p>
                        <p className="text-xs text-slate-500">{product.brand?.name || '—'}</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-sm font-medium text-emerald-400">₹{(product.sellingPrice / 100).toFixed(2)}</p>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded mt-1 inline-block">
                          GST: {product.gstRate}%
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className={`text-sm font-bold ${isLow ? 'text-rose-400' : 'text-white'}`}>{totalStock} {product.unit?.shortName}</span>
                          <div className="flex items-center gap-2 text-[10px] font-mono mt-0.5">
                            <span className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded">TAX: {product.taxStock || 0}</span>
                            <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">EST: {product.estimateStock || 0}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button onClick={() => openAdjustModal(product)} className="text-blue-400 hover:text-blue-300 text-sm font-medium mr-3 transition">Adjust</button>
                        <button onClick={() => openModal(product)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mr-3 transition">Edit</button>
                        <button onClick={() => handleDelete(product._id)} className="text-rose-400 hover:text-rose-300 text-sm font-medium transition">Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl my-8 relative">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10 rounded-t-3xl">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Edit Product' : 'Add Product'}</h2>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Product Name *</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">SKU / Item Code</label>
                  <input type="text" value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value.toUpperCase()})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">HSN Code</label>
                  <input type="text" value={formData.hsnCode} onChange={(e) => setFormData({...formData, hsnCode: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Category</label>
                  <select value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Brand</label>
                  <select value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Unit *</label>
                  <select required value={formData.unit} onChange={(e) => setFormData({...formData, unit: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="">Select Unit</option>
                    {units.map(u => <option key={u._id} value={u._id}>{u.name} ({u.shortName})</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">GST Rate (%)</label>
                  <select value={formData.gstRate} onChange={(e) => setFormData({...formData, gstRate: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="0">0% (Nil Rated)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Purchase Price (₹)</label>
                  <input type="number" step="0.01" min="0" value={formData.purchasePrice} onChange={(e) => setFormData({...formData, purchasePrice: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Selling Price (₹) *</label>
                  <input required type="number" step="0.01" min="0" value={formData.sellingPrice} onChange={(e) => setFormData({...formData, sellingPrice: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reorder Level</label>
                  <input type="number" min="0" value={formData.reorderLevel} onChange={(e) => setFormData({...formData, reorderLevel: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
                  <p className="text-[10px] text-slate-500 mt-1">Alert when total stock drops below this level.</p>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                  <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
                  <label htmlFor="isActive" className="text-sm text-slate-300 font-medium">Active Product</label>
                </div>

              </div>

              <div className="pt-6 mt-4 border-t border-slate-800 flex justify-end gap-3 sticky bottom-0 bg-slate-900 py-4 -mb-6 -mx-6 px-6 rounded-b-3xl z-10">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20">{editingId ? 'Update Product' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Adjust Stock</h2>
                <p className="text-xs text-slate-400 mt-0.5">{adjustData.productName}</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stream *</label>
                <select required value={adjustData.stream} onChange={(e) => setAdjustData({...adjustData, stream: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                  <option value="TAX">TAX Stream</option>
                  <option value="ESTIMATE">ESTIMATE Stream</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Adjustment Quantity *</label>
                <input required type="number" value={adjustData.quantity} onChange={(e) => setAdjustData({...adjustData, quantity: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none font-mono" placeholder="e.g. -5 for shrinkage, +10 for correction" />
                <p className="text-[10px] text-slate-500 mt-1">Use negative values for reductions (damage, shrinkage).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reason *</label>
                <textarea required rows="2" value={adjustData.reason} onChange={(e) => setAdjustData({...adjustData, reason: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none resize-none" placeholder="e.g. Damaged goods, Physical audit correction..." />
              </div>
              {inventoryError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">{inventoryError}</div>
              )}
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={adjustLoading} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20">{adjustLoading ? 'Processing...' : 'Apply Adjustment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
