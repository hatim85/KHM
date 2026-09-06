import mongoose from 'mongoose';
import Purchase from '../models/Purchase.js';
import SupplierLedger from '../models/SupplierLedger.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';
import { applyStockIn } from '../services/inventoryService.js';
import { resolveDualQty } from '../services/lineItemService.js';

export const getPurchases = async (req, res, next) => {
  try {
    const { stream, status } = req.query;
    let query = Purchase.find().populate('supplier', 'name').sort({ createdAt: -1 });

    if (stream) query = query.where('transactionType').equals(stream);
    if (status) query = query.where('status').equals(status);

    const purchases = await query;
    res.json({ success: true, count: purchases.length, data: purchases });
  } catch (error) {
    next(error);
  }
};

export const getPurchaseById = async (req, res, next) => {
  try {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier', 'name gstin')
      .populate('items.product', 'name sku');
    
    if (!purchase) return next(new ApiError(404, 'Purchase not found'));
    res.json({ success: true, data: purchase });
  } catch (error) {
    next(error);
  }
};

export const createPurchase = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionType, supplier, invoiceNumber, invoiceDate, items, status, remarks } = req.body;

    if (!transactionType || !['TAX', 'ESTIMATE'].includes(transactionType)) {
      throw new ApiError(400, 'A valid transactionType (TAX or ESTIMATE) is required.');
    }
    if (!supplier) throw new ApiError(400, 'Supplier is required.');
    if (!invoiceNumber || !String(invoiceNumber).trim()) throw new ApiError(400, 'Supplier invoice number is required.');
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'At least one line item is required.');
    }
    for (const item of items) {
      if (!item.product) throw new ApiError(400, 'Each line item must reference a product.');
      if (!(Number(item.quantity) > 0)) throw new ApiError(400, 'Quantity must be greater than 0.');
      if (!(Number(item.rate) >= 0)) throw new ApiError(400, 'Rate must be >= 0.');
    }
    // One product per bill — the same product cannot appear on two lines.
    const seenProducts = new Set();
    for (const item of items) {
      const key = String(item.product);
      if (seenProducts.has(key)) throw new ApiError(400, 'Duplicate product in bill. Each product can appear only once per bill — increase the quantity instead.');
      seenProducts.add(key);
    }

    // Duplicate-submission guard.
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    if (idempotencyKey) {
      const replayed = await Purchase.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
    }

    const supplierDoc = await Supplier.findById(supplier).session(session);
    if (!supplierDoc) throw new ApiError(404, 'Supplier not found');

    // Recalculate totals server-side to prevent tampering.
    // Validate products exist up-front and capture snapshots.
    let subTotal = 0;
    let taxTotal = 0;

    const processedItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product).populate('unit', 'shortName').populate('secondaryUnit', 'shortName').session(session);
      if (!product) throw new ApiError(404, `Product not found: ${item.product}`);
      const rate = Number(item.rate);
      // Dual quantities: primary always drives stock; rate follows pricingBasis.
      const { qty, sec, secName, basis } = resolveDualQty({
        product, quantity: item.quantity, secondaryQty: item.secondaryQty,
      });
      const lineTotal = (basis === 'SECONDARY' ? sec : qty) * rate;
      const lineTax = transactionType === 'TAX' ? Math.round((lineTotal * Number(item.taxRate || 0)) / 100) : 0;

      subTotal += lineTotal;
      taxTotal += lineTax;

      processedItems.push({
        product: item.product,
        quantity: qty,
        rate,
        secondaryQty: sec,
        secondaryUnitName: secName,
        pricingBasis: basis,
        taxRate: Number(item.taxRate) || 0,
        taxAmount: lineTax,
        total: lineTotal + lineTax,
        productName: product.name || '',
        sku: product.sku || '',
        hsnCode: product.hsnCode || '',
        unitName: product.unit?.shortName || '',
      });
    }

    const grandTotal = subTotal + taxTotal;

    // Create Purchase Document
    const purchase = new Purchase({
      transactionType,
      supplier,
      invoiceNumber: String(invoiceNumber).trim(),
      invoiceDate,
      items: processedItems,
      subTotal,
      taxTotal,
      grandTotal,
      status,
      remarks,
      supplierSnapshot: {
        name: supplierDoc.name || '',
        gstin: supplierDoc.gstin || '',
        address: supplierDoc.address || '',
        phone: supplierDoc.phone || '',
        stateCode: supplierDoc.stateCode || '',
      },
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    await purchase.save({ session });

    // If COMPLETED, process stock and ledger
    if (status === 'COMPLETED') {
      for (const item of processedItems) {
        // Pool stock IN + WAC update. WAC is tracked per PRIMARY unit, so a
        // SECONDARY-quoted rate is converted: total line cost / primary qty.
        const unitCostPerPrimary = item.quantity > 0
          ? Math.round(((item.pricingBasis === 'SECONDARY' ? item.secondaryQty : item.quantity) * item.rate) / item.quantity)
          : item.rate;
        await applyStockIn({
          productId: item.product,
          quantity: item.quantity,
          secondaryQuantity: item.secondaryQty || 0,
          unitCostPaise: unitCostPerPrimary,
          stream: transactionType,
          referenceDocument: purchase._id,
          referenceModel: 'Purchase',
        }, session);
      }

      // 3. Update Supplier Ledger
      // Find latest balance
      const lastLedger = await SupplierLedger.findOne({ supplier, stream: transactionType })
        .sort({ createdAt: -1 })
        .session(session);
      
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      const newBalance = previousBalance + grandTotal;

      const ledgerEntry = new SupplierLedger({
        supplier,
        stream: transactionType,
        transactionType: 'PURCHASE',
        referenceDocument: purchase._id,
        referenceModel: 'Purchase',
        credit: grandTotal,
        balanceAfter: newBalance
      });
      await ledgerEntry.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Audit Log
    logAudit({
      action: 'PURCHASE_CREATED',
      entity: 'Purchase',
      entityId: purchase._id,
      userId: req.user._id,
      summary: `Created ${transactionType} Purchase ${invoiceNumber} — ₹${(grandTotal / 100).toFixed(2)}`,
      metadata: { transactionType, invoiceNumber, grandTotal },
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: purchase });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    // Handle unique constraint error on invoice number gracefully
    if (error.code === 11000) {
      if (req.headers['idempotency-key'] || req.body.idempotencyKey) {
        const replayed = await Purchase.findOne({ idempotencyKey: req.headers['idempotency-key'] || req.body.idempotencyKey });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
      return next(new ApiError(400, 'Invoice number already exists for this supplier in this stream'));
    }
    next(error);
  }
};
