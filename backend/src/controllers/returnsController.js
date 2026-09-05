import mongoose from 'mongoose';
import Return from '../models/Return.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import CompanySettings from '../models/CompanySettings.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';
import { getNextDocumentNumber } from '../utils/documentNumbering.js';
import { isIntraStateSupply } from '../utils/gstMaster.js';
import { applyStockIn, applyStockOut } from '../services/inventoryService.js';

export const getReturns = async (req, res, next) => {
  try {
    const { returnType, stream } = req.query;
    let query = Return.find().sort({ createdAt: -1 });
    if (returnType) query = query.where('returnType').equals(returnType);
    if (stream) query = query.where('stream').equals(stream);
    const returns = await query.limit(200);
    res.json({ success: true, count: returns.length, data: returns });
  } catch (error) {
    next(error);
  }
};

export const getReturnById = async (req, res, next) => {
  try {
    const ret = await Return.findById(req.params.id);
    if (!ret) return next(new ApiError(404, 'Return not found'));
    res.json({ success: true, data: ret });
  } catch (error) {
    next(error);
  }
};

/** Total already returned for one product line of an original document. */
export const alreadyReturnedQty = async (originalModel, originalId, productId, session) => {
  let agg = Return.aggregate([
    { $match: { originalModel, originalDocument: new mongoose.Types.ObjectId(originalId) } },
    { $unwind: '$items' },
    { $match: { 'items.product': new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
  ]);
  if (session) agg = agg.session(session);
  return (await agg)[0]?.qty || 0;
};

/**
 * Returnable quantities per line of an original document.
 * GET /api/returns/returnable/:model/:id  (model = Sale | Purchase)
 */
export const getReturnable = async (req, res, next) => {
  try {
    const { model, id } = req.params;
    if (!['Sale', 'Purchase'].includes(model)) throw new ApiError(400, 'Model must be Sale or Purchase.');
    const OriginalModel = model === 'Sale' ? Sale : Purchase;
    const original = await OriginalModel.findById(id);
    if (!original) return next(new ApiError(404, 'Original document not found'));
    if (original.status !== 'COMPLETED') {
      return next(new ApiError(400, 'Only completed documents can be returned.'));
    }
    const lines = [];
    for (const line of original.items) {
      const returned = await alreadyReturnedQty(model, original._id, line.product, null);
      const sold = Number(line.quantity);
      lines.push({
        product: line.product,
        productName: line.productName || '',
        sku: line.sku || '',
        soldQty: sold,
        returnedQty: returned,
        returnableQty: Math.max(0, sold - returned),
        rate: line.rate,
      });
    }
    res.json({
      success: true,
      data: {
        originalId: original._id,
        originalNumber: original.invoiceNumber,
        stream: original.transactionType,
        party: model === 'Sale' ? original.customerSnapshot?.name || '' : original.supplierSnapshot?.name || '',
        lines,
      },
    });
  } catch (error) {
    next(error);
  }
};

const snapshotCompany = (settings) => settings ? {
  companyName: settings.companyName || '',
  address: settings.address || '',
  gstin: settings.gstin || '',
  stateCode: settings.stateCode || '',
  phone: settings.phone || '',
  email: settings.email || '',
} : undefined;

/**
 * Shared core: build return lines mirroring the original document's
 * rates and taxation (never client-supplied), validate returnable
 * quantities, then post stock + ledger + original returnedAmount
 * atomically with the Return document.
 */
const createReturn = async ({ returnType, OriginalModel, originalId, items, reason, returnDate, idempotencyKey, req }) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'At least one return line is required.');
    }
    if (!reason || !String(reason).trim()) throw new ApiError(400, 'A reason is required for returns.');
    for (const line of items) {
      if (!line.product) throw new ApiError(400, 'Each return line must reference a product.');
      if (!(Number(line.quantity) > 0)) throw new ApiError(400, 'Return quantity must be greater than 0.');
    }

    if (idempotencyKey) {
      const replayed = await Return.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        await session.abortTransaction();
        session.endSession();
        return { doc: replayed, deduplicated: true };
      }
    }

    const original = await OriginalModel.findById(originalId).session(session);
    if (!original) throw new ApiError(404, 'Original document not found');
    if (original.status !== 'COMPLETED') {
      throw new ApiError(400, 'Only completed documents can be returned.');
    }

    const isSale = returnType === 'SALES_RETURN';
    const stream = original.transactionType; // TAX or ESTIMATE — GST reversal mirrors it
    const partyId = isSale ? original.customer : original.supplier;
    const settings = await CompanySettings.findOne().session(session);

    let subTotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const processedItems = [];

    for (const line of items) {
      const productId = String(line.product);
      const qty = Number(line.quantity);

      // Match original lines for this product (rates/tax mirror the original).
      const origLines = original.items.filter((l) => String(l.product) === productId);
      if (origLines.length === 0) {
        throw new ApiError(400, 'Product was not part of the original document.');
      }
      const soldQty = origLines.reduce((sum, l) => sum + Number(l.quantity), 0);
      const returnedQty = await alreadyReturnedQty(isSale ? 'Sale' : 'Purchase', original._id, productId, session);
      const returnable = soldQty - returnedQty;
      if (qty > returnable) {
        throw new ApiError(400, `Cannot return ${qty}: only ${returnable} unit(s) still returnable for this product.`);
      }

      const ref = origLines[0];
      const rate = Number(ref.rate);
      const taxableValue = rate * qty;
      let gstRate = 0, cgst = 0, sgst = 0, igst = 0;

      if (stream === 'TAX') {
        if (isSale) {
          gstRate = Number(ref.gstRate) || 0;
          const taxAmount = Math.round((taxableValue * gstRate) / 100);
          // Mirror the original line's intra/inter pattern.
          if (Number(ref.igst) > 0) {
            igst = taxAmount;
          } else {
            cgst = Math.round(taxAmount / 2);
            sgst = taxAmount - cgst;
          }
        } else {
          const taxRate = Number(ref.taxRate) || 0;
          gstRate = taxRate;
          const taxAmount = Math.round((taxableValue * taxRate) / 100);
          const supplier = await Supplier.findById(original.supplier).session(session);
          const intra = isIntraStateSupply(settings?.stateCode || '24', supplier?.stateCode || settings?.stateCode || '24');
          if (intra) {
            cgst = Math.round(taxAmount / 2);
            sgst = taxAmount - cgst;
          } else {
            igst = taxAmount;
          }
        }
      }

      subTotal += taxableValue;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      // Prefer the ORIGINAL line snapshots — best historical record.
      let live = null;
      if (!ref.productName) {
        live = await Product.findById(line.product).populate('unit', 'shortName').session(session);
      }
      processedItems.push({
        product: line.product,
        quantity: qty,
        rate,
        taxableValue,
        gstRate,
        cgst,
        sgst,
        igst,
        total: taxableValue + cgst + sgst + igst,
        productName: ref.productName || live?.name || '',
        sku: ref.sku || live?.sku || '',
        hsnCode: ref.hsnCode || live?.hsnCode || '',
        unitName: live?.unit?.shortName || '',
      });
    }

    const grandTotal = subTotal + totalCgst + totalSgst + totalIgst;
    const generated = await getNextDocumentNumber(isSale ? 'SALES_RETURN' : 'PURCHASE_RETURN', returnDate ? new Date(returnDate) : new Date());

    const partySnapshot = {};
    let partyName = '';
    if (isSale) {
      const cust = await Customer.findById(original.customer).session(session);
      partyName = cust?.name || original.customerSnapshot?.name || '';
      Object.assign(partySnapshot, {
        name: cust?.name || original.customerSnapshot?.name || '',
        gstin: cust?.gstin || original.customerSnapshot?.gstin || '',
        address: cust?.address || original.customerSnapshot?.address || '',
        phone: cust?.phone || original.customerSnapshot?.phone || '',
        stateCode: cust?.stateCode || original.customerSnapshot?.stateCode || '',
      });
    } else {
      const sup = await Supplier.findById(original.supplier).session(session);
      partyName = sup?.name || original.supplierSnapshot?.name || '';
      Object.assign(partySnapshot, {
        name: sup?.name || original.supplierSnapshot?.name || '',
        gstin: sup?.gstin || original.supplierSnapshot?.gstin || '',
        address: sup?.address || original.supplierSnapshot?.address || '',
        phone: sup?.phone || original.supplierSnapshot?.phone || '',
        stateCode: sup?.stateCode || original.supplierSnapshot?.stateCode || '',
      });
    }

    const ret = new Return({
      returnType,
      stream,
      returnNumber: generated.number,
      financialYear: generated.fy,
      originalModel: isSale ? 'Sale' : 'Purchase',
      originalDocument: original._id,
      originalNumber: original.invoiceNumber,
      customer: isSale ? original.customer : null,
      supplier: isSale ? null : original.supplier,
      ...(isSale ? { customerSnapshot: partySnapshot } : { supplierSnapshot: partySnapshot }),
      companySnapshot: snapshotCompany(settings),
      returnDate: returnDate || new Date(),
      items: processedItems,
      subTotal,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal,
      reason: String(reason).trim(),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    await ret.save({ session });

    // Stock: sales return restores physical stock (WAC-neutral carrying
    // cost so COGS can net it); purchase return removes stock.
    for (const item of processedItems) {
      if (isSale) {
        await applyStockIn({
          productId: item.product,
          quantity: item.quantity,
          unitCostPaise: null,
          stream,
          referenceDocument: ret._id,
          referenceModel: 'Return',
          remarks: `Sales return ${generated.number} against ${original.invoiceNumber}`,
        }, session);
      } else {
        await applyStockOut({
          productId: item.product,
          quantity: item.quantity,
          stream,
          referenceDocument: ret._id,
          referenceModel: 'Return',
          remarks: `Purchase return ${generated.number} against ${original.invoiceNumber}`,
        }, session);
      }
    }

    // Ledger: sales return credits the customer (receivable down);
    // purchase return debits the supplier entry (payable down).
    if (isSale) {
      const last = await CustomerLedger.findOne({ customer: partyId, stream }).sort({ createdAt: -1 }).session(session);
      const prev = last ? last.balanceAfter : 0;
      await new CustomerLedger({
        customer: partyId, stream, transactionType: 'RETURN',
        referenceDocument: ret._id, referenceModel: 'Return',
        credit: grandTotal, balanceAfter: prev - grandTotal,
      }).save({ session });
    } else {
      const last = await SupplierLedger.findOne({ supplier: partyId, stream }).sort({ createdAt: -1 }).session(session);
      const prev = last ? last.balanceAfter : 0;
      await new SupplierLedger({
        supplier: partyId, stream, transactionType: 'RETURN',
        referenceDocument: ret._id, referenceModel: 'Return',
        debit: grandTotal, balanceAfter: prev - grandTotal,
      }).save({ session });
    }

    // Track cumulative returned value on the original for outstanding math.
    await OriginalModel.findByIdAndUpdate(original._id, { $inc: { returnedAmount: grandTotal } }, { session });

    await session.commitTransaction();
    session.endSession();

    logAudit({
      action: isSale ? 'SALES_RETURN_CREATED' : 'PURCHASE_RETURN_CREATED',
      entity: 'Return',
      entityId: ret._id,
      userId: req.user._id,
      summary: `${isSale ? 'Sales' : 'Purchase'} return ${generated.number} against ${original.invoiceNumber} — ₹${(grandTotal / 100).toFixed(2)} (${partyName})`,
      metadata: { returnNumber: generated.number, originalNumber: original.invoiceNumber, grandTotal, stream, reason: String(reason).trim() },
      ipAddress: req.ip,
    });

    return { doc: ret, deduplicated: false };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const createSalesReturn = async (req, res, next) => {
  // Hoisted for the duplicate-key handler (catch scope).
  let idempotencyKey;
  try {
    idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    const { saleId, items, reason, returnDate } = req.body;
    if (!saleId) throw new ApiError(400, 'saleId is required.');
    const { doc, deduplicated } = await createReturn({
      returnType: 'SALES_RETURN', OriginalModel: Sale, originalId: saleId,
      items, reason, returnDate, idempotencyKey, req,
    });
    res.status(deduplicated ? 200 : 201).json({ success: true, data: doc, ...(deduplicated ? { deduplicated: true } : {}) });
  } catch (error) {
    if (error.code === 11000) {
      if (idempotencyKey) {
        const replayed = await Return.findOne({ idempotencyKey });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
      return next(new ApiError(400, 'Return already exists (duplicate).'));
    }
    next(error);
  }
};

export const createPurchaseReturn = async (req, res, next) => {
  let idempotencyKey;
  try {
    idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    const { purchaseId, items, reason, returnDate } = req.body;
    if (!purchaseId) throw new ApiError(400, 'purchaseId is required.');
    const { doc, deduplicated } = await createReturn({
      returnType: 'PURCHASE_RETURN', OriginalModel: Purchase, originalId: purchaseId,
      items, reason, returnDate, idempotencyKey, req,
    });
    res.status(deduplicated ? 200 : 201).json({ success: true, data: doc, ...(deduplicated ? { deduplicated: true } : {}) });
  } catch (error) {
    if (error.code === 11000) {
      if (idempotencyKey) {
        const replayed = await Return.findOne({ idempotencyKey });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
      return next(new ApiError(400, 'Return already exists (duplicate).'));
    }
    next(error);
  }
};
