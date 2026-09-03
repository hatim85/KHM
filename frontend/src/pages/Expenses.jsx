import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchExpenses, fetchExpenseCategories, createExpense, deleteExpenseCategory, deleteExpense, createExpenseCategory } from '../features/expenseSlice';
import { formatMoney } from '../utils/formatters';

const Expenses = () => {
  const dispatch = useDispatch();

  const { expensesList, categories } = useSelector((state) => state.expenses);
  const { data: expenses, loading: expensesLoading } = expensesList;
  const { data: catData } = categories;

  // Expense Modal State
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    amount: '',
    paymentMode: 'CASH',
    referenceNumber: '',
    notes: ''
  });

  // Category Modal State
  const [showCatModal, setShowCatModal] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', isActive: true });

  useEffect(() => {
    dispatch(fetchExpenses({}));
    dispatch(fetchExpenseCategories());
  }, [dispatch]);

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...expenseForm,
      amount: parseInt(expenseForm.amount, 10) * 100 // Convert to paise
    };
    await dispatch(createExpense(payload));
    setShowExpenseModal(false);
    setExpenseForm({ date: new Date().toISOString().split('T')[0], category: '', amount: '', paymentMode: 'CASH', referenceNumber: '', notes: '' });
  };

  const handleCatSubmit = async (e) => {
    e.preventDefault();
    await dispatch(createExpenseCategory(catForm));
    setShowCatModal(false);
    setCatForm({ name: '', isActive: true });
  };

  const handleDeleteExpense = async (id) => {
    if (window.confirm('Are you sure you want to delete this expense record?')) {
      await dispatch(deleteExpense(id));
    }
  };

  const handleDeleteCategory = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete category "${name}"?`)) {
      await dispatch(deleteExpenseCategory(id));
    }
  };

  // Active Categories for dropdown
  const activeCategories = catData.filter(c => c.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Expenses</h1>
          <p className="text-slate-400 text-sm mt-1">Track operational costs and overheads.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-medium text-sm rounded-xl transition flex items-center gap-2"
          >
            ⚙️ Manage Categories
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition shadow-lg shadow-indigo-500/30 active:scale-95 flex items-center gap-2"
          >
            <span>+</span> Record Expense
          </button>
        </div>
      </div>

      {/* Expenses List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-800/40 border-b border-slate-800">
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Payment Mode</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notes/Ref</th>
                <th className="py-4 px-6 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {expensesLoading && expenses.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-slate-500 text-sm">Loading expenses...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan="6" className="py-8 text-center text-slate-500 text-sm">No expenses recorded yet.</td></tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense._id} className="hover:bg-slate-800/20 transition">
                    <td className="py-4 px-6 text-sm text-white">
                      {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-6 text-sm font-medium text-indigo-400">
                      {expense.category?.name || 'Unknown'}
                    </td>
                    <td className="py-4 px-6 text-sm font-semibold text-white">
                      {formatMoney(expense.amount)}
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
                        {expense.paymentMode.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-400 max-w-[200px] truncate">
                      {expense.referenceNumber && <span className="text-slate-300 font-mono text-xs mr-2">#{expense.referenceNumber}</span>}
                      {expense.notes}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDeleteExpense(expense._id)} className="text-rose-400 hover:text-rose-300 text-sm font-medium transition">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl relative my-8">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/90 backdrop-blur-md z-10 rounded-t-3xl">
              <h2 className="text-lg font-bold text-white">Record Expense</h2>
              <button type="button" onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>
            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Date *</label>
                  <input required type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Amount (₹) *</label>
                  <input required type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" placeholder="0.00" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Expense Category *</label>
                  <select required value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="">Select Category</option>
                    {activeCategories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                  {activeCategories.length === 0 && <p className="text-xs text-amber-500 mt-1">No categories exist. Create one first.</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Mode *</label>
                  <select required value={expenseForm.paymentMode} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMode: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none appearance-none">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ref / UTR Number</label>
                  <input type="text" value={expenseForm.referenceNumber} onChange={(e) => setExpenseForm({ ...expenseForm, referenceNumber: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none" placeholder="Optional" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</label>
                  <textarea rows="2" value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none resize-none" placeholder="Description of the expense..."></textarea>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={!expenseForm.category} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20 disabled:opacity-50">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm shadow-2xl relative">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Quick Add Category</h2>
              <button type="button" onClick={() => setShowCatModal(false)} className="text-slate-400 hover:text-white text-2xl">&times;</button>
            </div>

            {/* Quick list of existing */}
            <div className="p-4 max-h-48 overflow-y-auto bg-slate-950/30 border-b border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Existing Categories</h3>
              <div className="flex flex-wrap gap-2">
                <div className="space-y-1">
                  {catData.map(c => (
                    <div
                      key={c._id}
                      className="group flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg"
                    >
                      <span className="text-xs text-slate-300">
                        {c.name}
                        {!c.isActive && (
                          <span className="text-amber-500 ml-1">(Inactive)</span>
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(c._id, c.name)}
                        className="ml-3 w-6 h-6 flex items-center justify-center flex-shrink-0 text-rose-500 hover:text-rose-400 text-lg font-bold leading-none"
                        title="Delete category"
                        aria-label={`Delete ${c.name}`}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <form onSubmit={handleCatSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Category Name *</label>
                <input required type="text" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full bg-slate-950/60 border border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-white outline-none" placeholder="e.g. Rent, Salary, Utilities" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="submit" className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg shadow-indigo-600/20">Create Category</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
