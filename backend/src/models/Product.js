import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  sku: {
    type: String,
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
  },
  unit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    required: true,
  },
  hsnCode: {
    type: String,
    trim: true,
    default: '',
  },
  // All monetary values stored as Integers (paise) to prevent float errors
  purchasePrice: {
    type: Number,
    default: 0,
  },
  sellingPrice: {
    type: Number,
    required: true,
    default: 0,
  },
  gstRate: {
    type: Number,
    default: 0,
    // e.g., 5, 12, 18, 28
  },
  // Cached stock values for quick reads. Actual stock is derived from StockMovements.
  taxStock: {
    type: Number,
    default: 0,
  },
  estimateStock: {
    type: Number,
    default: 0,
  },
  reorderLevel: {
    type: Number,
    default: 10,
    // Triggers low stock alerts when total stock falls below this level
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
export default Product;
