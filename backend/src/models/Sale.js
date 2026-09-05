import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema({
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
    // Stored in paise
  },
  specification: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
    // Free text per line (size, variant, etc.) — printed on the bill.
  },
  taxableValue: {
    type: Number,
    required: true,
  },
  gstRate: {
    type: Number,
    default: 0,
  },
  cgst: {
    type: Number,
    default: 0,
  },
  sgst: {
    type: Number,
    default: 0,
  },
  igst: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true, 
    // taxableValue + cgst + sgst + igst
  },
  // Historical snapshots at finalization — old PDFs never depend on live masters.
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  unitName: { type: String, default: '' },
});

const saleSchema = new mongoose.Schema({
  transactionType: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
    default: 'ESTIMATE', // Phase 7 focuses on ESTIMATE bills
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
  },
  financialYear: {
    type: Number,
    default: null,
    index: true,
  },
  sourceEstimateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    default: null,
    index: true,
  },
  invoiceDate: {
    type: Date,
    required: true,
  },
  items: [saleItemSchema],
  subTotal: {
    type: Number,
    default: 0,
    required: true, // Sum of taxable values
  },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  discount: {
    type: Number,
    default: 0, 
  },
  grandTotal: {
    type: Number,
    default: 0,
    required: true, // subTotal + tax - discount
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
  dispatchThrough: {
    type: String,
    default: '',
  },
  // Historical snapshots at finalization — old PDFs never depend on live masters.
  customerSnapshot: {
    name: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    stateCode: { type: String, default: '' },
  },
  companySnapshot: {
    companyName: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    stateCode: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  // Duplicate-submission guard (§33). Client-supplied `Idempotency-Key` header.
  // No default: the field must be ABSENT (not null) when unused, because
  // sparse indexes still index explicit nulls.
  idempotencyKey: {
    type: String,
    sparse: true,
    unique: true,
  },
  pdf: {
    provider: { type: String, enum: ['oci', 'local'], default: 'local' },
    objectKey: { type: String, default: null },
    fileName: { type: String, default: null },
    contentType: { type: String, default: 'application/pdf' },
    generatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

// Operational indexes for 120k+ invoice scale and report filtering.
// (invoiceNumber already has a unique index; sourceEstimateId is indexed in-schema.)
saleSchema.index({ transactionType: 1, status: 1, invoiceDate: -1 });
saleSchema.index({ customer: 1, transactionType: 1 });
saleSchema.index({ invoiceDate: -1 });
saleSchema.index({ paymentStatus: 1, transactionType: 1 });

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
