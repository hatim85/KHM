import mongoose from 'mongoose';

const expenseCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);
export default ExpenseCategory;
