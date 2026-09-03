import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExpenseCategory',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 1, // stored in paise
  },
  paymentMode: {
    type: String,
    required: true,
    enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'],
  },
  referenceNumber: {
    type: String,
    trim: true,
    default: '',
  },
  notes: {
    type: String,
    trim: true,
    default: '',
  },
}, { timestamps: true });

const Expense = mongoose.model('Expense', expenseSchema);
export default Expense;
