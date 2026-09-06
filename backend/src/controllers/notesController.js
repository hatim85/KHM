import mongoose from 'mongoose';
import Note from '../models/Note.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Return from '../models/Return.js';
import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import CompanySettings from '../models/CompanySettings.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';
import { getNextDocumentNumber } from '../utils/documentNumbering.js';
import { isIntraStateSupply, isValidGstRate } from '../utils/gstMaster.js';
import { applyGst } from '../services/lineItemService.js';
// NOTE: Credit/Debit Notes intentionally have NO PDF generation or storage
// (no local files, no OCI/Oracle uploads) — record-only documents.

const NOTE_CONFIG = Object.freeze({
  CREDIT_NOTE: { partyType: 'Customer', originalModel: 'Sale', docType: 'CREDIT_NOTE', label: 'Credit Note' },
  DEBIT_NOTE: { partyType: 'Supplier', originalModel: 'Purchase', docType: 'DEBIT_NOTE', label: 'Debit Note' },
});

export const getNotes = async (req, res, next) => {
  try {
    const { noteType, status, partyId } = req.query;
    let query = Note.find()
      .populate('customer', 'name')
      .populate('supplier', 'name')
      .sort({ createdAt: -1 });
    if (noteType) query = query.where('noteType').equals(noteType);
    if (status) query = query.where('status').equals(status);
    if (partyId) {
      query = query.or([{ customer: partyId }, { supplier: partyId }]);
    }
    const notes = await query.limit(200);
    res.json({ success: true, count: notes.length, data: notes });
  } catch (error) {
    next(error);
  }
};

export const getNoteById = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id).populate('customer', 'name').populate('supplier', 'name');
    if (!note) return next(new ApiError(404, 'Note not found'));
    res.json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
};

/**
 * COMPLETED originals of a party that can still absorb a note
 * (outstanding after returns + prior notes must stay non-negative).
 * Powers the note-creation form's "original document" picker.
 */
export const getNoteOriginals = async (req, res, next) => {
  try {
    const { partyType, partyId } = req.query;
    if (!partyType || !partyId) throw new ApiError(400, 'partyType and partyId are required.');
    if (partyType === 'Customer') {
      const docs = await Sale.find({ customer: partyId, status: 'COMPLETED' }).sort({ invoiceDate: -1 }).limit(100);
      const data = docs.map((d) => ({
        _id: d._id,
        invoiceNumber: d.invoiceNumber,
        invoiceDate: d.invoiceDate,
        grandTotal: d.grandTotal,
        outstanding: d.grandTotal - (d.amountPaid || 0) - (d.returnedAmount || 0) - (d.creditNoteAmount || 0),
      })).filter((d) => d.outstanding > 0);
      return res.json({ success: true, count: data.length, data });
    }
    if (partyType === 'Supplier') {
      const docs = await Purchase.find({ supplier: partyId, status: 'COMPLETED' }).sort({ invoiceDate: -1 }).limit(100);
      const data = docs.map((d) => ({
        _id: d._id,
        invoiceNumber: d.invoiceNumber,
        invoiceDate: d.invoiceDate,
        grandTotal: d.grandTotal,
        outstanding: d.grandTotal - (d.amountPaid || 0) - (d.returnedAmount || 0) - (d.debitNoteAmount || 0),
      })).filter((d) => d.outstanding > 0);
      return res.json({ success: true, count: data.length, data });
    }
    throw new ApiError(400, 'partyType must be Customer or Supplier.');
  } catch (error) {
    next(error);
  }
};

const recomputePaymentStatus = (doc) => {
  const settled = (doc.amountPaid || 0) + (doc.returnedAmount || 0)
    + (doc.creditNoteAmount || 0) + (doc.debitNoteAmount || 0);
  if (settled >= doc.grandTotal) return 'PAID';
  if ((doc.amountPaid || 0) > 0 || (doc.returnedAmount || 0) > 0 || (doc.creditNoteAmount || 0) > 0 || (doc.debitNoteAmount || 0) > 0) return 'PARTIAL';
  return 'UNPAID';
};

export const createNote = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let idempotencyKey;
  try {
    const { noteType, customer, supplier, originalId, linkedReturnId, items, reason, noteDate, status } = req.body;
    const config = NOTE_CONFIG[noteType];
    if (!config) throw new ApiError(400, 'noteType must be CREDIT_NOTE or DEBIT_NOTE.');

    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, 'At least one adjustment line is required.');
    }
    if (!reason || !String(reason).trim()) throw new ApiError(400, 'A reason is required for notes.');
    if (!originalId) throw new ApiError(400, 'A link to the original invoice/purchase is required.');

    idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    if (idempotencyKey) {
      const replayed = await Note.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
    }

    const OriginalModel = config.originalModel === 'Sale' ? Sale : Purchase;
    const original = await OriginalModel.findById(originalId).session(session);
    if (!original) throw new ApiError(404, 'Original document not found');
    if (original.status !== 'COMPLETED') {
      throw new ApiError(400, 'Only completed invoices/purchases can be adjusted with a note.');
    }

    const isCredit = noteType === 'CREDIT_NOTE';
    const partyId = isCredit ? (customer || original.customer) : (supplier || original.supplier);
    if (!partyId) throw new ApiError(400, isCredit ? 'Customer is required.' : 'Supplier is required.');
    const expectedParty = isCredit ? String(original.customer) : String(original.supplier);
    if (String(partyId) !== expectedParty) {
      throw new ApiError(400, `This ${config.label} must belong to the original document's ${isCredit ? 'customer' : 'supplier'}.`);
    }

    let settings = await CompanySettings.findOne().session(session);
    if (!settings) settings = await new CompanySettings({ isSingleton: true }).save({ session });

    const partyDoc = isCredit
      ? await Customer.findById(partyId).session(session)
      : await Supplier.findById(partyId).session(session);
    if (!partyDoc) throw new ApiError(404, isCredit ? 'Customer not found' : 'Supplier not found');

    let linkedReturn = null;
    if (linkedReturnId) {
      linkedReturn = await Return.findById(linkedReturnId).session(session);
      if (!linkedReturn) throw new ApiError(404, 'Linked return not found');
      if (String(linkedReturn.originalDocument) !== String(original._id)) {
        throw new ApiError(400, 'Linked return belongs to a different original document.');
      }
    }

    const stream = original.transactionType; // TAX or ESTIMATE — tax mirrors it
    const intraParty = isIntraStateSupply(
      settings?.stateCode || '24',
      partyDoc.stateCode || settings?.stateCode || '24',
    );

    // Build lines. Product lines mirror the ORIGINAL line's rate + GST
    // treatment (never client-supplied tax); free-form lines use validated input.
    let subTotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const processedItems = [];
    for (const line of items) {
      if (!line.description || !String(line.description).trim()) {
        throw new ApiError(400, 'Each adjustment line needs a description.');
      }
      const qty = line.quantity !== undefined ? Number(line.quantity) : 1;
      if (!(qty > 0)) throw new ApiError(400, 'Adjustment quantity must be greater than 0.');

      let rate = Number(line.rate) || 0;
      let gstRate = 0;
      let productName = '', sku = '', hsnCode = '', unitName = '';
      let taxableValue;

      if (line.product) {
        const origLines = original.items.filter((l) => String(l.product) === String(line.product));
        if (origLines.length === 0) {
          throw new ApiError(400, 'Product was not part of the original document.');
        }
        const ref = origLines[0];
        if (!(rate > 0)) rate = Number(ref.rate);
        gstRate = Number(isCredit ? ref.gstRate : ref.taxRate) || 0;
        productName = ref.productName || '';
        sku = ref.sku || '';
        hsnCode = ref.hsnCode || '';
        const billBase = qty * rate;
        if (stream === 'TAX') {
          const intra = isCredit ? Number(ref.igst) <= 0 : intraParty;
          const computed = applyGst({ billBase, gstRate, isTax: true, intra });
          taxableValue = computed.taxableValue;
          processedItems.push({
            product: line.product,
            description: String(line.description).trim().slice(0, 500),
            quantity: qty, rate, taxableValue,
            gstRate, cgst: computed.cgst, sgst: computed.sgst, igst: computed.igst,
            total: computed.total, productName, sku, hsnCode, unitName,
          });
        } else {
          taxableValue = billBase;
          processedItems.push({
            product: line.product,
            description: String(line.description).trim().slice(0, 500),
            quantity: qty, rate, taxableValue,
            gstRate: 0, cgst: 0, sgst: 0, igst: 0,
            total: taxableValue, productName, sku, hsnCode, unitName,
          });
        }
      } else {
        // Free-form financial adjustment (discount missed, excess charged…).
        if (line.taxableValue !== undefined) taxableValue = Math.round(Number(line.taxableValue));
        else taxableValue = Math.round(qty * rate);
        if (!(taxableValue >= 0)) throw new ApiError(400, 'Adjustment value must be >= 0.');
        gstRate = Number(line.gstRate) || 0;
        if (!isValidGstRate(gstRate)) throw new ApiError(400, `Invalid GST rate: ${line.gstRate}.`);
        if (stream === 'TAX') {
          const computed = applyGst({ billBase: taxableValue, gstRate, isTax: true, intra: intraParty });
          processedItems.push({
            product: null,
            description: String(line.description).trim().slice(0, 500),
            quantity: qty, rate, taxableValue: computed.taxableValue,
            gstRate, cgst: computed.cgst, sgst: computed.sgst, igst: computed.igst,
            total: computed.total, productName, sku, hsnCode, unitName,
          });
        } else {
          processedItems.push({
            product: null,
            description: String(line.description).trim().slice(0, 500),
            quantity: qty, rate, taxableValue,
            gstRate: 0, cgst: 0, sgst: 0, igst: 0,
            total: taxableValue, productName, sku, hsnCode, unitName,
          });
        }
      }
      const last = processedItems[processedItems.length - 1];
      subTotal += last.taxableValue;
      totalCgst += last.cgst;
      totalSgst += last.sgst;
      totalIgst += last.igst;
    }

    const grandTotal = subTotal + totalCgst + totalSgst + totalIgst;
    if (!(grandTotal > 0)) throw new ApiError(400, 'Note total must be greater than 0.');

    // A note can never push the original's outstanding below zero.
    const outstanding = original.grandTotal - (original.amountPaid || 0)
      - (original.returnedAmount || 0)
      - (isCredit ? (original.creditNoteAmount || 0) : (original.debitNoteAmount || 0));
    if (status === 'COMPLETED' && grandTotal > outstanding) {
      throw new ApiError(400, `Note value ₹${(grandTotal / 100).toFixed(2)} exceeds the original's outstanding ₹${(outstanding / 100).toFixed(2)}.`);
    }

    const generated = await getNextDocumentNumber(config.docType, noteDate ? new Date(noteDate) : new Date());

    const note = new Note({
      noteType,
      documentNumber: generated.number,
      noteDate: noteDate ? new Date(noteDate) : new Date(),
      documentDate: generated.documentDate,
      financialYear: generated.fy,
      partyType: config.partyType,
      customer: isCredit ? partyId : null,
      supplier: isCredit ? null : partyId,
      originalModel: config.originalModel,
      originalDocument: original._id,
      originalDocumentNumber: original.invoiceNumber,
      linkedReturn: linkedReturn ? linkedReturn._id : null,
      stream,
      items: processedItems,
      subTotal,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal,
      reason: String(reason).trim(),
      status: status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT',
      partySnapshot: {
        name: partyDoc.name || '',
        gstin: partyDoc.gstin || '',
        address: partyDoc.address || '',
        phone: partyDoc.phone || '',
        stateCode: partyDoc.stateCode || '',
      },
      companySnapshot: settings ? {
        companyName: settings.companyName || '',
        address: settings.address || '',
        gstin: settings.gstin || '',
        stateCode: settings.stateCode || '',
        phone: settings.phone || '',
        email: settings.email || '',
      } : undefined,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    await note.save({ session });

    if (note.status === 'COMPLETED') {
      if (isCredit) {
        const last = await CustomerLedger.findOne({ customer: partyId, stream }).sort({ createdAt: -1 }).session(session);
        const prev = last ? last.balanceAfter : 0;
        await new CustomerLedger({
          customer: partyId, stream, transactionType: 'CREDIT_NOTE',
          referenceDocument: note._id, referenceModel: 'Note',
          credit: grandTotal, balanceAfter: prev - grandTotal,
        }).save({ session });
        await Sale.findByIdAndUpdate(original._id, {
          $inc: { creditNoteAmount: grandTotal },
        }, { session });
      } else {
        const last = await SupplierLedger.findOne({ supplier: partyId, stream }).sort({ createdAt: -1 }).session(session);
        const prev = last ? last.balanceAfter : 0;
        await new SupplierLedger({
          supplier: partyId, stream, transactionType: 'DEBIT_NOTE',
          referenceDocument: note._id, referenceModel: 'Note',
          credit: grandTotal, balanceAfter: prev + grandTotal,
        }).save({ session });
        await Purchase.findByIdAndUpdate(original._id, {
          $inc: { debitNoteAmount: grandTotal },
        }, { session });
      }
      const refreshed = await OriginalModel.findById(original._id).session(session);
      await OriginalModel.findByIdAndUpdate(original._id, {
        paymentStatus: recomputePaymentStatus(refreshed),
      }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    // No PDF step: CN/DN are record-only (never generated, stored, or uploaded).

    logAudit({
      action: isCredit ? 'CREDIT_NOTE_CREATED' : 'DEBIT_NOTE_CREATED',
      entity: 'Note',
      entityId: note._id,
      userId: req.user._id,
      summary: `${config.label} ${note.documentNumber} against ${original.invoiceNumber} — ₹${(grandTotal / 100).toFixed(2)}`,
      metadata: { noteType, documentNumber: note.documentNumber, originalNumber: original.invoiceNumber, grandTotal },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.code === 11000) {
      if (idempotencyKey) {
        const replayed = await Note.findOne({ idempotencyKey });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
      }
      return next(new ApiError(400, 'Note already exists (duplicate).'));
    }
    next(error);
  }
};

/**
 * Cancel a COMPLETED note: posts mirror ledger entries and releases the
 * original's note-adjusted amount. Numbers are retained, never reused.
 * Finalized notes are never edited.
 */
export const cancelNote = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const note = await Note.findById(req.params.id).session(session);
    if (!note) throw new ApiError(404, 'Note not found');
    if (note.status === 'CANCELLED') throw new ApiError(400, 'Note is already cancelled');
    if (note.status !== 'COMPLETED') {
      note.status = 'CANCELLED';
      await note.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.json({ success: true, data: note });
    }

    const isCredit = note.noteType === 'CREDIT_NOTE';
    const partyId = isCredit ? note.customer : note.supplier;
    const OriginalModel = note.originalModel === 'Sale' ? Sale : Purchase;
    const amountField = isCredit ? 'creditNoteAmount' : 'debitNoteAmount';

    const original = await OriginalModel.findById(note.originalDocument).session(session);
    if (original && (original[amountField] || 0) < note.grandTotal) {
      throw new ApiError(400, 'Note cannot be cancelled — the original no longer carries this adjustment.');
    }

    if (isCredit) {
      const last = await CustomerLedger.findOne({ customer: partyId, stream: note.stream }).sort({ createdAt: -1 }).session(session);
      const prev = last ? last.balanceAfter : 0;
      await new CustomerLedger({
        customer: partyId, stream: note.stream, transactionType: 'CREDIT_NOTE',
        referenceDocument: note._id, referenceModel: 'Note',
        debit: note.grandTotal, balanceAfter: prev + note.grandTotal,
      }).save({ session });
    } else {
      const last = await SupplierLedger.findOne({ supplier: partyId, stream: note.stream }).sort({ createdAt: -1 }).session(session);
      const prev = last ? last.balanceAfter : 0;
      await new SupplierLedger({
        supplier: partyId, stream: note.stream, transactionType: 'DEBIT_NOTE',
        referenceDocument: note._id, referenceModel: 'Note',
        debit: note.grandTotal, balanceAfter: prev - note.grandTotal,
      }).save({ session });
    }

    if (original) {
      await OriginalModel.findByIdAndUpdate(original._id, {
        $inc: { [amountField]: -note.grandTotal },
      }, { session });
      const refreshed = await OriginalModel.findById(original._id).session(session);
      await OriginalModel.findByIdAndUpdate(original._id, {
        paymentStatus: recomputePaymentStatus(refreshed),
      }, { session });
    }

    note.status = 'CANCELLED';
    await note.save({ session });
    await session.commitTransaction();
    session.endSession();

    logAudit({
      action: isCredit ? 'CREDIT_NOTE_CANCELLED' : 'DEBIT_NOTE_CANCELLED',
      entity: 'Note',
      entityId: note._id,
      userId: req.user._id,
      summary: `Cancelled ${note.noteType === 'CREDIT_NOTE' ? 'credit note' : 'debit note'} ${note.documentNumber} (number retained, never reused)`,
      metadata: { noteType: note.noteType, documentNumber: note.documentNumber },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: note });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
