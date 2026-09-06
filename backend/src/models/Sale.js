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
  // Actual measured secondary quantity for this line (0 when the product
  // has no secondary UOM). No fixed primary↔secondary conversion exists.
  secondaryQty: {
    type: Number,
    default: 0,
    min: 0,
  },
  secondaryUnitName: {
    type: String,
    default: '',
  },
  pricingBasis: {
    type: String,
    enum: ['PRIMARY', 'SECONDARY'],
    default: 'PRIMARY',
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
  // TAX-stream sub-type (GST law): a TAX sale containing only 0%-GST
  // (exempt) lines is a Bill of Supply, not a Tax Invoice. Mixed TAX
  // submissions are split into two documents sharing a splitGroupId.
  // ESTIMATE docs always carry TAX_INVOICE (field is ignored for them).
  billType: {
    type: String,
    enum: ['TAX_INVOICE', 'BILL_OF_SUPPLY'],
    default: 'TAX_INVOICE',
    index: true,
  },
  // Links the two documents produced by a mixed GST split (same ObjectId
  // on both). Null when no split occurred.
  splitGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
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
    // Production document number (PREFIX-FYMMDD-SEQ, backend-generated,
    // never reused). Historical numbers in older formats are preserved as-is.
  },
  financialYear: {
    type: Number,
    default: null,
    index: true,
    // Indian FY start year (e.g. 2026 for FY 2026-27).
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
  // Business date driving FY + MMDD + per-day sequence (business timezone).
  // Set from invoiceDate at creation; stored separately per numbering policy.
  documentDate: {
    type: Date,
    default: null,
    index: true,
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
  // Outstanding = grandTotal - amountPaid - returnedAmount - creditNoteAmount.
  returnedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  // Cumulative value adjusted via Credit Note documents (paise).
  // Posted by COMPLETED credit notes; reversed on note cancellation.
  creditNoteAmount: {
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
