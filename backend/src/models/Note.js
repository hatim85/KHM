import mongoose from 'mongoose';

/**
 * Credit Notes (sales-side) and Debit Notes (purchase-side).
 *
 * Independent financial/GST adjustment documents — deliberately SEPARATE
 * from inventory Returns (SR/PR):
 * - SR/PR move physical stock; CN/DN adjust money + tax only (never stock).
 * - A return MAY be accompanied by a note (linked via `linkedReturn`), but
 *   notes are never auto-created — each workflow step is explicit.
 *
 * Effects on COMPLETED notes:
 * - CREDIT_NOTE: CustomerLedger CREDIT (receivable down) + Sale.creditNoteAmount += grandTotal.
 * - DEBIT_NOTE:  SupplierLedger CREDIT (payable up) + Purchase.debitNoteAmount += grandTotal.
 * Cancellation posts the mirror entries. Finalized notes are never edited.
 */
const noteItemSchema = new mongoose.Schema({
  // Optional product link (return/damage cases). Free-form adjustments
  // (missed discount, excess charge) carry no product.
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0,
  },
  rate: {
    type: Number,
    default: 0,
    min: 0,
    // Paise. Taxable base = quantity × rate when both present, else taxableValue.
  },
  taxableValue: { type: Number, required: true, min: 0 },
  // GST rate resolved from the ORIGINAL document's line when the item links
  // a product from that document, else the explicitly supplied rate.
  // Never hard-coded — always from the original or validated request input.
  gstRate: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 },
  total: { type: Number, required: true, min: 0 },
  // Historical snapshots — history never reads live masters.
  productName: { type: String, default: '' },
  sku: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  unitName: { type: String, default: '' },
});

const noteSchema = new mongoose.Schema({
  noteType: {
    type: String,
    enum: ['CREDIT_NOTE', 'DEBIT_NOTE'],
    required: true,
    index: true,
  },
  documentNumber: {
    type: String,
    required: true,
    unique: true,
    // Production number CN-/DN- (PREFIX-FYMMDD-SEQ), backend-generated, never reused.
  },
  noteDate: { type: Date, required: true },
  // Business date driving FY + MMDD + per-day sequence (business timezone).
  documentDate: { type: Date, default: null, index: true },
  financialYear: {
    type: Number,
    default: null,
    index: true,
    // Indian FY start year (e.g. 2026 for FY 2026-27).
  },
  partyType: {
    type: String,
    enum: ['Customer', 'Supplier'],
    required: true,
  },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },
  // Link to the original invoice/purchase being adjusted.
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
  originalDocumentNumber: { type: String, default: '', required: true },
  // Optional traceability to the inventory return handled alongside this note.
  linkedReturn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Return',
    default: null,
  },
  // TAX vs ESTIMATE stream, copied from the original document.
  stream: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
    index: true,
  },
  items: [noteItemSchema],
  subTotal: { type: Number, default: 0, required: true },
  totalCgst: { type: Number, default: 0 },
  totalSgst: { type: Number, default: 0 },
  totalIgst: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0, required: true, min: 1 },
  reason: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['DRAFT', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
    index: true,
  },
  partySnapshot: {
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
  // Duplicate-submission guard. Absent (not null) when unused.
  idempotencyKey: {
    type: String,
    sparse: true,
    unique: true,
  },
  // NOTE: intentionally NO pdf/storage fields — CN/DN are record-only and
  // must never generate files locally or upload anywhere.
}, { timestamps: true });

noteSchema.index({ noteType: 1, status: 1, noteDate: -1 });
noteSchema.index({ originalModel: 1, originalDocument: 1 });

const Note = mongoose.model('Note', noteSchema);
export default Note;
