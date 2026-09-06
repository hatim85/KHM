import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import ApiError from '../utils/ApiError.js';

/**
 * Single source of truth for inventory mutations.
 * Two independent physical pools per product: TAX (billed/GST) and
 * ESTIMATE (unbilled). A TAX purchase is never sellable in an ESTIMATE
 * bill and vice versa. Each pool carries its own Weighted Average Cost.
 * StockMovement ledger (stream-classified) is authoritative for history.
 *
 * Every function runs inside the caller's transaction (session required).
 */

const POOL_FIELDS = Object.freeze({
  TAX: { qty: 'taxStock', avg: 'averageCostTax' },
  ESTIMATE: { qty: 'estimateStock', avg: 'averageCostEst' },
});

const poolOf = (stream) => {
  const pool = POOL_FIELDS[stream];
  if (!pool) throw new ApiError(400, 'Stream must be TAX or ESTIMATE.');
  return pool;
};

const loadProduct = async (productId, session) => {
  const product = await Product.findById(productId).session(session);
  if (!product) throw new ApiError(404, `Product not found: ${productId}`);
  return product;
};

const recordMovement = async (
  { productId, stream, type, quantity, secondaryQuantity = 0, unitCost = 0, stockAfter, referenceDocument, referenceModel, remarks = '' },
  session
) => {
  const movement = new StockMovement({
    product: productId,
    stream,
    type,
    quantity,
    // Measured secondary movement, same sign as quantity. 0 when unconfigured.
    secondaryQuantity: Number(secondaryQuantity) || 0,
    unitCost,
    stockAfter,
    referenceDocument,
    referenceModel,
    remarks,
  });
  await movement.save({ session });
  return movement;
};

/**
 * Stock IN (purchase, sales-return/cancellation reversal).
 * Updates WAC: newAvg = (oldAvg*oldQty + cost*qty) / (oldQty+qty).
 * unitCostPaise = 0 (e.g. cancellation reversal) keeps the current average.
 * unitCostPaise = null/undefined records the carrying average (WAC-neutral,
 * used by sales returns so COGS can net the returned cost).
 */
export const applyStockIn = async (
  { productId, quantity, secondaryQuantity = 0, unitCostPaise = 0, stream, referenceDocument, referenceModel, remarks = '' },
  session
) => {
  const qty = Number(quantity);
  if (!(qty > 0)) throw new ApiError(400, 'Stock-in quantity must be greater than 0.');
  const product = await loadProduct(productId, session);
  const pool = poolOf(stream);

  const oldQty = product[pool.qty] || 0;
  const oldAvg = product[pool.avg] || 0;
  // null/undefined = carry the current average (WAC-neutral, recorded for COGS netting).
  const cost = unitCostPaise == null ? oldAvg : (Number(unitCostPaise) || 0);
  const newQty = oldQty + qty;
  const newAvg = cost > 0 ? Math.round((oldAvg * oldQty + cost * qty) / newQty) : oldAvg;

  product[pool.qty] = newQty;
  product[pool.avg] = newAvg;
  await product.save({ session });

  await recordMovement(
    { productId, stream, type: 'IN', quantity: qty, secondaryQuantity, unitCost: cost, stockAfter: newQty, referenceDocument, referenceModel, remarks },
    session
  );
  return product;
};

/**
 * Stock OUT (tax sale, estimate sale). Reduces physical stock.
 * Negative stock is disallowed explicitly — never an accidental side effect.
 */
export const applyStockOut = async (
  { productId, quantity, secondaryQuantity = 0, stream, referenceDocument, referenceModel, remarks = '' },
  session
) => {
  const qty = Number(quantity);
  if (!(qty > 0)) throw new ApiError(400, 'Stock-out quantity must be greater than 0.');
  const product = await loadProduct(productId, session);
  const pool = poolOf(stream);

  const available = product[pool.qty] || 0;
  if (available < qty) {
    throw new ApiError(400, `Insufficient ${stream} stock for ${product.name}. Required: ${qty}, Available: ${available}`);
  }

  const newQty = available - qty;
  product[pool.qty] = newQty;
  await product.save({ session });

  // unitCost records the pool's carrying (average) cost at issue time for
  // COGS reconstruction. The pool WAC itself is unchanged by an OUT movement.
  // secondaryQuantity mirrors the OUT direction (negative) when measured.
  const sec = Number(secondaryQuantity) || 0;
  await recordMovement(
    { productId, stream, type: 'OUT', quantity: -qty, secondaryQuantity: sec > 0 ? -sec : sec, unitCost: product[pool.avg] || 0, stockAfter: newQty, referenceDocument, referenceModel, remarks },
    session
  );
  return product;
};

/**
 * Manual stock adjustment (positive or negative delta).
 * Resulting stock must not go negative.
 */
export const applyStockAdjustment = async (
  { productId, delta, stream, referenceDocument, referenceModel, remarks },
  session
) => {
  const d = Number(delta);
  if (!d) throw new ApiError(400, 'Adjustment quantity cannot be zero.');
  if (!remarks) throw new ApiError(400, 'A reason is required for stock adjustment.');
  const product = await loadProduct(productId, session);
  const pool = poolOf(stream);

  const newQty = (product[pool.qty] || 0) + d;
  if (newQty < 0) {
    throw new ApiError(400, `Adjustment would drive ${stream} stock negative for ${product.name}. Current: ${product[pool.qty] || 0}, Adjustment: ${d}`);
  }

  product[pool.qty] = newQty;
  await product.save({ session });

  await recordMovement(
    { productId, stream, type: 'ADJUSTMENT', quantity: d, unitCost: product[pool.avg] || 0, stockAfter: newQty, referenceDocument, referenceModel, remarks },
    session
  );
  return product;
};
