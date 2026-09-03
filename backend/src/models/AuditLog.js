import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    index: true,
    // e.g. 'SALE_CREATED', 'PAYMENT_CREATED', 'SALE_CANCELLED', 'PRODUCT_UPDATED', etc.
  },
  entity: {
    type: String,
    required: true,
    index: true,
    // e.g. 'Sale', 'Purchase', 'Payment', 'Product', 'Customer', 'Supplier', 'Expense', 'Settings'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true,
  },
  summary: {
    type: String,
    required: true,
    // Human-readable description: "Created Tax Invoice INV-0042 for ₹15,000.00"
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
    // Structured snapshot: { invoiceNumber, grandTotal, customerName, stream, etc. }
  },
  ipAddress: {
    type: String,
    default: '',
  }
}, { timestamps: true });

// Compound index for efficient querying by date range
auditLogSchema.index({ createdAt: -1 });

// TTL Index: Automatically delete audit logs older than 30 days to preserve free-tier DB space
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
