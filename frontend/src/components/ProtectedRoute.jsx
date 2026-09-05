import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredPermissions = [] }) => {
  const { isAuthenticated, user, initialCheckDone, loading } = useSelector((state) => state.auth);
  const location = useLocation();

  if (!initialCheckDone || (loading && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Initializing KHM ERP...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermissions.length > 0 && user?.role !== 'Admin') {
    const hasPermission = requiredPermissions.every((perm) =>
      user?.permissions?.includes(perm)
    );
    if (!hasPermission) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6">
          <div className="max-w-md bg-white dark:bg-slate-800/80 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="w-12 h-12 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
              You do not have the required permissions to access this page. Please contact your KHM administrator.
            </p>
            <a
              href="/"
              className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      );
    }
  }

  return children;
};

export default ProtectedRoute;
