import React from 'react';

const Popup = ({ isOpen, message, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          {type === 'confirm' ? 'Confirm Action' : 'Notification'}
        </h3>
        <p className="text-slate-600 dark:text-slate-300 mb-6 whitespace-pre-wrap">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          {type === 'confirm' && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
          >
            {type === 'confirm' ? 'Proceed' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;
