import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSettings, updateSettings, clearSettingsError, resetUpdateSuccess, triggerBackup, clearBackupResult } from '../features/settingsSlice';

const Settings = () => {
  const dispatch = useDispatch();
  const { data, loading, error, updateSuccess, backupLoading, backupResult } = useSelector((state) => state.settings);
  const { user } = useSelector((state) => state.auth);
  
  const isAdmin = user?.role === 'Admin';

  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    gstin: '',
    stateCode: '24',
    phone: '',
    email: '',
    estimatePrefix: '',
    estimateNextNumber: 1,
    taxInvoicePrefix: '',
    taxInvoiceNextNumber: 1,
    salesReturnPrefix: '',
    salesReturnNextNumber: 1,
    purchaseReturnPrefix: '',
    purchaseReturnNextNumber: 1,
    receiptPrefix: '',
    receiptNextNumber: 1,
    paymentPrefix: '',
    paymentNextNumber: 1,
  });

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    if (data) {
      setFormData({
        companyName: data.companyName || '',
        address: data.address || '',
        gstin: data.gstin || '',
        stateCode: data.stateCode || '24',
        phone: data.phone || '',
        email: data.email || '',
        estimatePrefix: data.estimatePrefix || 'EST-',
        estimateNextNumber: data.estimateNextNumber || 1,
        taxInvoicePrefix: data.taxInvoicePrefix || 'INV-',
        taxInvoiceNextNumber: data.taxInvoiceNextNumber || 1,
        salesReturnPrefix: data.salesReturnPrefix || 'SR-',
        salesReturnNextNumber: data.salesReturnNextNumber || 1,
        purchaseReturnPrefix: data.purchaseReturnPrefix || 'PR-',
        purchaseReturnNextNumber: data.purchaseReturnNextNumber || 1,
        receiptPrefix: data.receiptPrefix || 'REC-',
        receiptNextNumber: data.receiptNextNumber || 1,
        paymentPrefix: data.paymentPrefix || 'PAY-',
        paymentNextNumber: data.paymentNextNumber || 1,
      });
    }
  }, [data]);

  useEffect(() => {
    if (updateSuccess) {
      const timer = setTimeout(() => {
        dispatch(resetUpdateSuccess());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [updateSuccess, dispatch]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    dispatch(updateSettings(formData));
  };

  const handleBackup = () => {
    if (!isAdmin) return;
    if (window.confirm("Are you sure you want to trigger a manual database backup to Google Drive now?")) {
      dispatch(triggerBackup());
    }
  };

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Company Settings</h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage your business details and sequential numbering prefixes.
          </p>
        </div>
        {!isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            ⚠️ View Only Mode (Admin required to edit)
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => dispatch(clearSettingsError())} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}

      {updateSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          <p className="text-sm text-emerald-400">Settings updated successfully.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Business Information Section */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20">
            <h2 className="text-lg font-semibold text-white">Business Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">This information will appear on your PDFs.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Company Name</label>
              <input
                type="text" name="companyName" value={formData.companyName} onChange={handleChange} disabled={!isAdmin} required
                className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition disabled:opacity-50"
              />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Address</label>
              <textarea
                name="address" value={formData.address} onChange={handleChange} disabled={!isAdmin} rows={3}
                className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition disabled:opacity-50 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">GSTIN</label>
              <input
                type="text" name="gstin" value={formData.gstin} onChange={handleChange} disabled={!isAdmin}
                className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition disabled:opacity-50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">State Code (2-digit)</label>
              <input
                type="text" name="stateCode" maxLength="2" value={formData.stateCode} onChange={handleChange} disabled={!isAdmin}
                className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition disabled:opacity-50 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">e.g. 24 = Gujarat. Used for CGST/SGST vs IGST calculation.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Phone</label>
              <input
                type="text" name="phone" value={formData.phone} onChange={handleChange} disabled={!isAdmin}
                className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Invoice Numbering Counters */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20">
            <h2 className="text-lg font-semibold text-white">Document Sequences</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configure prefixes and next counters for transactions.</p>
          </div>
          
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Document Type</th>
                  <th className="pb-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Prefix</th>
                  <th className="pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Next Number</th>
                  <th className="pb-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                
                {[
                  { label: 'Estimated Bill', prefix: 'estimatePrefix', next: 'estimateNextNumber' },
                  { label: 'Tax Invoice', prefix: 'taxInvoicePrefix', next: 'taxInvoiceNextNumber' },
                  { label: 'Sales Return', prefix: 'salesReturnPrefix', next: 'salesReturnNextNumber' },
                  { label: 'Purchase Return', prefix: 'purchaseReturnPrefix', next: 'purchaseReturnNextNumber' },
                  { label: 'Receipt Voucher', prefix: 'receiptPrefix', next: 'receiptNextNumber' },
                  { label: 'Payment Voucher', prefix: 'paymentPrefix', next: 'paymentNextNumber' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition">
                    <td className="py-4 text-sm font-medium text-slate-300">{row.label}</td>
                    <td className="py-4 px-4">
                      <input
                        type="text" name={row.prefix} value={formData[row.prefix]} onChange={handleChange} disabled={!isAdmin}
                        className="w-24 bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white outline-none transition disabled:opacity-50"
                      />
                    </td>
                    <td className="py-4">
                      <input
                        type="number" name={row.next} value={formData[row.next]} onChange={handleChange} disabled={!isAdmin} min="1"
                        className="w-24 bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white outline-none transition disabled:opacity-50"
                      />
                    </td>
                    <td className="py-4">
                      <span className="font-mono text-sm text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded">
                        {formData[row.prefix]}{String(formData[row.next]).padStart(4, '0')}
                      </span>
                    </td>
                  </tr>
                ))}
                
              </tbody>
            </table>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Save Changes
            </button>
          </div>
        )}

      </form>

      {/* System Backups Section (Admin Only) */}
      {isAdmin && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/20">
            <h2 className="text-lg font-semibold text-white">System Backups</h2>
            <p className="text-xs text-slate-400 mt-0.5">Automated backups run daily at 10 PM to Google Drive.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-200">Manual Cloud Backup</h3>
                <p className="text-xs text-slate-400 mt-1">Force an immediate full database snapshot to Google Drive.</p>
              </div>
              <button
                onClick={handleBackup}
                disabled={backupLoading}
                type="button"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2 border border-slate-700"
              >
                {backupLoading ? (
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>☁️</span>
                )}
                {backupLoading ? 'Backing up...' : 'Backup Now'}
              </button>
            </div>
            
            {backupResult && (
              <div className={`mt-4 p-3 rounded-lg border text-sm flex justify-between items-center ${backupResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <span>{backupResult.message}</span>
                <button onClick={() => dispatch(clearBackupResult())} className="opacity-70 hover:opacity-100">&times;</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
