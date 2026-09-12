import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchSettings, fetchSequencePreview, updateBusinessSettings, updateSequenceSettings, clearSettingsError, resetUpdateSuccess, triggerBackup, clearBackupResult, fetchDriveStatus, testDriveConnection, clearDriveTestResult } from '../features/settingsSlice';
import { GST_STATES } from '../utils/gstStates';
import { AlertTriangleIcon, CheckIcon, CloudUploadIcon, XIcon } from '../components/icons';
import UserManagement from '../components/UserManagement';
import { useSearchParams } from 'react-router-dom';

// Backend document-type keys (PREFIX-FYMMDD-SEQ, per-day 001–999 series).
const SEQUENCE_ROWS = [
  { key: 'TAX', label: 'Tax Invoice', prefix: 'taxInvoicePrefix' },
  { key: 'SUPPLY', label: 'Bill of Supply (0% GST)', prefix: 'supplyPrefix' },
  { key: 'ESTIMATE', label: 'Estimate', prefix: 'estimatePrefix' },
  { key: 'SALES_RETURN', label: 'Sales Return', prefix: 'salesReturnPrefix' },
  { key: 'PURCHASE_RETURN', label: 'Purchase Return', prefix: 'purchaseReturnPrefix' },
  { key: 'CREDIT_NOTE', label: 'Credit Note', prefix: 'creditNotePrefix' },
  { key: 'DEBIT_NOTE', label: 'Debit Note', prefix: 'debitNotePrefix' },
  { key: 'RECEIPT', label: 'Receipt Voucher', prefix: 'receiptPrefix' },
  { key: 'PAYMENT', label: 'Payment Voucher', prefix: 'paymentPrefix' },
];

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

const Settings = () => {
  const dispatch = useDispatch();
  const { data, loading, error, updateSuccess, backupLoading, backupResult, sequencePreview, previewLoading, driveStatus, driveStatusLoading, testResult, testLoading } = useSelector((state) => state.settings);
  const { user } = useSelector((state) => state.auth);
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = user?.role === 'Admin';

  // --- Independent edit lifecycles (no global save) ---
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [editingSequences, setEditingSequences] = useState(false);
  const [savedSection, setSavedSection] = useState(null);

  const [businessForm, setBusinessForm] = useState({
    companyName: '', address: '', gstin: '', stateCode: '24', phone: '', email: '', timezone: 'Asia/Kolkata',
  });
  const [sequenceForm, setSequenceForm] = useState({});

  useEffect(() => {
    dispatch(fetchSettings());
    dispatch(fetchSequencePreview());
    if (isAdmin) dispatch(fetchDriveStatus());
  }, [dispatch, isAdmin]);

  // Handle ?google=connected redirect from OAuth callback
  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      dispatch(fetchDriveStatus());
      searchParams.delete('google');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, dispatch]);

  useEffect(() => {
    if (data) {
      setBusinessForm({
        companyName: data.companyName || '',
        address: data.address || '',
        gstin: data.gstin || '',
        stateCode: data.stateCode || '24',
        phone: data.phone || '',
        email: data.email || '',
        timezone: data.timezone || 'Asia/Kolkata',
      });
      const seq = {};
      SEQUENCE_ROWS.forEach((row) => {
        seq[row.prefix] = data[row.prefix] || '';
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
    const { name, value } = e.target;
    setSequenceForm((prev) => ({ ...prev, [name]: value.toUpperCase() }));
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
      timezone: data.timezone || 'Asia/Kolkata',
    });
    setEditingBusiness(false);
    dispatch(clearSettingsError());
  };

  const cancelSequenceEdit = () => {
    if (!data) return;
    const seq = {};
    SEQUENCE_ROWS.forEach((row) => {
      seq[row.prefix] = data[row.prefix] || '';
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
    if (!window.confirm('Document series prefixes are financial-critical. Changing a prefix starts a fresh independent daily series. Are you sure you want to save these series changes?')) {
      return;
    }
    const result = await dispatch(updateSequenceSettings(sequenceForm));
    if (!result.error) {
      setSavedSection('sequences');
      setEditingSequences(false);
      dispatch(fetchSettings());
      dispatch(fetchSequencePreview());
    }
  };

  const handleBackup = () => {
    if (!isAdmin) return;
    if (window.confirm('Are you sure you want to trigger a manual database backup to Google Drive now?')) {
      dispatch(triggerBackup());
    }
  };

  const handleTestConnection = () => {
    dispatch(clearDriveTestResult());
    dispatch(testDriveConnection());
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

  // Drive status badge rendering
  const renderDriveStatusBadge = () => {
    if (driveStatusLoading) {
      return (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm">Checking...</span>
        </div>
      );
    }
    if (!driveStatus) return null;

    if (driveStatus.status === 'connected') {
      return (
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Connected</span>
        </div>
      );
    }
    if (driveStatus.status === 'auth_required') {
      return (
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></div>
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">Authorization Required</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Not Connected</span>
      </div>
    );
  };

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
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Business Details</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">This information will appear on your PDFs.</p>
          </div>
          {isAdmin && !editingBusiness && (
            <button type="button" onClick={() => setEditingBusiness(true)} className="w-full sm:w-auto px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl transition border border-slate-300 dark:border-slate-700 text-center">
              Edit Business Details
            </button>
          )}
        </div>
        <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
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

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-2">Business Timezone</label>
            <select
              name="timezone" value={businessForm.timezone} onChange={handleBusinessChange} disabled={!editingBusiness}
              className={`${inputClass(editingBusiness)} font-mono`}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">Drives document dates, financial year and daily sequences.</p>
          </div>
        </div>
        {isAdmin && editingBusiness && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <button type="button" onClick={cancelBusinessEdit} className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl transition border border-slate-300 dark:border-slate-700 text-center">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Save Changes
            </button>
          </div>
        )}
      </form>

      {/* ============ SECTION B: DOCUMENT SEQUENCES ============ */}
      <form onSubmit={saveSequences} className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Document Sequences</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Production format PREFIX-FYMMDD-SEQ (e.g. INV-26270906-001). Per-day series 001–999. Numbers are never reused.</p>
          </div>
          {isAdmin && !editingSequences && (
            <button type="button" onClick={() => setEditingSequences(true)} className="w-full sm:w-auto px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl transition border border-slate-300 dark:border-slate-700 text-center">
              Edit Series Prefixes
            </button>
          )}
        </div>

        {!isAdmin && (
          <div className="px-4 sm:px-6 pt-4">
            <p className="text-xs text-slate-500">Sequence configuration is view-only for your role. Contact an administrator to change it.</p>
          </div>
        )}

        <div className="p-4 sm:p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[620px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Document Type</th>
                <th className="pb-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prefix</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">FY</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Next</th>
                <th className="pb-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {SEQUENCE_ROWS.map((row) => {
                const live = sequencePreview?.[row.key];
                const prefix = editingSequences ? (sequenceForm[row.prefix] ?? '') : (live?.prefix ?? data?.[row.prefix] ?? '');
                return (
                  <tr key={row.key} className="hover:bg-slate-100 dark:hover:bg-slate-800/20 transition">
                    <td className="py-4 text-sm font-medium text-slate-600 dark:text-slate-300">{row.label}</td>
                    <td className="py-4 px-4">
                      <input
                        type="text" name={row.prefix} value={prefix} onChange={handleSequenceChange} disabled={!editingSequences}
                        className="w-24 bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white outline-none transition disabled:opacity-70 font-mono"
                      />
                    </td>
                    <td className="py-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{live ? `${live.fyLabel} (${live.fyCode})` : '—'}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{live?.mmdd ?? '—'}</span>
                    </td>
                    <td className="py-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{live ? String(live.nextSeq).padStart(3, '0') : '—'}</span>
                    </td>
                    <td className="py-4">
                      {previewLoading && !live ? (
                        <span className="text-xs text-slate-500 font-mono">…</span>
                      ) : live?.exhausted ? (
                        <span className="font-mono text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-1 rounded">Series exhausted — new prefix required</span>
                      ) : (
                        <span className="font-mono text-sm text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded">
                          {live?.preview ?? '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editingSequences && (
            <p className="text-xs text-amber-400/90 mt-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5">
              <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
              <span>Sensitive operation: changing a prefix starts a fresh independent daily series from 001. Daily sequences (001–999) are automatic and never hand-edited or reused. Saving requires confirmation and is audit-logged.</span>
            </p>
          )}
        </div>

        {isAdmin && editingSequences && (
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <button type="button" onClick={cancelSequenceEdit} className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold rounded-xl transition border border-slate-300 dark:border-slate-700 text-center">
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-amber-600/30 active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
              Save Sequence Changes
            </button>
          </div>
        )}
      </form>

      {/* ============ SECTION C: SYSTEM BACKUPS ============ */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/20 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">System Backups</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Automated backups run daily at 10 PM to Google Drive.</p>
            </div>
            {renderDriveStatusBadge()}
          </div>
          <div className="p-6 space-y-5">
            {/* Auth Required Warning */}
            {driveStatus?.status === 'auth_required' && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertTriangleIcon size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Google Drive Authorization Required</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">{driveStatus.message}</p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">Automated backups will fail until you reconnect. Click the button below to re-authorize.</p>
                </div>
              </div>
            )}

            {driveStatus?.status === 'not_configured' && (
              <div className="p-4 rounded-xl bg-slate-500/10 border border-slate-500/30 flex items-start gap-3">
                <AlertTriangleIcon size={18} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Google Drive Not Connected</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{driveStatus.message}</p>
                </div>
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Backup Now Button */}
              <button
                onClick={handleBackup}
                disabled={backupLoading || driveStatus?.status !== 'connected'}
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

              {/* Reconnect / Connect Google Drive */}
              {(driveStatus?.status === 'auth_required' || driveStatus?.status === 'not_configured') && (
                <a
                  href="/api/settings/google/auth"
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 shadow-md shadow-blue-600/20"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"/></svg>
                  {driveStatus?.status === 'auth_required' ? 'Reconnect Google Drive' : 'Connect Google Drive'}
                </a>
              )}

              {/* Test Connection Button */}
              {driveStatus?.status === 'connected' && (
                <button
                  onClick={handleTestConnection}
                  disabled={testLoading}
                  type="button"
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium rounded-lg transition disabled:opacity-50 flex items-center gap-2 border border-emerald-500/30"
                >
                  {testLoading ? (
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <CheckIcon size={16} />
                  )}
                  {testLoading ? 'Testing...' : 'Test Connection'}
                </button>
              )}

              {/* Refresh Status */}
              <button
                onClick={() => dispatch(fetchDriveStatus())}
                disabled={driveStatusLoading}
                type="button"
                className="px-3 py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm transition disabled:opacity-50"
                title="Refresh status"
              >
                ↻ Refresh
              </button>
            </div>

            {/* Backup Result */}
            {backupResult && (
              <div className={`p-3 rounded-lg border text-sm flex justify-between items-center ${backupResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <span>{backupResult.message}</span>
                <button onClick={() => dispatch(clearBackupResult())} className="opacity-70 hover:opacity-100" title="Dismiss"><XIcon size={16} /></button>
              </div>
            )}

            {/* Test Connection Result */}
            {testResult && (
              <div className={`p-4 rounded-xl border text-sm ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                {testResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckIcon size={16} className="text-emerald-500" />
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">Connection Successful</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                      <div className="bg-white/5 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Drive Account</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5">{testResult.driveUser}</p>
                      </div>
                      <div className="bg-white/5 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Backup Files</p>
                        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-0.5">{testResult.backupCount} found</p>
                      </div>
                      {testResult.lastBackup && (
                        <div className="bg-white/5 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Last Backup</p>
                          <p className="text-xs font-mono text-slate-700 dark:text-slate-300 mt-0.5">{new Date(testResult.lastBackup.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                          <p className="text-[10px] text-slate-500">{testResult.lastBackup.sizeMB} MB</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <XIcon size={16} />
                    <span>{testResult.error}</span>
                  </div>
                )}
                <button onClick={() => dispatch(clearDriveTestResult())} className="mt-2 text-xs text-slate-500 hover:text-slate-400">Dismiss</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Management Section (Admin Only) */}
      <UserManagement />
    </div>
  );
};

export default Settings;
