import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import CompanySettings from '../models/CompanySettings.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';

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

    // 1. Generate Voucher Number
    const settings = await CompanySettings.findOne().session(session);
    let voucherNumber = '';
    
    if (type === 'RECEIPT') {
      voucherNumber = `${settings.receiptPrefix || 'REC-'}${String(settings.receiptNextNumber || 1).padStart(4, '0')}`;
      await CompanySettings.findByIdAndUpdate(settings._id, { $inc: { receiptNextNumber: 1 } }, { session });
    } else {
      voucherNumber = `${settings.paymentPrefix || 'PAY-'}${String(settings.paymentNextNumber || 1).padStart(4, '0')}`;
      await CompanySettings.findByIdAndUpdate(settings._id, { $inc: { paymentNextNumber: 1 } }, { session });
    }

    // 2. Process Allocations
    const validatedAllocations = [];
    const ModelToUpdate = partyType === 'Customer' ? Sale : Purchase;
    
    for (const alloc of allocations) {
      if (alloc.amount === 0) continue; // Skip zero allocations
      
      const invoice = await ModelToUpdate.findById(alloc.invoiceId).session(session);
      if (!invoice) {
        throw new ApiError(404, `Invoice ${alloc.invoiceId} not found`);
      }
      
      const outstanding = invoice.grandTotal - (invoice.amountPaid || 0);
      if (alloc.amount > outstanding) {
        throw new ApiError(400, `Cannot overpay invoice ${invoice.invoiceNumber}. Outstanding: ${outstanding}`);
      }

      const newAmountPaid = (invoice.amountPaid || 0) + alloc.amount;
      const newPaymentStatus = newAmountPaid >= invoice.grandTotal ? 'PAID' : 'PARTIAL';

      await ModelToUpdate.findByIdAndUpdate(invoice._id, {
        amountPaid: newAmountPaid,
        paymentStatus: newPaymentStatus
      }, { session });

      validatedAllocations.push({
        invoiceId: invoice._id,
        model: ModelToUpdate.modelName,
        amount: alloc.amount
      });
    }

    // 3. Create Payment Record
    const payment = new Payment({
      voucherNumber,
      date: date || new Date(),
      type,
      stream,
      partyType,
      partyId,
      amount,
      paymentMode,
      referenceNumber,
      notes,
      allocations: validatedAllocations,
      unallocatedAmount
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
    next(error);
  }
};
