import Expense from '../models/Expense.js';
import ExpenseCategory from '../models/ExpenseCategory.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';

// --- Expense Categories ---

export const getExpenseCategories = async (req, res, next) => {
  try {
    const categories = await ExpenseCategory.find().sort({ name: 1 });
    res.json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    next(error);
  }
};

export const createExpenseCategory = async (req, res, next) => {
  try {
    const { name, isActive } = req.body;
    const category = new ExpenseCategory({ name, isActive });
    await category.save();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return next(new ApiError(400, 'Expense category already exists'));
    }
    next(error);
  }
};

export const updateExpenseCategory = async (req, res, next) => {
  try {
    const category = await ExpenseCategory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) return next(new ApiError(404, 'Category not found'));
    res.json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return next(new ApiError(400, 'Expense category name already exists'));
    }
    next(error);
  }
};

export const deleteExpenseCategory = async (req, res, next) => {
  try {
    // Check if category is used in any expenses
    const used = await Expense.findOne({ category: req.params.id });
    if (used) {
      return next(new ApiError(400, 'Cannot delete category as it is used in existing expenses. Try disabling it instead.'));
    }
    
    const category = await ExpenseCategory.findByIdAndDelete(req.params.id);
    if (!category) return next(new ApiError(404, 'Category not found'));
    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};

// --- Expenses ---

export const getExpenses = async (req, res, next) => {
  try {
    const { startDate, endDate, category } = req.query;
    
    let query = Expense.find().populate('category', 'name').sort({ date: -1, createdAt: -1 });
    
    if (category) {
      query = query.where('category').equals(category);
    }
    
    if (startDate && endDate) {
      query = query.where('date').gte(new Date(startDate)).lte(new Date(endDate));
    }
    
    const expenses = await query;
    res.json({ success: true, count: expenses.length, data: expenses });
  } catch (error) {
    next(error);
  }
};

export const getExpenseById = async (req, res, next) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('category', 'name');
    if (!expense) return next(new ApiError(404, 'Expense not found'));
    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

export const createExpense = async (req, res, next) => {
  try {
    const { date, category, amount, paymentMode, referenceNumber, notes } = req.body;
    
    const expense = new Expense({
      date,
      category,
      amount,
      paymentMode,
      referenceNumber,
      notes
    });
    
    await expense.save();
    
    const populatedExpense = await Expense.findById(expense._id).populate('category', 'name');

    logAudit({
      action: 'EXPENSE_CREATED',
      entity: 'Expense',
      entityId: expense._id,
      userId: req.user._id,
      summary: `Expense ₹${(amount / 100).toFixed(2)} — ${populatedExpense.category?.name || 'Unknown'}`,
      metadata: { amount, category: populatedExpense.category?.name, paymentMode },
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: populatedExpense });
  } catch (error) {
    next(error);
  }
};

export const updateExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name');
    
    if (!expense) return next(new ApiError(404, 'Expense not found'));
    res.json({ success: true, data: expense });
  } catch (error) {
    next(error);
  }
};

export const deleteExpense = async (req, res, next) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return next(new ApiError(404, 'Expense not found'));

    logAudit({
      action: 'EXPENSE_DELETED',
      entity: 'Expense',
      entityId: req.params.id,
      userId: req.user._id,
      summary: `Deleted expense ₹${(expense.amount / 100).toFixed(2)}`,
      metadata: { amount: expense.amount },
      ipAddress: req.ip
    });

    res.json({ success: true, data: {} });
  } catch (error) {
    next(error);
  }
};
