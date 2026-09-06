import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';

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
  specification: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
    // Free text (size, variant, etc.). Snapshotted onto bill lines at
    // finalization and printed on sales bills.
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
    // Primary / billing UOM. Inventory pools are counted in this unit.
  },
  // Optional secondary / measured UOM (e.g. primary PCS, measured KG).
  // No fixed conversion is assumed anywhere — every transaction records
  // the ACTUAL secondary quantity measured for that line.
  secondaryUnit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
    default: null,
  },
  // Which unit the selling/purchase rate is quoted in.
  pricingBasis: {
    type: String,
    enum: ['PRIMARY', 'SECONDARY'],
    default: 'PRIMARY',
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
    min: 0,
    max: 28,
    // e.g., 5, 12, 18, 28
  },
  // Two independent physical pools: TAX (billed/GST) vs ESTIMATE (unbilled).
  // A TAX purchase is never sellable in an ESTIMATE bill and vice versa.
  // StockMovement ledger (stream-classified) is authoritative for history.
  taxStock: {
    type: Number,
    default: 0,
  },
  estimateStock: {
    type: Number,
    default: 0,
  },
  // Weighted Average Cost per pool (paise). Updated on every stock IN with a
  // known unit cost. Never derived from purchasePrice at report time.
  // WAC = average purchase rate of the pool; drives valuation + COGS.
  averageCostTax: {
    type: Number,
    default: 0,
    min: 0,
  },
  averageCostEst: {
    type: Number,
    default: 0,
    min: 0,
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

// SECONDARY pricing is meaningless without a secondary unit.
productSchema.pre('save', function () {
  if (this.pricingBasis === 'SECONDARY' && !this.secondaryUnit) {
    throw new ApiError(400, 'Pricing basis SECONDARY requires a secondary unit.');
  }
  if (!this.secondaryUnit && this.pricingBasis !== 'PRIMARY') {
    this.pricingBasis = 'PRIMARY';
  }
});

productSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate() || {};
  const set = update.$set || update;
  if (set.pricingBasis === undefined && set.secondaryUnit === undefined) return;
  const doc = await this.model.findOne(this.getQuery()).lean();
  const basis = set.pricingBasis ?? doc?.pricingBasis ?? 'PRIMARY';
  const sec = set.secondaryUnit !== undefined ? set.secondaryUnit : doc?.secondaryUnit;
  if (basis === 'SECONDARY' && !sec) {
    throw new ApiError(400, 'Pricing basis SECONDARY requires a secondary unit.');
  }
});

const Product = mongoose.model('Product', productSchema);
export default Product;
