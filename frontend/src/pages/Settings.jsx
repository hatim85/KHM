import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSettings, updateBusinessSettings, updateSequenceSettings, clearSettingsError, resetUpdateSuccess, triggerBackup, clearBackupResult } from '../features/settingsSlice';
import { GST_STATES } from '../utils/gstStates';
import { AlertTriangleIcon, CheckIcon, CloudUploadIcon, XIcon } from '../components/icons';

const getFinancialYearStart = (date = new Date()) => {
  const d = new Date(date);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
};

const SEQUENCE_ROWS = [
  { label: 'Tax Invoice', prefix: 'taxInvoicePrefix', next: 'taxInvoiceNextNumber', fy: 'taxInvoiceFY' },
  { label: 'Estimate', prefix: 'estimatePrefix', next: 'estimateNextNumber', fy: 'estimateFY' },
  { label: 'Sales Return', prefix: 'salesReturnPrefix', next: 'salesReturnNextNumber', fy: 'salesReturnFY' },
  { label: 'Purchase Return', prefix: 'purchaseReturnPrefix', next: 'purchaseReturnNextNumber', fy: 'purchaseReturnFY' },
  { label: 'Receipt Voucher', prefix: 'receiptPrefix', next: 'receiptNextNumber', fy: 'receiptFY' },
  { label: 'Payment Voucher', prefix: 'paymentPrefix', next: 'paymentNextNumber', fy: 'paymentFY' },
];

const fyPreview = (settings, row) => {
  const fy = getFinancialYearStart();
  const prefix = settings?.[row.prefix] || '';
  const storedFy = settings?.[row.fy];
  const next = storedFy === fy ? settings?.[row.next] || 1 : 1;
  return { fy, next, number: `${prefix}${fy}-${String(next).padStart(6, '0')}` };
};

const Settings = () => {
  const dispatch = useDispatch();
  const { data, loading, error, updateSuccess, backupLoading, backupResult } = useSelector((state) => state.settings);
  const { user } = useSelector((state) => state.auth);

  const isAdmin = user?.role === 'Admin';

  // --- Independent edit lifecycles (no global save) ---
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [editingSequences, setEditingSequences] = useState(false);
  const [savedSection, setSavedSection] = useState(null);

  const [businessForm, setBusinessForm] = useState({
    companyName: '', address: '', gstin: '', stateCode: '24', phone: '', email: '',
  });
  const [sequenceForm, setSequenceForm] = useState({});

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    if (data) {
      setBusinessForm({
        companyName: data.companyName || '',
        address: data.address || '',
        gstin: data.gstin || '',
        stateCode: data.stateCode || '24',
        phone: data.phone || '',
        email: data.email || '',
      });
      const seq = {};
      SEQUENCE_ROWS.forEach((row) => {
        seq[row.prefix] = data[row.prefix] || '';
        seq[row.next] = data[row.next] || 1;
      });
      setSequenceForm(seq);
    }
  }, [data]);

  useEffect(() => {
    if (updateSuccess) {
      const timer = setTimeout(() => {
        dispatch(resetUpdateSuccess());
        setSavedSection(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [updateSuccess, dispatch]);

  const handleBusinessChange = (e) => {
    const { name, value } = e.target;
    setBusinessForm((prev) => ({ ...prev, [name]: name === 'gstin' ? value.toUpperCase() : value }));
  };

  const handleSequenceChange = (e) => {
    const { name, value, type } = e.target;
    setSequenceForm((prev) => ({ ...prev, [name]: type === 'number' ? Number(value) : value.toUpperCase() }));
  };

  const cancelBusinessEdit = () => {
    if (!data) return;
    setBusinessForm({
      companyName: data.companyName || '',
      address: data.address || '',
      gstin: data.gstin || '',
      stateCode: data.stateCode || '24',
      phone: data.phone || '',
      email: data.email || '',
    });
    setEditingBusiness(false);
    dispatch(clearSettingsError());
  };

  const cancelSequenceEdit = () => {
    if (!data) return;
    const seq = {};
    SEQUENCE_ROWS.forEach((row) => {
      seq[row.prefix] = data[row.prefix] || '';
      seq[row.next] = data[row.next] || 1;
    });
    setSequenceForm(seq);
    setEditingSequences(false);
    dispatch(clearSettingsError());
  };

  const saveBusiness = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    const result = await dispatch(updateBusinessSettings(businessForm));
    if (!result.error) {
      setSavedSection('business');
      setEditingBusiness(false);
      dispatch(fetchSettings());
    }
  };

  const saveSequences = async (e) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!window.confirm('Document sequences are financial-critical. Changing prefixes or next numbers can cause numbering collisions. Are you sure you want to save these sequence changes?')) {
      return;
    }
    const result = await dispatch(updateSequenceSettings(sequenceForm));
    if (!result.error) {
      setSavedSection('sequences');
      setEditingSequences(false);
      dispatch(fetchSettings());
    }
  };

  const handleBackup = () => {
    if (!isAdmin) return;
    if (window.confirm('Are you sure you want to trigger a manual database backup to Google Drive now?')) {
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

  const inputClass = (editable) =>
    `w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition ${editable ? '' : 'opacity-70'}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Company Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Business details and document sequences are managed independently.
          </p>
        </div>
        {!isAdmin && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2">
            <AlertTriangleIcon size={16} /> View Only Mode (Admin required to edit)
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-between">
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => dispatch(clearSettingsError())} className="text-red-400 hover:text-red-300" title="Dismiss"><XIcon size={16} /></button>
        </div>
      )}

      {updateSuccess && savedSection === 'business' && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <CheckIcon size={16} className="text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Business details saved successfully.</p>
        </div>
      )}

      {updateSuccess && savedSection === 'sequences' && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
          <CheckIcon size={16} className="text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Document sequences saved successfully.</p>
        </div>
      )}

      {/* ============ SECTION A: BUSINESS DETAILS ============ */}
      <form onSubmit={saveBusiness} className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Business Details</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">This information will appear on your PDFs.</p>
          </div>
          {isAdmin && !editingBusiness && (
            <button type="button" onClick={() => setEditingBusiness(true)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl transition border border-slate-300 dark:border-slate-700">
              Edit Business Details
            </button>
          )}
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Company Name</label>
            <input
              type="text" name="companyName" value={businessForm.companyName} onChange={handleBusinessChange} disabled={!editingBusiness} required
              className={inputClass(editingBusiness)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Address</label>
            <textarea
              name="address" value={businessForm.address} onChange={handleBusinessChange} disabled={!editingBusiness} rows={3}
              className={`${inputClass(editingBusiness)} resize-none`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">GSTIN</label>
            <input
              type="text" name="gstin" value={businessForm.gstin} onChange={handleBusinessChange} disabled={!editingBusiness}
              placeholder="e.g. 24ABCDE1234F1Z5"
              className={`${inputClass(editingBusiness)} font-mono`}
            />
            <p className="text-[10px] text-slate-500 mt-1">Optional. Leave blank if unregistered.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">State</label>
            <select
              name="stateCode" value={businessForm.stateCode} onChange={handleBusinessChange} disabled={!editingBusiness}
              className={inputClass(editingBusiness)}
            >
              {GST_STATES.map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">Used for CGST/SGST vs IGST calculation.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Phone</label>
            <input
              type="text" name="phone" value={businessForm.phone} onChange={handleBusinessChange} disabled={!editingBusiness}
              className={inputClass(editingBusiness)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Email</label>
            <input
              type="email" name="email" value={businessForm.email} onChange={handleBusinessChange} disabled={!editingBusiness}
              className={inputClass(editingBusiness)}
            />
          </div>
        </div>
        {isAdmin && editingBusiness && (
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button type="button" onClick={cancelBusinessEdit} className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl transition border border-slate-300 dark:border-slate-700">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Save Changes
            </button>
          </div>
        )}
      </form>

      {/* ============ SECTION B: DOCUMENT SEQUENCES ============ */}
      <form onSubmit={saveSequences} className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Document Sequences</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Financial-year numbering. Admin-only. Numbers are never reused.</p>
          </div>
          {isAdmin && !editingSequences && (
            <button type="button" onClick={() => setEditingSequences(true)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl transition border border-slate-300 dark:border-slate-700">
              Edit Document Sequences
            </button>
          )}
        </div>

        {!isAdmin && (
          <div className="px-6 pt-4">
            <p className="text-xs text-slate-500">Sequence configuration is view-only for your role. Contact an administrator to change it.</p>
          </div>
        )}

        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Type</th>
                <th className="pb-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prefix</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">FY / Next</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {SEQUENCE_ROWS.map((row) => {
                const preview = fyPreview({ ...data, ...sequenceForm }, row);
                return (
                  <tr key={row.prefix} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 text-sm font-medium text-slate-600 dark:text-slate-300">{row.label}</td>
                    <td className="py-4 px-4">
                      <input
                        type="text" name={row.prefix} value={sequenceForm[row.prefix] ?? ''} onChange={handleSequenceChange} disabled={!editingSequences}
                        className="w-24 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none transition disabled:opacity-70 font-mono"
                      />
                    </td>
                    <td className="py-4">
                      {editingSequences ? (
                        <input
                          type="number" name={row.next} value={sequenceForm[row.next] ?? 1} onChange={handleSequenceChange} disabled={!editingSequences} min="1"
                          className="w-28 bg-white dark:bg-slate-950/60 border border-amber-500/40 focus:border-amber-500 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none transition font-mono"
                        />
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">FY {preview.fy} · Next {preview.next}</span>
                      )}
                    </td>
                    <td className="py-4">
                      <span className="font-mono text-sm text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded">
                        {preview.number}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editingSequences && (
            <p className="text-xs text-amber-400/90 mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
              <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
              <span>Sensitive operation: changing a prefix or lowering a next number can cause collisions. Saving requires confirmation and is audit-logged.</span>
            </p>
          )}
        </div>

        {isAdmin && editingSequences && (
          <div className="px-6 pb-6 flex justify-end gap-3">
            <button type="button" onClick={cancelSequenceEdit} className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl transition border border-slate-300 dark:border-slate-700">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-amber-600/30 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Save Sequence Changes
            </button>
          </div>
        )}
      </form>

      {/* System Backups Section (Admin Only) */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden mt-8">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">System Backups</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Automated backups run daily at 10 PM to Google Drive.</p>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">Manual Cloud Backup</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Force an immediate full database snapshot to Google Drive.</p>
              </div>
              <button
                onClick={handleBackup}
                disabled={backupLoading}
                type="button"
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2 border border-slate-300 dark:border-slate-700"
              >
                {backupLoading ? (
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <CloudUploadIcon size={16} />
                )}
                {backupLoading ? 'Backing up...' : 'Backup Now'}
              </button>
            </div>

            {backupResult && (
              <div className={`mt-4 p-3 rounded-lg border text-sm flex justify-between items-center ${backupResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <span>{backupResult.message}</span>
                <button onClick={() => dispatch(clearBackupResult())} className="opacity-70 hover:opacity-100" title="Dismiss"><XIcon size={16} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
