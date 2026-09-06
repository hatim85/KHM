import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';
import { getNextDocumentNumber } from '../utils/documentNumbering.js';

export const getPayments = async (req, res, next) => {
  try {
    const { stream, type, partyType } = req.query;
    let query = Payment.find().populate('partyId', 'name gstin phone').sort({ createdAt: -1 });

    if (stream) query = query.where('stream').equals(stream);
    if (type) query = query.where('type').equals(type);
    if (partyType) query = query.where('partyType').equals(partyType);

    const payments = await query;
    res.json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    next(error);
  }
};

export const getUnpaidInvoices = async (req, res, next) => {
  try {
    const { partyType, partyId, stream } = req.query;
    
    if (!partyType || !partyId || !stream) {
      throw new ApiError(400, 'partyType, partyId, and stream are required');
    }

    const Model = partyType === 'Customer' ? Sale : Purchase;
    const partyField = partyType === 'Customer' ? 'customer' : 'supplier';
    
    const unpaidInvoices = await Model.find({
      [partyField]: partyId,
      transactionType: stream,
      status: 'COMPLETED',
      paymentStatus: { $ne: 'PAID' }
    }).sort({ invoiceDate: 1 }); // Sort by oldest first

    res.json({ success: true, count: unpaidInvoices.length, data: unpaidInvoices });
  } catch (error) {
    next(error);
  }
};

export const createPayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { type, stream, partyType, partyId, amount, paymentMode, referenceNumber, notes, date, allocations = [] } = req.body;

    if (!amount || amount <= 0) {
      throw new ApiError(400, 'Payment amount must be greater than zero');
    }
    if (!['RECEIPT', 'PAYMENT'].includes(type)) {
      throw new ApiError(400, 'Payment type must be RECEIPT or PAYMENT.');
    }
    if (!['TAX', 'ESTIMATE'].includes(stream)) {
      throw new ApiError(400, 'Stream must be TAX or ESTIMATE. Never mix streams in one payment.');
    }
    if (!['Customer', 'Supplier'].includes(partyType) || !partyId) {
      throw new ApiError(400, 'A valid partyType and partyId are required.');
    }

    // Duplicate-submission guard.
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    if (idempotencyKey) {
      const replayed = await Payment.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
    }

    // Snapshot the party name — history never reads live masters.
    const PartyModel = partyType === 'Customer' ? Customer : Supplier;
    const partyDoc = await PartyModel.findById(partyId).session(session);
    if (!partyDoc) throw new ApiError(404, `${partyType} not found`);

    // Validate allocations
    let totalAllocated = 0;
    for (const alloc of allocations) {
      if (alloc.amount < 0) throw new ApiError(400, 'Allocation amount cannot be negative');
      totalAllocated += alloc.amount;
    }

    if (totalAllocated > amount) {
      throw new ApiError(400, 'Total allocated amount cannot exceed payment amount');
    }

    const unallocatedAmount = amount - totalAllocated;

    // 1. Process Allocations (before consuming a voucher number, so a
    // rejected allocation never burns a number)
    const validatedAllocations = [];
    const ModelToUpdate = partyType === 'Customer' ? Sale : Purchase;
    
    for (const alloc of allocations) {
      if (alloc.amount === 0) continue; // Skip zero allocations
      
      const invoice = await ModelToUpdate.findById(alloc.invoiceId).session(session);
      if (!invoice) {
        throw new ApiError(404, `Invoice ${alloc.invoiceId} not found`);
      }
      if (invoice.transactionType !== stream) {
        throw new ApiError(400, `Invoice ${invoice.invoiceNumber} belongs to the ${invoice.transactionType} stream and cannot be allocated in a ${stream} payment.`);
      }
      
      const outstanding = invoice.grandTotal - (invoice.amountPaid || 0) - (invoice.returnedAmount || 0)
        - (invoice.creditNoteAmount || 0) - (invoice.debitNoteAmount || 0);
      if (alloc.amount > outstanding) {
        throw new ApiError(400, `Cannot overpay invoice ${invoice.invoiceNumber}. Outstanding: ${outstanding}`);
      }

      const newAmountPaid = (invoice.amountPaid || 0) + alloc.amount;
      // Return + note credits settle the invoice alongside cash.
      const settled = newAmountPaid + (invoice.returnedAmount || 0)
        + (invoice.creditNoteAmount || 0) + (invoice.debitNoteAmount || 0);
      const newPaymentStatus = settled >= invoice.grandTotal ? 'PAID' : newAmountPaid > 0 ? 'PARTIAL' : 'UNPAID';

      await ModelToUpdate.findByIdAndUpdate(invoice._id, {
        amountPaid: newAmountPaid,
        paymentStatus: newPaymentStatus
      }, { session });

      validatedAllocations.push({
        invoiceId: invoice._id,
        model: ModelToUpdate.modelName,
        invoiceNumber: invoice.invoiceNumber,
        amount: alloc.amount
      });
    }

    // 2. Generate Voucher Number atomically (PREFIX-FYMMDD-SEQ, per-day series;
    // backend-only, keyed on the voucher's business date — never reused)
    const generated = await getNextDocumentNumber(
      type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
      date ? new Date(date) : new Date()
    );
    const voucherNumber = generated.number;

    // 3. Create Payment Record
    const payment = new Payment({
      voucherNumber,
      financialYear: generated.fy,
      documentDate: generated.documentDate,
      date: date || new Date(),
      type,
      stream,
      partyType,
      partyId,
      partySnapshot: { name: partyDoc.name || '' },
      amount,
      paymentMode,
      referenceNumber,
      notes,
      allocations: validatedAllocations,
      unallocatedAmount,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    await payment.save({ session });

    // 4. Update Ledger
    if (partyType === 'Customer') {
      const lastLedger = await CustomerLedger.findOne({ customer: partyId, stream })
        .sort({ createdAt: -1 })
        .session(session);
      
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      
      const isReceipt = type === 'RECEIPT';
      const debitAmt = isReceipt ? 0 : amount;
      const creditAmt = isReceipt ? amount : 0;
      const newBalance = previousBalance + debitAmt - creditAmt;

      const ledgerEntry = new CustomerLedger({
        customer: partyId,
        stream,
        transactionType: type, // RECEIPT
        referenceDocument: payment._id,
        referenceModel: 'Payment',
        debit: debitAmt,
        credit: creditAmt,
        balanceAfter: newBalance
      });
      await ledgerEntry.save({ session });
    } else if (partyType === 'Supplier') {
      const lastLedger = await SupplierLedger.findOne({ supplier: partyId, stream })
        .sort({ createdAt: -1 })
        .session(session);
      
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      
      const isPayment = type === 'PAYMENT';
      const debitAmt = isPayment ? amount : 0;
      const creditAmt = isPayment ? 0 : amount;
      const newBalance = previousBalance + creditAmt - debitAmt;

      const ledgerEntry = new SupplierLedger({
        supplier: partyId,
        stream,
        transactionType: type, // PAYMENT
        referenceDocument: payment._id,
        referenceModel: 'Payment',
        debit: debitAmt,
        credit: creditAmt,
        balanceAfter: newBalance
      });
      await ledgerEntry.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Audit Log
    logAudit({
      action: 'PAYMENT_CREATED',
      entity: 'Payment',
      entityId: payment._id,
      userId: req.user._id,
      summary: `${type} ${voucherNumber} — ${stream} — ₹${(amount / 100).toFixed(2)}`,
      metadata: { type, stream, partyType, amount, voucherNumber, allocationsCount: validatedAllocations.length, unallocatedAmount },
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.code === 11000) {
      const key = req.headers['idempotency-key'] || req.body.idempotencyKey;
      if (key) {
        const replayed = await Payment.findOne({ idempotencyKey: key });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
    }
    next(error);
  }
};

/**
 * Reverse a payment: restore invoice outstanding, post offsetting ledger
 * entries, and mark the payment REVERSED. History is immutable — the
 * original payment is never edited or deleted.
 */
export const reversePayment = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const payment = await Payment.findById(req.params.id).session(session);
    if (!payment) throw new ApiError(404, 'Payment not found');
    if (payment.status === 'REVERSED') throw new ApiError(400, 'Payment is already reversed');

    const ModelToUpdate = payment.partyType === 'Customer' ? Sale : Purchase;

    // 1. Restore each allocated invoice's outstanding.
    for (const alloc of payment.allocations) {
      const invoice = await ModelToUpdate.findById(alloc.invoiceId).session(session);
      if (!invoice) throw new ApiError(404, `Allocated invoice ${alloc.invoiceId} not found`);
      const restoredPaid = Math.max(0, (invoice.amountPaid || 0) - alloc.amount);
      const restoredSettled = restoredPaid + (invoice.returnedAmount || 0)
        + (invoice.creditNoteAmount || 0) + (invoice.debitNoteAmount || 0);
      await ModelToUpdate.findByIdAndUpdate(invoice._id, {
        amountPaid: restoredPaid,
        paymentStatus: restoredSettled >= invoice.grandTotal ? 'PAID' : restoredPaid > 0 ? 'PARTIAL' : 'UNPAID',
      }, { session });
    }

    // 2. Post offsetting ledger entries (mirror image of the original).
    const partyField = payment.partyType === 'Customer' ? 'customer' : 'supplier';
    const LedgerModel = payment.partyType === 'Customer' ? CustomerLedger : SupplierLedger;
    const lastLedger = await LedgerModel.findOne({ [partyField]: payment.partyId, stream: payment.stream })
      .sort({ createdAt: -1 })
      .session(session);
    const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;

    // Original customer RECEIPT credited amount (balance -= amount);
    // reversal debits it back. Supplier PAYMENT debited; reversal credits back.
    // In both cases the reversal moves the balance opposite to the original.
    const originalDelta = payment.partyType === 'Customer'
      ? (payment.type === 'RECEIPT' ? -payment.amount : payment.amount)
      : (payment.type === 'PAYMENT' ? -payment.amount : payment.amount);
    const reversalDelta = -originalDelta;

    const reversalEntry = payment.partyType === 'Customer'
      ? new CustomerLedger({
          customer: payment.partyId,
          stream: payment.stream,
          transactionType: 'ADJUSTMENT',
          referenceDocument: payment._id,
          referenceModel: 'Payment',
          debit: reversalDelta > 0 ? reversalDelta : 0,
          credit: reversalDelta < 0 ? -reversalDelta : 0,
          balanceAfter: previousBalance + reversalDelta,
        })
      : new SupplierLedger({
          supplier: payment.partyId,
          stream: payment.stream,
          transactionType: 'ADJUSTMENT',
          referenceDocument: payment._id,
          referenceModel: 'Payment',
          debit: reversalDelta < 0 ? -reversalDelta : 0,
          credit: reversalDelta > 0 ? reversalDelta : 0,
          balanceAfter: previousBalance + reversalDelta,
        });
    await reversalEntry.save({ session });

    payment.status = 'REVERSED';
    payment.reversedAt = new Date();
    await payment.save({ session });

    await session.commitTransaction();
    session.endSession();

    logAudit({
      action: 'PAYMENT_REVERSED',
      entity: 'Payment',
      entityId: payment._id,
      userId: req.user._id,
      summary: `Reversed ${payment.type} ${payment.voucherNumber} — ₹${(payment.amount / 100).toFixed(2)} outstanding restored`,
      metadata: { voucherNumber: payment.voucherNumber, type: payment.type, stream: payment.stream, amount: payment.amount },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: payment });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
