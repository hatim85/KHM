import mongoose from 'mongoose';

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
    default: '',
    // Optional GSTIN, as some customers might be unregistered
  },
  stateCode: {
    type: String,
    trim: true,
    default: '24', // Default to local state (Gujarat)
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

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;
