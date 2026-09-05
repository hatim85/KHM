import mongoose from 'mongoose';

const returnItemSchema = new mongoose.Schema({
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
    // Original document's line rate (paise) — never client-supplied.
  },
  taxableValue: { type: Number, required: true },
  gstRate: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  total: { type: Number, required: true },
  // Historical snapshots — history never reads live masters.
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  unitName: { type: String, default: '' },
});

const returnSchema = new mongoose.Schema({
  returnType: {
    type: String,
    enum: ['SALES_RETURN', 'PURCHASE_RETURN'],
    required: true,
    index: true,
  },
  // TAX vs ESTIMATE stream, copied from the original document.
  // GST reversal applies to TAX only; drives report separation.
  stream: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
    index: true,
  },
  returnNumber: {
    type: String,
    required: true,
    unique: true,
    // SR-YYYY-XXXXXX / PR-YYYY-XXXXXX — immutable, never reused.
  },
  financialYear: { type: Number, default: null, index: true },
  originalModel: {
    type: String,
    enum: ['Sale', 'Purchase'],
    required: true,
  },
  originalDocument: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    refPath: 'originalModel',
  },
  originalNumber: { type: String, default: '' },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  customerSnapshot: {
    name: { type: String, default: '' },
    gstin: { type: String, default: '' },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    stateCode: { type: String, default: '' },
  },
  supplierSnapshot: {
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
  returnDate: { type: Date, required: true },
  items: [returnItemSchema],
  subTotal: { type: Number, default: 0, required: true },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0, required: true },
  reason: { type: String, required: true },
  // Duplicate-submission guard (§33). No default: absent (not null) when
  // unused, because sparse indexes still index explicit nulls.
  idempotencyKey: {
    type: String,
    sparse: true,
    unique: true,
  },
}, { timestamps: true });

returnSchema.index({ originalModel: 1, originalDocument: 1 });
returnSchema.index({ returnType: 1, stream: 1, returnDate: -1 });
returnSchema.index({ customer: 1, returnType: 1 });
returnSchema.index({ supplier: 1, returnType: 1 });

const Return = mongoose.model('Return', returnSchema);
export default Return;
