import mongoose from 'mongoose';

const purchaseItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  rate: {
    type: Number,
    required: true,
    // stored in paise
  },
  taxRate: {
    type: Number,
    default: 0, // e.g. 5, 12, 18. Ignored if ESTIMATE stream.
  },
  taxAmount: {
    type: Number,
    default: 0, // computed tax per row. 0 if ESTIMATE. Stored in paise.
  },
  total: {
    type: Number,
    required: true, // (rate * qty) + taxAmount. Stored in paise.
  },
  // Historical snapshots at finalization — old documents never depend on live masters.
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
});

const purchaseSchema = new mongoose.Schema({
  transactionType: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
  },
  invoiceNumber: {
    type: String,
    required: true,
  },
  invoiceDate: {
    type: Date,
    required: true,
  },
  items: [purchaseItemSchema],
  subTotal: {
    type: Number,
    default: 0,
    required: true, // total of items before tax. Paise.
  },
  taxTotal: {
    type: Number,
    default: 0, // 0 if ESTIMATE. Paise.
  },
  grandTotal: {
    type: Number,
    default: 0,
    required: true, // subTotal + taxTotal. Paise.
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Cumulative value credited back via Return documents (paise).
  // Outstanding = grandTotal - amountPaid - returnedAmount.
  returnedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  paymentStatus: {
    type: String,
    enum: ['UNPAID', 'PARTIAL', 'PAID'],
    default: 'UNPAID',
  },
  status: {
    type: String,
    enum: ['DRAFT', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
  },
  remarks: {
    type: String,
    default: '',
  },
  // Historical snapshot at finalization.
  supplierSnapshot: {
    name: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    stateCode: { type: String, default: '' },
  },
  // Duplicate-submission guard (§33). Client-supplied `Idempotency-Key` header.
  // No default: the field must be ABSENT (not null) when unused, because
  // sparse indexes still index explicit nulls.
  idempotencyKey: {
    type: String,
    sparse: true,
    unique: true,
  }
}, { timestamps: true });

// Ensure invoice numbers are unique per supplier and transaction stream
purchaseSchema.index({ supplier: 1, invoiceNumber: 1, transactionType: 1 }, { unique: true });

const Purchase = mongoose.model('Purchase', purchaseSchema);
export default Purchase;
