import mongoose from 'mongoose';

const supplierLedgerSchema = new mongoose.Schema({
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
    index: true,
  },
  stream: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
    index: true,
  },
  transactionType: {
    type: String,
    enum: ['PURCHASE', 'PAYMENT', 'RETURN', 'ADJUSTMENT'],
    required: true,
  },
  referenceDocument: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  referenceModel: {
    type: String,
    required: true,
  },
  credit: {
    type: Number,
    default: 0,
    // Usually for Purchases (increasing liability). Stored in paise.
  },
  debit: {
    type: Number,
    default: 0,
    // Usually for Payments (decreasing liability). Stored in paise.
  },
  balanceAfter: {
    type: Number,
    required: true,
    // Snapshot of the running balance after this transaction.
    // Positive means we owe them (liability).
  }
}, { timestamps: true });

const SupplierLedger = mongoose.model('SupplierLedger', supplierLedgerSchema);
export default SupplierLedger;
