import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory
} from '../controllers/expenseController.js';

const router = express.Router();

router.use(protect);

// Category Routes
router.route('/categories')
  .get(getExpenseCategories)
  .post(createExpenseCategory);
  
router.route('/categories/:id')
  .put(updateExpenseCategory)
  .delete(deleteExpenseCategory);

// Expense Routes
router.route('/')
  .get(getExpenses)
  .post(createExpense);

router.route('/:id')
  .get(getExpenseById)
  .put(updateExpense)
  .delete(deleteExpense);

export default router;
