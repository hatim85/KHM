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
    index: true, // Movement classification only — stock itself is unified
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
  unitCost: {
    type: Number,
    default: 0,
    // Paise. For IN: actual unit cost (drives WAC). For OUT/ADJUSTMENT:
    // carrying average cost at movement time (COGS reconstruction).
  },
  stockAfter: {
    type: Number,
    default: null,
    // Physical stock immediately after this movement. Null for legacy rows.
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

// Reconstruct product history + movement report filtering at scale.
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
export default StockMovement;
