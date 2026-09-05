import mongoose from 'mongoose';
import { isValidStateCode, normalizeGstin, normalizeStateCode } from '../utils/gstMaster.js';

const customerSchema = new mongoose.Schema({
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
    default: '24', // Default to local state (Gujarat)
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

customerSchema.pre('save', function () {
  if (this.gstin) this.gstin = normalizeGstin(this.gstin);
  if (this.stateCode) this.stateCode = normalizeStateCode(this.stateCode);
});

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
