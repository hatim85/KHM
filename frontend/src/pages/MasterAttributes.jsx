import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { categoryThunks, brandThunks, unitThunks } from '../features/masterDataSlice';

const MasterAttributes = () => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'brands' | 'units'
  const [search, setSearch] = useState('');

  // Redux state
  const categories = useSelector((state) => state.masterData.categories);
  const brands = useSelector((state) => state.masterData.brands);
  const units = useSelector((state) => state.masterData.units);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form states
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', isActive: true });
  const [brandForm, setBrandForm] = useState({ name: '', isActive: true });
  const [unitForm, setUnitForm] = useState({ name: '', shortName: '', isActive: true });

  useEffect(() => {
    dispatch(categoryThunks.fetchAll());
    dispatch(brandThunks.fetchAll());
    dispatch(unitThunks.fetchAll());
  }, [dispatch]);

  const openModal = (item = null) => {
    setEditingItem(item);
    if (activeTab === 'categories') {
      setCategoryForm(
        item
          ? { name: item.name, description: item.description || '', isActive: item.isActive ?? true }
          : { name: '', description: '', isActive: true }
      );
    } else if (activeTab === 'brands') {
      setBrandForm(
        item
          ? { name: item.name, isActive: item.isActive ?? true }
          : { name: '', isActive: true }
      );
    } else if (activeTab === 'units') {
      setUnitForm(
        item
          ? { name: item.name, shortName: item.shortName || '', isActive: item.isActive ?? true }
          : { name: '', shortName: '', isActive: true }
      );
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (activeTab === 'categories') {
      if (editingItem) {
        await dispatch(categoryThunks.update({ id: editingItem._id, data: categoryForm }));
      } else {
        await dispatch(categoryThunks.create(categoryForm));
      }
    } else if (activeTab === 'brands') {
      if (editingItem) {
        await dispatch(brandThunks.update({ id: editingItem._id, data: brandForm }));
      } else {
        await dispatch(brandThunks.create(brandForm));
      }
    } else if (activeTab === 'units') {
      if (editingItem) {
        await dispatch(unitThunks.update({ id: editingItem._id, data: unitForm }));
      } else {
        await dispatch(unitThunks.create(unitForm));
      }
    }
    closeModal();
  };

  const handleDelete = async (id, name) => {
    const label = activeTab === 'categories' ? 'category' : activeTab === 'brands' ? 'brand' : 'unit';
    if (window.confirm(`Are you sure you want to delete ${label} "${name}"?`)) {
      if (activeTab === 'categories') {
        await dispatch(categoryThunks.remove(id));
      } else if (activeTab === 'brands') {
        await dispatch(brandThunks.remove(id));
      } else if (activeTab === 'units') {
        await dispatch(unitThunks.remove(id));
      }
    }
  };

  // Filter items based on active tab and search
  const currentList =
    activeTab === 'categories'
      ? categories.data.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
        )
      : activeTab === 'brands'
      ? brands.data.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
      : units.data.filter(
          (u) =>
            u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.shortName.toLowerCase().includes(search.toLowerCase())
        );

  const currentLoading =
    activeTab === 'categories'
      ? categories.loading
      : activeTab === 'brands'
      ? brands.loading
      : units.loading;

  const currentError =
    activeTab === 'categories'
      ? categories.error
      : activeTab === 'brands'
      ? brands.error
      : units.error;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Master Data Attributes</h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure product categories, brands, and units of measurement.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2 self-start sm:self-auto"
        >
          <span>+</span>{' '}
          {activeTab === 'categories'
            ? 'Add Category'
            : activeTab === 'brands'
            ? 'Add Brand'
            : 'Add Unit'}
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => {
            setActiveTab('categories');
            setSearch('');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
            activeTab === 'categories'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>📂 Categories</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {categories.data.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('brands');
            setSearch('');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
            activeTab === 'brands'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>🏷️ Brands</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {brands.data.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('units');
            setSearch('');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${
            activeTab === 'units'
              ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>📏 Units of Measure</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {units.data.length}
          </span>
        </button>
      </div>

      {/* Search Filter */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-xs text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {currentError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {currentError}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Name
                </th>
                {activeTab === 'categories' && (
                  <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Description
                  </th>
                )}
                {activeTab === 'units' && (
                  <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Short Code
                  </th>
                )}
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {currentLoading && currentList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">
                    Loading {activeTab}...
                  </td>
                </tr>
              ) : currentList.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">
                    No {activeTab} found. Click &quot;Add {activeTab.slice(0, -1)}&quot; to create one.
                  </td>
                </tr>
              ) : (
                currentList.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm font-semibold text-white">
                      {item.name}
                    </td>

                    {activeTab === 'categories' && (
                      <td className="py-4 px-6 text-sm text-slate-400 max-w-xs truncate">
                        {item.description || '—'}
                      </td>
                    )}

                    {activeTab === 'units' && (
                      <td className="py-4 px-6 text-sm font-mono text-indigo-400">
                        {item.shortName}
                      </td>
                    )}

                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          item.isActive
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => openModal(item)}
                        className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mr-4 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item._id, item.name)}
                        className="text-rose-400 hover:text-rose-300 text-sm font-medium transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editingItem ? 'Edit' : 'Add'}{' '}
                {activeTab === 'categories' ? 'Category' : activeTab === 'brands' ? 'Brand' : 'Unit'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Common Name Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Name *
                </label>
                <input
                  required
                  type="text"
                  value={
                    activeTab === 'categories'
                      ? categoryForm.name
                      : activeTab === 'brands'
                      ? brandForm.name
                      : unitForm.name
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === 'categories') setCategoryForm({ ...categoryForm, name: val });
                    else if (activeTab === 'brands') setBrandForm({ ...brandForm, name: val });
                    else setUnitForm({ ...unitForm, name: val });
                  }}
                  className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  placeholder={
                    activeTab === 'categories'
                      ? 'e.g. Electrical, Hardware'
                      : activeTab === 'brands'
                      ? 'e.g. Havells, Polycab'
                      : 'e.g. Kilogram, Piece, Box'
                  }
                />
              </div>

              {/* Category Specific: Description */}
              {activeTab === 'categories' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <textarea
                    rows="3"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none resize-none"
                    placeholder="Brief description of the category..."
                  />
                </div>
              )}

              {/* Unit Specific: Short Name */}
              {activeTab === 'units' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Short Code (Abbreviation) *
                  </label>
                  <input
                    required
                    type="text"
                    value={unitForm.shortName}
                    onChange={(e) => setUnitForm({ ...unitForm, shortName: e.target.value })}
                    className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none"
                    placeholder="e.g. kg, pcs, box, mtr"
                  />
                </div>
              )}

              {/* Common Active Status Toggle */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={
                    activeTab === 'categories'
                      ? categoryForm.isActive
                      : activeTab === 'brands'
                      ? brandForm.isActive
                      : unitForm.isActive
                  }
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (activeTab === 'categories') setCategoryForm({ ...categoryForm, isActive: checked });
                    else if (activeTab === 'brands') setBrandForm({ ...brandForm, isActive: checked });
                    else setUnitForm({ ...unitForm, isActive: checked });
                  }}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isActiveToggle" className="text-sm font-medium text-slate-300 select-none">
                  Active in System
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={currentLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {currentLoading ? 'Saving...' : editingItem ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterAttributes;
