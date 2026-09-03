import mongoose from 'mongoose';

const companySettingsSchema = new mongoose.Schema({
  // Only one settings document should ever exist
  isSingleton: {
    type: Boolean,
    default: true,
    unique: true,
  },
  companyName: {
    type: String,
    required: true,
    default: 'KHM Wholesale & Trading',
  },
  address: {
    type: String,
    default: '',
  },
  gstin: {
    type: String,
    default: '',
  },
  stateCode: {
    type: String,
    default: '24', // Default to Gujarat as requested
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  
  // Invoice Sequence Counters
  // Estimated Bills
  estimatePrefix: { type: String, default: 'EST-' },
  estimateNextNumber: { type: Number, default: 1 },
  
  // Tax Invoices
  taxInvoicePrefix: { type: String, default: 'INV-' },
  taxInvoiceNextNumber: { type: Number, default: 1 },
  
  // Sales Returns
  salesReturnPrefix: { type: String, default: 'SR-' },
  salesReturnNextNumber: { type: Number, default: 1 },
  
  // Purchase Returns
  purchaseReturnPrefix: { type: String, default: 'PR-' },
  purchaseReturnNextNumber: { type: Number, default: 1 },

  // Receipt Vouchers
  receiptPrefix: { type: String, default: 'REC-' },
  receiptNextNumber: { type: Number, default: 1 },

  // Payment Vouchers
  paymentPrefix: { type: String, default: 'PAY-' },
  paymentNextNumber: { type: Number, default: 1 },

  // Google Drive OAuth (server-side only — never exposed to frontend)
  googleRefreshToken: { type: String, default: '', select: false },

}, { timestamps: true });

// Ensure we only ever return the singleton
companySettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ isSingleton: true });
  if (!settings) {
    settings = await this.create({ isSingleton: true });
  }
  return settings;
};

const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema);
export default CompanySettings;
