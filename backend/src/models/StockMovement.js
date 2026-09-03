import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true,
  },
  stream: {
    type: String,
    enum: ['TAX', 'ESTIMATE'],
    required: true,
    index: true, // Crucial for isolating dual-inventory
  },
  type: {
    type: String,
    enum: ['IN', 'OUT', 'ADJUSTMENT'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    // Negative for OUT, Positive for IN
  },
  referenceDocument: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // e.g., Purchase ID or Sale ID
  },
  referenceModel: {
    type: String,
    required: true,
    // e.g. 'Purchase' or 'Sale'
  },
  remarks: {
    type: String,
    default: '',
    // Used for manual adjustment reasons
  }
}, { timestamps: true });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
