import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../features/authSlice';
import { useTheme } from '../hooks/useTheme';
import {
  LayoutDashboardIcon, FileTextIcon, ReceiptIcon, ShoppingCartIcon, PackageIcon,
  UsersIcon, FactoryIcon, CreditCardIcon, WalletIcon, ChartIcon, ShieldCheckIcon,
  SettingsIcon, MenuIcon, LogoutIcon, WifiIcon, WifiOffIcon, SunIcon, MoonIcon,
  UndoIcon, ClipboardListIcon, TagIcon,
} from '../components/icons';

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();

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
    { label: 'Dashboard', path: '/', Icon: LayoutDashboardIcon },
    {
      label: 'Sales',
      children: [
        { label: 'Estimated Bills', path: '/sales/estimate', Icon: FileTextIcon },
        { label: 'Tax Invoices (GST)', path: '/sales/tax', Icon: ReceiptIcon },
        { label: 'Returns', path: '/returns', Icon: UndoIcon },
      ],
      Icon: ReceiptIcon,
    },
    {
      label: 'Purchases',
      children: [
        { label: 'Purchase Bills', path: '/purchases', Icon: ShoppingCartIcon },
      ],
      Icon: ShoppingCartIcon,
    },
    {
      label: 'Inventory',
      children: [
        { label: 'Products', path: '/inventory', Icon: PackageIcon },
        { label: 'Stock Movements', path: '/inventory/movements', Icon: ClipboardListIcon },
        { label: 'Categories & Brands', path: '/inventory/master', Icon: TagIcon },
      ],
      Icon: PackageIcon,
    },
    { label: 'Customers', path: '/customers', Icon: UsersIcon },
    { label: 'Suppliers', path: '/suppliers', Icon: FactoryIcon },
    { label: 'Payments', path: '/payments', Icon: CreditCardIcon },
    { label: 'Credit / Debit Notes', path: '/notes', Icon: FileTextIcon },
    { label: 'Expenses', path: '/expenses', Icon: WalletIcon },
    { label: 'Reports', path: '/reports', Icon: ChartIcon },
    { label: 'Audit Logs', path: '/audit', Icon: ShieldCheckIcon },
    { label: 'Settings', path: '/settings', Icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col">
      {/* Offline banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold text-center tracking-wide flex items-center justify-center gap-2">
          <WifiOffIcon size={14} />
          <span>Offline Mode Active</span>
          <span className="font-normal opacity-90">&bull; Changes will be queued locally</span>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'w-64' : 'w-20'
          } transition-all duration-300 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0`}
        >
          {/* Brand header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/30">
                K
              </div>
              {sidebarOpen && (
                <div className="flex flex-col">
                  <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight leading-none">
                    KHM
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">
                    Accounts ERP
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Toggle sidebar"
            >
              <MenuIcon size={20} />
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
                        <item.Icon size={14} />
                        <span>{item.label}</span>
                      </div>
                    )}
                    <div className="space-y-0.5 mt-1">
                      {item.children.map((sub, sIdx) => (
                        <NavLink
                          key={sIdx}
                          to={sub.path}
                          end={sub.path === '/inventory' || sub.path === '/purchases'}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                              isActive
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
                            }`
                          }
                        >
                          <sub.Icon size={16} className="shrink-0 opacity-80" />
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
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
                      }`
                    }
                  >
                    <item.Icon size={18} className="shrink-0" />
                    {sidebarOpen && <span>{item.label}</span>}
                  </NavLink>
                )}
              </div>
            ))}
          </nav>

          {/* User profile footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0">
                  {user?.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                {sidebarOpen && (
                  <div className="overflow-hidden">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.name}</p>
                    <span className="inline-block text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-medium mt-0.5">
                      {user?.role}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                title="Sign out"
              >
                <LogoutIcon size={16} />
              </button>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col overflow-y-auto bg-slate-100 dark:bg-slate-950">
          {/* Topbar */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">KHM Wholesale &amp; Trading ERP</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition"
              >
                {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              </button>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                {isOnline ? <WifiIcon size={14} /> : <WifiOffIcon size={14} />}
                <span>{isOnline ? 'System Online' : 'Offline'}</span>
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
