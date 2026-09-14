import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { ClipboardListIcon, TagIcon, AlertTriangleIcon, CheckIcon, PlusIcon, XIcon, SearchIcon } from '../components/icons';
import { productThunks, categoryThunks, brandThunks, unitThunks } from '../features/masterDataSlice';
import { adjustStock, resetAdjustSuccess, fetchLowStock } from '../features/inventorySlice';
import SearchableSelect from '../components/SearchableSelect';
import Pagination from '../components/Pagination';

const Products = () => {
  const dispatch = useDispatch();
  const { data: products, pagination, loading: productsLoading } = useSelector((state) => state.masterData.products);
  const { data: categories } = useSelector((state) => state.masterData.categories);
  const { data: brands } = useSelector((state) => state.masterData.brands);
  const { data: units } = useSelector((state) => state.masterData.units);
  const { lowStock, adjustLoading, adjustSuccess, error: inventoryError } = useSelector((state) => state.inventory);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState('');
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [adjustData, setAdjustData] = useState({ product: '', productName: '', stream: 'TAX', quantity: '', reason: '' });
  
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    specification: '',
    category: '',
    brand: '',
    unit: '',
    secondaryUnit: '',
    pricingBasis: 'PRIMARY',
    hsnCode: '',
    purchasePrice: '',
    sellingPrice: '',
    gstRate: 0,
    reorderLevel: 10,
    isActive: true,
  });

  useEffect(() => {
    dispatch(productThunks.fetchAll({ page, limit, search }));
  }, [dispatch, page, limit, search]);

  useEffect(() => {
    dispatch(categoryThunks.fetchAll());
    dispatch(brandThunks.fetchAll());
    dispatch(unitThunks.fetchAll());
    dispatch(fetchLowStock());
  }, [dispatch]);

  useEffect(() => {
    if (adjustSuccess) {
      setShowAdjustModal(false);
      dispatch(productThunks.fetchAll({ page, limit, search }));
      dispatch(fetchLowStock());
      const timer = setTimeout(() => dispatch(resetAdjustSuccess()), 3000);
      return () => clearTimeout(timer);
    }
  }, [adjustSuccess, dispatch, page, limit, search]);

  const openModal = (product = null) => {
    if (product) {
      setEditingId(product._id);
      setFormData({
        sku: product.sku || '',
        name: product.name,
        description: product.description || '',
        specification: product.specification || '',
        category: product.category?._id || '',
        brand: product.brand?._id || '',
        unit: product.unit?._id || '',
        secondaryUnit: product.secondaryUnit?._id || '',
        pricingBasis: product.pricingBasis || 'PRIMARY',
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
        sku: '', name: '', description: '', specification: '', category: '', brand: '', unit: '',
        secondaryUnit: '', pricingBasis: 'PRIMARY',
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
      // Optional refs: send null (not '') so backend ObjectId casting never fails.
      category: formData.category || null,
      brand: formData.brand || null,
      secondaryUnit: formData.secondaryUnit || null,
      pricingBasis: formData.secondaryUnit ? formData.pricingBasis : 'PRIMARY',
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
    dispatch(productThunks.fetchAll({ page, limit, search }));
    closeModal();
  };

  const handleDelete = async (id) => {
    setDeleteError('');
    if (window.confirm('Delete this product? This works only if it was never purchased or sold and its stock is zero. Otherwise use Edit to deactivate it instead.')) {
      try {
        await dispatch(productThunks.remove(id)).unwrap();
        dispatch(productThunks.fetchAll({ page, limit, search }));
      } catch (err) {
        setDeleteError(typeof err === 'string' ? err : 'Delete failed. The product may have purchase/sale history — deactivate it instead.');
      }
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Products Master</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1">Manage items, pricing, and categorizations.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Link to="/inventory/movements" className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 sm:gap-2">
            <ClipboardListIcon size={16} /> Stock Ledger
          </Link>
          <Link to="/inventory/master" className="px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-xs sm:text-sm rounded-xl transition flex items-center gap-1.5 sm:gap-2">
            <TagIcon size={16} /> Categories
          </Link>
          <button onClick={() => openModal()} className="px-4 sm:px-5 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-1.5 sm:gap-2">
            <PlusIcon size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Low Stock Alerts — collapsed to a single line with View more/less */}
      {lowStock.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-rose-600 dark:text-rose-400"><AlertTriangleIcon size={18} /></span>
              <h3 className="text-sm font-bold text-rose-600 dark:text-rose-300">Low Stock Alerts ({lowStock.length} items)</h3>
            </div>
            {lowStock.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAllLowStock((v) => !v)}
                className="shrink-0 text-xs font-semibold text-rose-600 dark:text-rose-300 hover:text-rose-500 dark:hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg px-3 py-1.5 transition"
              >
                {showAllLowStock ? 'Show less' : `View more (${lowStock.length})`}
              </button>
            )}
          </div>
          <div
            className={
              showAllLowStock
                ? 'flex flex-wrap gap-2'
                : 'flex flex-nowrap gap-2 overflow-hidden whitespace-nowrap'
            }
            style={showAllLowStock ? undefined : { maxHeight: '2.25rem' }}
            title={showAllLowStock ? undefined : 'Click View more to see all low stock items'}
          >
            {lowStock.map(item => (
              <div key={item._id} className="shrink-0 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-rose-600 dark:text-rose-300 font-medium">{item.name}</span>
                <span className="text-rose-500 dark:text-rose-400/70 ml-2">
                  {item.totalStock} / {item.reorderLevel} {item.unitName}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negative stock warning */}
      {products.some((p) => ((p.taxStock ?? 0) + (p.estimateStock ?? 0)) < 0) && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex gap-3">
          <span className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"><AlertTriangleIcon size={20} /></span>
          <div>
            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-300">
              Negative stock detected: {products.filter((p) => ((p.taxStock ?? 0) + (p.estimateStock ?? 0)) < 0).map((p) => `${p.name} (${(p.taxStock ?? 0) + (p.estimateStock ?? 0)})`).join(', ')}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              This predates the stock guards (or came from outside the bill flow). Open Stock Ledger filtered by the product to trace every movement, do a physical count, then correct it with Adjust — the correction is audit-logged.
            </p>
          </div>
        </div>
      )}

      {adjustSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <span className="text-emerald-600 dark:text-emerald-400"><CheckIcon size={16} /></span>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Stock adjusted successfully.</p>
        </div>
      )}

      {deleteError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3">
          <p className="text-sm text-rose-600 dark:text-rose-400">{deleteError}</p>
          <button onClick={() => setDeleteError('')} className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 shrink-0" title="Dismiss"><XIcon size={16} /></button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <SearchIcon size={16} />
          </span>
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium self-end sm:self-auto">
          <span>Items per page:</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white outline-none"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Table — one column per attribute */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[1550px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Item Name</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Specification</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">SKU</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Brand</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unit</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Secondary</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">HSN</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">GST %</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Purchase ₹</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Selling ₹</th>
                <th className="py-4 px-4 text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider text-right">TAX Stock</th>
                <th className="py-4 px-4 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-right">EST Stock</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Reorder</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {productsLoading && products.length === 0 ? (
                <tr>
                  <td colSpan="17" className="py-8 text-center text-slate-500 text-sm">Loading products...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="17" className="py-8 text-center text-slate-500 text-sm">No products found.</td>
                </tr>
              ) : (
                products.map((product) => {
                  const taxStock = product.taxStock ?? 0;
                  const estStock = product.estimateStock ?? 0;
                  const totalStock = taxStock + estStock;
                  const isLow = totalStock < (product.reorderLevel ?? 10);
                  const isNeg = totalStock < 0;
                  return (
                    <tr key={product._id} className={`hover:bg-slate-100 dark:hover:bg-slate-800/20 transition ${(isLow || isNeg) ? 'bg-rose-500/5' : ''}`}>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{product.name}</p>
                          {isLow && !isNeg && <span className="text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded font-bold">LOW</span>}
                          {isNeg && <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-bold">NEGATIVE</span>}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-500 font-medium">{product.specification || '—'}</td>
                      <td className="py-4 px-4 text-xs text-slate-500 font-mono">{product.sku || '—'}</td>
                      <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{product.category?.name || '—'}</td>
                      <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{product.brand?.name || '—'}</td>
                      <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">{product.unit ? `${product.unit.name || ''} (${product.unit.shortName || ''})` : '—'}</td>
                      <td className="py-4 px-4 text-sm text-slate-500 dark:text-slate-400">
                        {product.secondaryUnit ? `${product.secondaryUnit.shortName || ''} · per ${(product.pricingBasis || 'PRIMARY') === 'SECONDARY' ? (product.secondaryUnit.shortName || 'SEC') : (product.unit?.shortName || 'PRI')}` : '—'}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-500 font-mono">{product.hsnCode || '—'}</td>
                      <td className="py-4 px-4 text-sm text-right text-slate-600 dark:text-slate-300 font-mono">{product.gstRate ?? 0}%</td>
                      <td className="py-4 px-4 text-sm text-right text-slate-600 dark:text-slate-300 font-mono">₹{(product.purchasePrice / 100).toFixed(2)}</td>
                      <td className="py-4 px-4 text-sm text-right font-medium text-emerald-600 dark:text-emerald-400 font-mono">₹{(product.sellingPrice / 100).toFixed(2)}</td>
                      <td className="py-4 px-4 text-right" title={`Avg cost ₹${((product.averageCostTax || 0) / 100).toFixed(2)}`}>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-300 font-mono">{taxStock}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">avg ₹{((product.averageCostTax || 0) / 100).toFixed(2)}</span>
                      </td>
                      <td className="py-4 px-4 text-right" title={`Avg cost ₹${((product.averageCostEst || 0) / 100).toFixed(2)}`}>
                        <span className="text-sm font-bold text-amber-600 dark:text-amber-300 font-mono">{estStock}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">avg ₹{((product.averageCostEst || 0) / 100).toFixed(2)}</span>
                      </td>
                      <td className={`py-4 px-4 text-sm text-right font-bold font-mono ${isNeg || isLow ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{totalStock}</td>
                      <td className="py-4 px-4 text-sm text-right text-slate-500 font-mono">{product.reorderLevel ?? 10}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${product.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>
                          {product.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button onClick={() => openAdjustModal(product)} className="text-blue-600 dark:text-blue-400 hover:text-blue-300 text-sm font-medium mr-3 transition">Adjust</button>
                        <button onClick={() => openModal(product)} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-300 text-sm font-medium mr-3 transition">Edit</button>
                        <button onClick={() => handleDelete(product._id)} className="text-rose-600 dark:text-rose-400 hover:text-rose-300 text-sm font-medium transition">Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination pagination={pagination} onPageChange={(p) => setPage(p)} />
      </div>

      {/* Product Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl my-4 sm:my-8 relative max-h-[92vh] flex flex-col">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 rounded-t-2xl sm:rounded-t-3xl shrink-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Product' : 'Add Product'}</h2>
              <button type="button" onClick={closeModal} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg" title="Close"><XIcon size={18} /></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Product Name *</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Specification (prints on sales bills)</label>
                  <input type="text" value={formData.specification} onChange={(e) => setFormData({...formData, specification: e.target.value})} placeholder="e.g. 12mm chuck, 5m coil, 220V" className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">SKU / Item Code</label>
                  <input type="text" value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value.toUpperCase()})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">HSN Code</label>
                  <input type="text" value={formData.hsnCode} onChange={(e) => setFormData({...formData, hsnCode: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white font-mono outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Category</label>
                  <SearchableSelect
                    value={formData.category}
                    onChange={(val) => setFormData({...formData, category: val})}
                    placeholder="Search Category..."
                    options={categories.map(c => ({ value: c._id, label: c.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Brand</label>
                  <SearchableSelect
                    value={formData.brand}
                    onChange={(val) => setFormData({...formData, brand: val})}
                    placeholder="Search Brand..."
                    options={brands.map(b => ({ value: b._id, label: b.name }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Unit *</label>
                  <SearchableSelect
                    required
                    value={formData.unit}
                    onChange={(val) => setFormData({...formData, unit: val})}
                    placeholder="Search Unit..."
                    options={units.map(u => ({ value: u._id, label: `${u.name} (${u.shortName})` }))}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Primary / billing unit. Stock is counted in this unit.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Secondary Unit (optional)</label>
                  <SearchableSelect
                    value={formData.secondaryUnit}
                    onChange={(val) => setFormData({...formData, secondaryUnit: val, pricingBasis: val ? formData.pricingBasis : 'PRIMARY'})}
                    placeholder="None"
                    options={units.filter(u => u._id !== formData.unit).map(u => ({ value: u._id, label: `${u.name} (${u.shortName})` }))}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Measured unit (e.g. KG). Actual qty recorded per bill — no fixed conversion.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Priced Per</label>
                  <select value={formData.pricingBasis} disabled={!formData.secondaryUnit} onChange={(e) => setFormData({...formData, pricingBasis: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none disabled:opacity-50">
                    <option value="PRIMARY">Primary unit</option>
                    <option value="SECONDARY">Secondary unit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">GST Rate (%)</label>
                  <select value={formData.gstRate} onChange={(e) => setFormData({...formData, gstRate: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
                    <option value="0">0% (Nil Rated)</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                    <option value="28">28%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Purchase Price (₹)</label>
                  <input type="number" step="0.01" min="0" value={formData.purchasePrice} onChange={(e) => setFormData({...formData, purchasePrice: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Selling Price (₹) *</label>
                  <input required type="number" step="0.01" min="0" value={formData.sellingPrice} onChange={(e) => setFormData({...formData, sellingPrice: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reorder Level</label>
                  <input type="number" min="0" value={formData.reorderLevel} onChange={(e) => setFormData({...formData, reorderLevel: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none" />
                  <p className="text-[10px] text-slate-500 mt-1">Alert when total stock drops below this level.</p>
                </div>

                <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                  <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
                  <label htmlFor="isActive" className="text-sm text-slate-600 dark:text-slate-300 font-medium">Active Product</label>
                </div>

              </div>

              <div className="pt-4 sm:pt-6 mt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-slate-900 py-3 sm:py-4 -mb-4 sm:-mb-6 -mx-4 sm:-mx-6 px-4 sm:px-6 rounded-b-2xl sm:rounded-b-3xl z-10">
                <button type="button" onClick={closeModal} className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" className="px-5 sm:px-6 py-2 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-indigo-600/20">{editingId ? 'Update Product' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl my-4">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Adjust Stock</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[240px]">{adjustData.productName}</p>
              </div>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-lg" title="Close"><XIcon size={18} /></button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Stream *</label>
                <select required value={adjustData.stream} onChange={(e) => setAdjustData({...adjustData, stream: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none appearance-none">
                  <option value="TAX">TAX Stream</option>
                  <option value="ESTIMATE">ESTIMATE Stream</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Adjustment Quantity *</label>
                <input required type="number" value={adjustData.quantity} onChange={(e) => setAdjustData({...adjustData, quantity: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none font-mono" placeholder="e.g. -5 for shrinkage, +10 for correction" />
                <p className="text-[10px] text-slate-500 mt-1">Use negative values for reductions (damage, shrinkage).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reason *</label>
                <textarea required rows="2" value={adjustData.reason} onChange={(e) => setAdjustData({...adjustData, reason: e.target.value})} className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none resize-none" placeholder="e.g. Damaged goods, Physical audit correction..." />
              </div>
              {inventoryError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">{inventoryError}</div>
              )}
              <div className="pt-3 sm:pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowAdjustModal(false)} className="px-4 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={adjustLoading} className="px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-medium transition shadow-lg shadow-blue-600/20">{adjustLoading ? 'Processing...' : 'Apply Adjustment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
