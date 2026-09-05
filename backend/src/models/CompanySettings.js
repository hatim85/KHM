import mongoose from 'mongoose';
import { isValidStateCode, normalizeGstin, normalizeStateCode } from '../utils/gstMaster.js';

const PREFIX_REGEX = /^[A-Z]{2,5}-$/;

const prefixValidator = {
  validator(v) {
    if (v === undefined || v === null || v === '') return true;
    return PREFIX_REGEX.test(String(v).trim().toUpperCase());
  },
  message: 'Prefix must be 2-5 uppercase letters followed by a hyphen (e.g. INV-).',
};

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
    // Optional free text — deliberately NOT format-validated (owner's rule).
  },
  stateCode: {
    type: String,
    default: '24', // Default to Gujarat as requested
    validate: {
      validator(v) {
        return isValidStateCode(v);
      },
      message: 'State code is invalid. Use a 2-digit GST state code.',
    },
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  
  // Invoice Sequence Counters (financial-year-aware; each stream independent)
  // Estimated Bills
  estimatePrefix: { type: String, default: 'EST-', validate: prefixValidator },
  estimateNextNumber: { type: Number, default: 1, min: 1 },
  estimateFY: { type: Number, default: null },
  
  // Tax Invoices
  taxInvoicePrefix: { type: String, default: 'INV-', validate: prefixValidator },
  taxInvoiceNextNumber: { type: Number, default: 1, min: 1 },
  taxInvoiceFY: { type: Number, default: null },
  
  // Sales Returns
  salesReturnPrefix: { type: String, default: 'SR-', validate: prefixValidator },
  salesReturnNextNumber: { type: Number, default: 1, min: 1 },
  salesReturnFY: { type: Number, default: null },
  
  // Purchase Returns
  purchaseReturnPrefix: { type: String, default: 'PR-', validate: prefixValidator },
  purchaseReturnNextNumber: { type: Number, default: 1, min: 1 },
  purchaseReturnFY: { type: Number, default: null },

  // Receipt Vouchers
  receiptPrefix: { type: String, default: 'REC-', validate: prefixValidator },
  receiptNextNumber: { type: Number, default: 1, min: 1 },
  receiptFY: { type: Number, default: null },

  // Payment Vouchers
  paymentPrefix: { type: String, default: 'PAY-', validate: prefixValidator },
  paymentNextNumber: { type: Number, default: 1, min: 1 },
  paymentFY: { type: Number, default: null },

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

companySettingsSchema.pre('save', function () {
  if (this.gstin) this.gstin = normalizeGstin(this.gstin);
  if (this.stateCode) this.stateCode = normalizeStateCode(this.stateCode);
});

const CompanySettings = mongoose.model('CompanySettings', companySettingsSchema);
export default CompanySettings;
