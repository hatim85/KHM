import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../features/authSlice';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/', icon: '📊' },
    {
      label: 'Sales',
      children: [
        { label: 'Estimated Bills', path: '/sales/estimate' },
        { label: 'Tax Invoices (GST)', path: '/sales/tax' },
      ],
      icon: '💼',
    },
    {
      label: 'Purchases',
      children: [
        { label: 'Purchase Bills', path: '/purchases' },
      ],
      icon: '🛒',
    },
    {
      label: 'Inventory',
      children: [
        { label: 'Products', path: '/inventory' },
        { label: 'Stock Movements', path: '/inventory/movements' },
        { label: 'Categories & Brands', path: '/inventory/master' },
      ],
      icon: '📦',
    },
    { label: 'Customers', path: '/customers', icon: '👥' },
    { label: 'Suppliers', path: '/suppliers', icon: '🏭' },
    { label: 'Payments', path: '/payments', icon: '💳' },
    { label: 'Expenses', path: '/expenses', icon: '💸' },
    { label: 'Reports', path: '/reports', icon: '📈' },
    { label: 'Audit Logs', path: '/audit', icon: '🛡️' },
    { label: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold text-center tracking-wide flex items-center justify-center gap-2">
          <span>⚠️ Offline Mode Active</span>
          <span className="font-normal opacity-90">&bull; Changes will be queued locally</span>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'w-64' : 'w-20'
          } transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0`}
        >
          {/* Brand header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30">
                K
              </div>
              {sidebarOpen && (
                <div className="flex flex-col">
                  <span className="font-bold text-base text-white tracking-tight leading-none">
                    KHM
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                    Accounts ERP
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
              title="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {navItems.map((item, idx) => (
              <div key={idx}>
                {item.children ? (
                  <div className="py-1">
                    {sidebarOpen && (
                      <div className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    )}
                    <div className="space-y-0.5 mt-1">
                      {item.children.map((sub, sIdx) => (
                        <NavLink
                          key={sIdx}
                          to={sub.path}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                              isActive
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                            }`
                          }
                        >
                          <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                          {sidebarOpen && <span>{sub.label}</span>}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ) : (
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`
                    }
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    {sidebarOpen && <span>{item.label}</span>}
                  </NavLink>
                )}
              </div>
            ))}
          </nav>

          {/* User profile footer */}
          <div className="p-3 border-t border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                {sidebarOpen && (
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
                    <span className="inline-block text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-medium mt-0.5">
                      {user?.role}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition shrink-0"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-slate-950">
          {/* Topbar */}
          <header className="h-16 border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">KHM Wholesale &amp; Trading ERP</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>System Online</span>
              </div>
            </div>
          </header>

          {/* Child routes */}
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
