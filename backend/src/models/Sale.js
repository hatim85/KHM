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
  }
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
  pdf: {
    provider: { type: String, enum: ['oci', 'local'], default: 'local' },
    objectKey: { type: String, default: null },
    fileName: { type: String, default: null },
    contentType: { type: String, default: 'application/pdf' },
    generatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

const Sale = mongoose.model('Sale', saleSchema);
export default Sale;
