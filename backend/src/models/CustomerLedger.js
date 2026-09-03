import mongoose from 'mongoose';

const customerLedgerSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
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
    enum: ['SALE', 'RECEIPT', 'RETURN', 'ADJUSTMENT'],
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
  debit: {
    type: Number,
    default: 0,
    // Usually for Sales (increases customer's balance/debt to us). Stored in paise.
  },
  credit: {
    type: Number,
    default: 0,
    // Usually for Receipts/Payments (decreases customer's debt). Stored in paise.
  },
  balanceAfter: {
    type: Number,
    required: true,
    // Positive means they owe us (Asset).
  }
}, { timestamps: true });

const CustomerLedger = mongoose.model('CustomerLedger', customerLedgerSchema);
export default CustomerLedger;
