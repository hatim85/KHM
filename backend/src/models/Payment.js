import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  voucherNumber: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  type: {
    type: String,
    enum: ['RECEIPT', 'PAYMENT'], // RECEIPT = money in, PAYMENT = money out
    required: true,
  },
  stream: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
  },
  partyType: {
    type: String,
    enum: ['Customer', 'Supplier'],
    required: true,
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'partyType',
  },
  amount: {
    type: Number,
    required: true,
    min: 1, // Paise
  },
  paymentMode: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'],
    default: 'CASH',
  },
  referenceNumber: {
    type: String, // UTR, Cheque No, etc.
    default: '',
  },
  allocations: [{
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'allocations.model',
    },
    model: {
      type: String,
      required: true,
      enum: ['Sale', 'Purchase'],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    }
  }],
  unallocatedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  notes: {
    type: String,
    default: '',
  }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
