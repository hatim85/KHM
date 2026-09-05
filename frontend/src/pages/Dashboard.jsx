import React from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUpIcon, ShoppingCartIcon, BanknoteIcon, CreditCardIcon,
  FileTextIcon, ReceiptIcon, PackageIcon, WalletIcon,
} from '../components/icons';

const Dashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-100 dark:from-indigo-900/60 via-white dark:via-slate-900 to-slate-50 dark:to-slate-900 border border-indigo-500/20 p-8">
        <div className="relative z-10">
          <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            KHM Accounts &bull; Wholesale ERP
          </span>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">
            Welcome back, {user?.name || 'Administrator'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-xl">
            Internal operations overview. Manage Estimated Bills, Tax Invoices, Purchases, Inventory Movements, and Ledgers.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-600/10 to-transparent pointer-events-none"></div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Today's Sales</span>
            <TrendingUpIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">₹0.00</div>
          <p className="text-xs text-slate-500 mt-1">Estimates &amp; Invoices</p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Today's Purchases</span>
            <ShoppingCartIcon size={18} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">₹0.00</div>
          <p className="text-xs text-slate-500 mt-1">Stock Inward</p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Receivables</span>
            <BanknoteIcon size={18} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹0.00</div>
          <p className="text-xs text-slate-500 mt-1">Customer Outstanding</p>
        </div>

        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Payables</span>
            <CreditCardIcon size={18} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">₹0.00</div>
          <p className="text-xs text-slate-500 mt-1">Supplier Balance</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => navigate('/sales/estimate/new')} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/60 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-slate-300 dark:border-slate-700/60 rounded-xl transition text-center group">
            <FileTextIcon size={24} className="mb-1.5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white">New Estimated Bill</span>
          </button>
          <button onClick={() => navigate('/sales/tax/new')} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/60 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-slate-300 dark:border-slate-700/60 rounded-xl transition text-center group">
            <ReceiptIcon size={24} className="mb-1.5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white">New Tax Invoice</span>
          </button>
          <button onClick={() => navigate('/purchases/new')} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/60 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-slate-300 dark:border-slate-700/60 rounded-xl transition text-center group">
            <PackageIcon size={24} className="mb-1.5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white">Record Purchase</span>
          </button>
          <button onClick={() => navigate('/payments')} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/60 hover:bg-indigo-600/20 hover:border-indigo-500/40 border border-slate-300 dark:border-slate-700/60 rounded-xl transition text-center group">
            <WalletIcon size={24} className="mb-1.5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
            <span className="text-xs font-semibold text-slate-900 dark:text-white">Receive Payment</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
