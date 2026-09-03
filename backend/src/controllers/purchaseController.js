import mongoose from 'mongoose';
import Purchase from '../models/Purchase.js';
import StockMovement from '../models/StockMovement.js';
import SupplierLedger from '../models/SupplierLedger.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';

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

    // Recalculate totals server-side to prevent tampering
    let subTotal = 0;
    let taxTotal = 0;

    const processedItems = items.map(item => {
      const lineTotal = item.quantity * item.rate;
      const lineTax = transactionType === 'TAX' ? Math.round((lineTotal * item.taxRate) / 100) : 0;
      
      subTotal += lineTotal;
      taxTotal += lineTax;

      return {
        ...item,
        taxAmount: lineTax,
        total: lineTotal + lineTax
      };
    });

    const grandTotal = subTotal + taxTotal;

    // Create Purchase Document
    const purchase = new Purchase({
      transactionType,
      supplier,
      invoiceNumber,
      invoiceDate,
      items: processedItems,
      subTotal,
      taxTotal,
      grandTotal,
      status,
      remarks
    });

    await purchase.save({ session });

    // If COMPLETED, process stock and ledger
    if (status === 'COMPLETED') {
      for (const item of processedItems) {
        // 1. Create Stock Movement
        const stockMove = new StockMovement({
          product: item.product,
          stream: transactionType,
          type: 'IN',
          quantity: item.quantity,
          referenceDocument: purchase._id,
          referenceModel: 'Purchase'
        });
        await stockMove.save({ session });

        // 2. Update Cached Stock on Product
        const stockField = transactionType === 'TAX' ? 'taxStock' : 'estimateStock';
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { [stockField]: item.quantity } },
          { session }
        );
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
      return next(new ApiError(400, 'Invoice number already exists for this supplier in this stream'));
    }
    next(error);
  }
};
