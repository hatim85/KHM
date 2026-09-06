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
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
    // IANA business timezone driving document dates + financial years.
  },

  // Document series prefixes (production numbering: PREFIX-FYMMDD-SEQ).
  // Per-day sequences live in the DocumentCounter collection (001–999);
  // changing a prefix starts a fresh independent series.
  // Estimated Bills
  estimatePrefix: { type: String, default: 'EST-', validate: prefixValidator },

  // Tax Invoices
  taxInvoicePrefix: { type: String, default: 'INV-', validate: prefixValidator },

  // Bills of Supply (0%-GST / exempt lines of TAX sales).
  // Numbered in their own BOS- series; stock + ledger stay in the TAX stream.
  supplyPrefix: { type: String, default: 'BOS-', validate: prefixValidator },

  // Sales Returns (inventory returns — separate from Credit Notes)
  salesReturnPrefix: { type: String, default: 'SR-', validate: prefixValidator },

  // Purchase Returns (inventory returns — separate from Debit Notes)
  purchaseReturnPrefix: { type: String, default: 'PR-', validate: prefixValidator },

  // Credit Notes (financial/GST downward adjustments on sales)
  creditNotePrefix: { type: String, default: 'CN-', validate: prefixValidator },

  // Debit Notes (financial/GST adjustments on purchases)
  debitNotePrefix: { type: String, default: 'DN-', validate: prefixValidator },

  // Receipt Vouchers
  receiptPrefix: { type: String, default: 'REC-', validate: prefixValidator },

  // Payment Vouchers
  paymentPrefix: { type: String, default: 'PAY-', validate: prefixValidator },

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
