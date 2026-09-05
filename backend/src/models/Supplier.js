import mongoose from 'mongoose';
import { isValidStateCode, normalizeGstin, normalizeStateCode } from '../utils/gstMaster.js';

const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  gstin: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    // Optional free text — deliberately NOT format-validated (owner's rule).
  },
  stateCode: {
    type: String,
    trim: true,
    default: '24', // Default to local state (Gujarat); drives intra/inter-state ITC decisions
    validate: {
      validator(v) {
        return isValidStateCode(v);
      },
      message: 'State code is invalid. Use a 2-digit GST state code.',
    },
  },
  phone: {
    type: String,
    trim: true,
    default: '',
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
  },
  address: {
    type: String,
    trim: true,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

supplierSchema.pre('save', function () {
  if (this.gstin) this.gstin = normalizeGstin(this.gstin);
  if (this.stateCode) this.stateCode = normalizeStateCode(this.stateCode);
});

const Supplier = mongoose.model('Supplier', supplierSchema);
export default Supplier;
