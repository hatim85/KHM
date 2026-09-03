import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { customerThunks } from '../features/masterDataSlice';

const Customers = () => {
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((state) => state.masterData.customers);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    gstin: '',
    stateCode: '24',
    phone: '',
    email: '',
    address: '',
    isActive: true,
  });

  useEffect(() => {
    dispatch(customerThunks.fetchAll());
  }, [dispatch]);

  const openModal = (customer = null) => {
    if (customer) {
      setEditingId(customer._id);
      setFormData({
        name: customer.name,
        gstin: customer.gstin || '',
        stateCode: customer.stateCode || '24',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        isActive: customer.isActive,
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', gstin: '', stateCode: '24', phone: '', email: '', address: '', isActive: true });
    }
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingId) {
      await dispatch(customerThunks.update({ id: editingId, data: formData }));
    } else {
      await dispatch(customerThunks.create(formData));
    }
    closeModal();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      await dispatch(customerThunks.remove(id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Customers</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your customer database and GSTINs.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2"
        >
          <span>+</span> Add Customer
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Contact</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">GSTIN</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading && data.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">Loading customers...</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500 text-sm">No customers found.</td>
                </tr>
              ) : (
                data.map((customer) => (
                  <tr key={customer._id} className="hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6">
                      <p className="text-sm font-medium text-slate-200">{customer.name}</p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="text-sm text-slate-400">{customer.phone || '—'}</p>
                      <p className="text-xs text-slate-500">{customer.email}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-mono text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded">
                        {customer.gstin || 'UNREGISTERED'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${customer.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <Link to={`/ledger/customer/${customer._id}?name=${encodeURIComponent(customer.name)}`} className="text-emerald-400 hover:text-emerald-300 text-sm font-medium mr-4 transition">Ledger</Link>
                      <button onClick={() => openModal(customer)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mr-4 transition">Edit</button>
                      <button onClick={() => handleDelete(customer._id)} className="text-rose-400 hover:text-rose-300 text-sm font-medium transition">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editingId ? 'Edit Customer' : 'Add Customer'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer Name *</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">GSTIN</label>
                  <input type="text" value={formData.gstin} onChange={(e) => setFormData({...formData, gstin: e.target.value.toUpperCase()})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">State Code</label>
                  <input type="text" maxLength="2" value={formData.stateCode} onChange={(e) => setFormData({...formData, stateCode: e.target.value})} placeholder="e.g. 24" className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" />
                  <p className="text-[10px] text-slate-500 mt-1">2-digit GST State Code (e.g. 24=Gujarat)</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Phone</label>
                <input type="text" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Address</label>
                <textarea rows="2" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none resize-none"></textarea>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isActive" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="isActive" className="text-sm text-slate-300 font-medium">Active Customer</label>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="px-5 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={loading} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20">{loading ? 'Saving...' : 'Save Customer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
