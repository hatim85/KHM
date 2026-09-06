import ApiError from '../utils/ApiError.js';

/**
 * Shared line-item math for sales, purchases, returns and conversion.
 *
 * Dual-quantity model:
 * - `quantity` (primary/billing UOM) is ALWAYS required and ALWAYS drives
 *   inventory pool movements.
 * - `secondaryQty` is the ACTUAL measured quantity in the product's
 *   secondary UOM. No fixed primary<->secondary conversion is assumed
 *   anywhere — the measured value is recorded per line.
 * - `pricingBasis` (from the product master) decides which quantity the
 *   rate multiplies: PRIMARY (default) or SECONDARY.
 */

/** GST split shared by all documents. billBase is already in paise. */
export const applyGst = ({ billBase, gstRate, isTax, intra }) => {
  let cgst = 0, sgst = 0, igst = 0;
  const taxAmount = Math.round(billBase * (Number(gstRate) || 0) / 100);
  if (isTax) {
    if (intra) {
      cgst = Math.round(taxAmount / 2);
      sgst = taxAmount - cgst; // absorb rounding
    } else {
      igst = taxAmount;
    }
  }
  return { taxableValue: billBase, cgst, sgst, igst, total: billBase + cgst + sgst + igst };
};

/**
 * Resolve + validate dual quantities against the product master.
 * Returns { qty, sec, secName, basis } where sec is 0 when unconfigured.
 * Throws 400 on: bad primary qty, secondary qty without a configured
 * secondary unit, or missing secondary qty on SECONDARY-priced products.
 */
export const resolveDualQty = ({ product, quantity, secondaryQty }) => {
  const qty = Number(quantity);
  if (!(qty > 0)) throw new ApiError(400, 'Quantity must be greater than 0.');
  const sec = Number(secondaryQty) || 0;
  if (sec < 0) throw new ApiError(400, 'Secondary quantity cannot be negative.');

  const unitRef = product.secondaryUnit;
  const configured = !!unitRef;
  const secName = unitRef && typeof unitRef === 'object' ? (unitRef.shortName || '') : '';
  const basis = product.pricingBasis === 'SECONDARY' && configured ? 'SECONDARY' : 'PRIMARY';

  if (!configured) {
    if (sec > 0) {
      throw new ApiError(400, `${product.name} has no secondary unit configured — secondary quantity not accepted.`);
    }
    return { qty, sec: 0, secName: '', basis: 'PRIMARY' };
  }
  if (product.pricingBasis === 'SECONDARY' && !(sec > 0)) {
    throw new ApiError(400, `Secondary quantity is required for ${product.name} — it is priced per ${secName || 'secondary unit'}.`);
  }
  return { qty, sec, secName, basis };
};
