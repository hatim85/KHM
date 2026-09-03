import mongoose from 'mongoose';

const unitSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // e.g., "Kilogram", "Piece", "Box"
  },
  shortName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // e.g., "kg", "pcs", "box"
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const Unit = mongoose.model('Unit', unitSchema);
export default Unit;
