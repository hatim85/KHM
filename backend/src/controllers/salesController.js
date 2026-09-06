import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Return from '../models/Return.js';
import CustomerLedger from '../models/CustomerLedger.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import CompanySettings from '../models/CompanySettings.js';
import ApiError from '../utils/ApiError.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';
import { logAudit } from '../utils/auditLogger.js';
import { getNextDocumentNumber } from '../utils/documentNumbering.js';
import { isIntraStateSupply as checkIntraState } from '../utils/gstMaster.js';
import { alreadyReturnedQty } from './returnsController.js';
import { applyGst, resolveDualQty } from '../services/lineItemService.js';
import { applyStockIn, applyStockOut } from '../services/inventoryService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getObjectStream } from '../services/ociStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSales = async (req, res, next) => {
  try {
    const { stream, status, paymentStatus, billType } = req.query;
    let query = Sale.find().populate('customer', 'name').sort({ createdAt: -1 });

    if (stream) query = query.where('transactionType').equals(stream);
    if (status) query = query.where('status').equals(status);
    if (paymentStatus) query = query.where('paymentStatus').equals(paymentStatus);
    if (billType && ['TAX_INVOICE', 'BILL_OF_SUPPLY'].includes(billType)) {
      query = query.where('billType').equals(billType);
    }

    const sales = await query;
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Bill-of-Supply split helpers (GST law: 0%-GST lines are exempt supplies and
// must be billed on a Bill of Supply, never on a Tax Invoice).
// Stock + ledger stay in the TAX stream for both documents; only the numbering
// series (INV- vs BOS-) and the PDF presentation differ.
// ---------------------------------------------------------------------------

/** Allocate a backend-generated production number (PREFIX-FYMMDD-SEQ).
 * Client-supplied numbers are never honoured — numbering is backend-only. */
const allocateSaleNumber = async ({ docType, invoiceDate }) => {
  const generated = await getNextDocumentNumber(docType, invoiceDate ? new Date(invoiceDate) : new Date());
  return { invoiceNumber: generated.number, financialYear: generated.fy, documentDate: generated.documentDate };
};

/** Build processed line items + totals for one partition of request lines. */
const buildPartitionTotals = async ({ lines, transactionType, isIntraState, session }) => {
  let subTotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const processedItems = [];
  for (const item of lines) {
    const product = await Product.findById(item.product).populate('unit', 'shortName').populate('secondaryUnit', 'shortName').session(session);
    if (!product) throw new ApiError(404, `Product not found: ${item.product}`);

    const { qty, sec, secName, basis } = resolveDualQty({
      product, quantity: item.quantity, secondaryQty: item.secondaryQty,
    });
    const billBase = (basis === 'SECONDARY' ? sec : qty) * item.rate;
    const gstRate = product.gstRate || 0;
    const { taxableValue, cgst, sgst, igst, total: itemTotal } = applyGst({
      billBase, gstRate, isTax: transactionType === 'TAX', intra: isIntraState,
    });

    subTotal += taxableValue;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;

    processedItems.push({
      product: item.product,
      quantity: qty,
      rate: item.rate,
      secondaryQty: sec,
      secondaryUnitName: secName,
      pricingBasis: basis,
      specification: String(product.specification || '').trim().slice(0, 500),
      taxableValue,
      gstRate,
      cgst,
      sgst,
      igst,
      total: itemTotal,
      productName: product.name || '',
      sku: product.sku || '',
      hsnCode: product.hsnCode || '',
      unitName: product.unit?.shortName || '',
    });
  }
  return { processedItems, subTotal, totalCgst, totalSgst, totalIgst };
};

const createSaleDocument = async ({
  session, transactionType, billType, splitGroupId,
  customerId, custDoc, settings, invoiceNumber, financialYear, documentDate,
  invoiceDate, processedItems, subTotal, totalCgst, totalSgst, totalIgst,
  discount, status, remarks, dispatchThrough, idempotencyKey,
}) => {
  const grandTotal = subTotal + totalCgst + totalSgst + totalIgst - discount;
  const sale = new Sale({
    transactionType,
    billType,
    ...(splitGroupId ? { splitGroupId } : {}),
    customer: customerId,
    invoiceNumber,
    financialYear,
    documentDate: documentDate || (invoiceDate ? new Date(invoiceDate) : new Date()),
    invoiceDate,
    items: processedItems,
    subTotal,
    totalCgst,
    totalSgst,
    totalIgst,
    discount,
    grandTotal,
    status,
    remarks,
    dispatchThrough: String(dispatchThrough || '').trim(),
    customerSnapshot: {
      name: custDoc.name || '',
      gstin: custDoc.gstin || '',
      address: custDoc.address || '',
      phone: custDoc.phone || '',
      stateCode: custDoc.stateCode || '',
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
  await sale.save({ session });

  if (status === 'COMPLETED') {
    for (const item of processedItems) {
      await applyStockOut({
        productId: item.product,
        quantity: item.quantity,
        secondaryQuantity: item.secondaryQty || 0,
        stream: transactionType,
        referenceDocument: sale._id,
        referenceModel: 'Sale',
      }, session);
    }

    const lastLedger = await CustomerLedger.findOne({ customer: customerId, stream: transactionType })
      .sort({ createdAt: -1 })
      .session(session);
    const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
    await new CustomerLedger({
      customer: customerId,
      stream: transactionType,
      transactionType: 'SALE',
      referenceDocument: sale._id,
      referenceModel: 'Sale',
      debit: grandTotal,
      balanceAfter: previousBalance + grandTotal,
    }).save({ session });
  }
  return sale;
};

const generateSalePdf = async (sale) => {
  try {
    await sale.populate('customer', 'name address gstin phone stateCode');
    await sale.populate({ path: 'items.product', select: 'name sku hsnCode unit secondaryUnit', populate: [{ path: 'unit', select: 'shortName' }, { path: 'secondaryUnit', select: 'shortName' }] });
    const settings = await CompanySettings.findOne();
    const pdfMeta = await generateInvoicePDF(sale, settings);
    await Sale.findByIdAndUpdate(sale._id, { pdf: pdfMeta });
    sale.pdf = pdfMeta;
  } catch (pdfError) {
    console.error('PDF Generation failed:', pdfError);
  }
};

export const createSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  // Hoisted for the duplicate-key handler below (catch scope).
  let idempotencyKey;

  try {
    const { transactionType, customer, invoiceDate, items, status, discount, remarks, dispatchThrough } = req.body;
    // NOTE: client-supplied invoice numbers are ignored — document numbers
    // are generated ONLY on the backend (PREFIX-FYMMDD-SEQ).

    if (!transactionType || !['TAX', 'ESTIMATE'].includes(transactionType)) {
      throw new ApiError(400, 'A valid transactionType (TAX or ESTIMATE) is required.');
    }
    if (!customer) throw new ApiError(400, 'Customer is required.');
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

    // Duplicate-submission guard: replaying an Idempotency-Key returns the
    // original document(s) instead of creating a second sale. Split bills
    // share a splitGroupId, so a replay returns the whole split family.
    idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    if (idempotencyKey) {
      const replayed = await Sale.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        let splitBills = [replayed];
        let splitOccurred = false;
        if (replayed.splitGroupId) {
          splitBills = await Sale.find({ splitGroupId: replayed.splitGroupId }).session(session);
          // Tax invoice first for a stable response shape.
          splitBills.sort((a, b) => (a.billType === b.billType ? 0 : a.billType === 'TAX_INVOICE' ? -1 : 1));
          splitOccurred = splitBills.length > 1;
        }
        const primary = splitBills.find((s) => s.billType === 'TAX_INVOICE') || splitBills[0];
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: primary, splitBills, splitOccurred, deduplicated: true });
      }
    }

    let settings = await CompanySettings.findOne().session(session);
    if (!settings) {
      settings = await new CompanySettings({ isSingleton: true }).save({ session });
    }
    const companyStateCode = settings ? settings.stateCode : '24'; // Default to Gujarat

    const custDoc = await Customer.findById(customer).session(session);
    if (!custDoc) throw new ApiError(404, 'Customer not found');
    const customerStateCode = custDoc.stateCode || '24';

    // Pre-validate pool stock BEFORE consuming a document number so a
    // failed sale never burns a number (gaps are still safe, just avoided).
    // Pools are separate: TAX sales draw taxStock, ESTIMATE sales draw estimateStock.
    // Bills of Supply draw the TAX pool — exemption changes paperwork, not physics.
    if (status === 'COMPLETED') {
      const poolField = transactionType === 'TAX' ? 'taxStock' : 'estimateStock';
      for (const item of items) {
        const product = await Product.findById(item.product).session(session);
        if (!product) throw new ApiError(404, `Product not found: ${item.product}`);
        if ((product[poolField] || 0) < Number(item.quantity)) {
          throw new ApiError(400, `Insufficient ${transactionType} stock for ${product.name}. Required: ${item.quantity}, Available: ${product[poolField] || 0}`);
        }
      }
    }

    // GST split classification (TAX sales only, decided on the product
    // master's gstRate — never client-supplied). 0% lines are exempt and
    // belong on a Bill of Supply; >0% lines stay on the Tax Invoice.
    // ESTIMATE sales never split.
    let exemptLines = [];
    let taxableLines = [];
    if (transactionType === 'TAX') {
      const rateCache = new Map();
      for (const item of items) {
        let gstRate = rateCache.get(String(item.product));
        if (gstRate === undefined) {
          const product = await Product.findById(item.product).select('gstRate').session(session);
          if (!product) throw new ApiError(404, `Product not found: ${item.product}`);
          gstRate = Number(product.gstRate) || 0;
          rateCache.set(String(item.product), gstRate);
        }
        if (gstRate === 0) exemptLines.push(item);
        else taxableLines.push(item);
      }
    } else {
      taxableLines = items;
    }
    const isSplit = exemptLines.length > 0 && taxableLines.length > 0;
    const isBillOfSupplyOnly = transactionType === 'TAX' && exemptLines.length > 0 && taxableLines.length === 0;

    // Backend-authoritative numbering (PREFIX-FYMMDD-SEQ, per-day series).
    // Numbers are generated ONLY here — never from client input.
    const splitGroupId = isSplit ? new mongoose.Types.ObjectId() : null;

    // Intra/inter-state is decided purely on 2-digit GST state codes.
    const isIntraState = checkIntraState(companyStateCode, customerStateCode);
    const parsedDiscount = Number(discount) || 0;

    // Build one partition per document: [taxable?, exempt?] — single-doc
    // sales keep the legacy shape (one partition, no splitGroupId).
    const partitions = [];
    if (isSplit) {
      partitions.push({ lines: taxableLines, billType: 'TAX_INVOICE', docType: 'TAX', idemKey: idempotencyKey });
      partitions.push({ lines: exemptLines, billType: 'BILL_OF_SUPPLY', docType: 'SUPPLY', idemKey: idempotencyKey ? `${idempotencyKey}:BOS` : undefined });
    } else if (isBillOfSupplyOnly) {
      partitions.push({ lines: exemptLines, billType: 'BILL_OF_SUPPLY', docType: 'SUPPLY', idemKey: idempotencyKey });
    } else {
      const fallbackDocType = transactionType === 'TAX' ? 'TAX' : 'ESTIMATE';
      partitions.push({ lines: taxableLines.length ? taxableLines : items, billType: 'TAX_INVOICE', docType: fallbackDocType, idemKey: idempotencyKey });
    }

    // Totals first (discount is pro-rated across partitions by taxable value
    // so the two bills sum exactly to the submitted discount).
    const built = [];
    for (const p of partitions) {
      const totals = await buildPartitionTotals({ lines: p.lines, transactionType, isIntraState, session });
      built.push({ ...p, ...totals });
    }
    const combinedSub = built.reduce((s, b) => s + b.subTotal, 0);
    let discountLeft = parsedDiscount;
    built.forEach((b, i) => {
      if (built.length === 1) {
        b.discount = parsedDiscount;
      } else if (i < built.length - 1) {
        b.discount = combinedSub > 0 ? Math.round((parsedDiscount * b.subTotal) / combinedSub) : 0;
        discountLeft -= b.discount;
      } else {
        b.discount = discountLeft;
      }
    });

    // Numbers are immutable after finalization — allocate before persisting.
    for (const b of built) {
      const allocated = await allocateSaleNumber({ docType: b.docType, invoiceDate });
      b.invoiceNumber = allocated.invoiceNumber;
      b.financialYear = allocated.financialYear;
      b.documentDate = allocated.documentDate;
    }

    const created = [];
    for (const b of built) {
      const sale = await createSaleDocument({
        session, transactionType, billType: b.billType,
        splitGroupId, customerId: customer, custDoc, settings,
        invoiceNumber: b.invoiceNumber, financialYear: b.financialYear, documentDate: b.documentDate,
        invoiceDate, processedItems: b.processedItems,
        subTotal: b.subTotal, totalCgst: b.totalCgst, totalSgst: b.totalSgst, totalIgst: b.totalIgst,
        discount: b.discount, status, remarks, dispatchThrough,
        idempotencyKey: b.idemKey,
      });
      created.push(sale);
    }

    await session.commitTransaction();
    session.endSession();

    // Generate PDFs (outside the transaction — storage I/O must never hold it).
    if (status === 'COMPLETED') {
      for (const sale of created) {
        await generateSalePdf(sale);
      }
    }

    // Audit Log (one entry per document so each number is traceable).
    for (const sale of created) {
      logAudit({
        action: 'SALE_CREATED',
        entity: 'Sale',
        entityId: sale._id,
        userId: req.user._id,
        summary: `Created ${sale.billType === 'BILL_OF_SUPPLY' ? 'Bill of Supply' : transactionType} ${sale.invoiceNumber} for ${custDoc.name} — ${(sale.grandTotal / 100).toFixed(2)}`,
        metadata: { transactionType, billType: sale.billType, invoiceNumber: sale.invoiceNumber, grandTotal: sale.grandTotal, customer: custDoc.name, ...(splitGroupId ? { splitGroupId: String(splitGroupId) } : {}) },
        ipAddress: req.ip
      });
    }

    const primary = created.find((s) => s.billType === 'TAX_INVOICE') || created[0];
    if (created.length > 1) {
      // Tax invoice first for a stable contract.
      created.sort((a, b) => (a.billType === b.billType ? 0 : a.billType === 'TAX_INVOICE' ? -1 : 1));
      return res.status(201).json({ success: true, data: primary, splitBills: created, splitOccurred: true });
    }
    return res.status(201).json({ success: true, data: primary, splitBills: created, splitOccurred: false });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.code === 11000) {
      // Idempotency-Key race: another request won — return the original family.
      if (idempotencyKey) {
        const replayed = await Sale.findOne({ idempotencyKey });
        if (replayed) {
          let splitBills = [replayed];
          if (replayed.splitGroupId) {
            splitBills = await Sale.find({ splitGroupId: replayed.splitGroupId });
            splitBills.sort((a, b) => (a.billType === b.billType ? 0 : a.billType === 'TAX_INVOICE' ? -1 : 1));
          }
          const primary = splitBills.find((s) => s.billType === 'TAX_INVOICE') || splitBills[0];
          if (splitBills.length > 1) return res.status(200).json({ success: true, data: primary, splitBills, splitOccurred: true, deduplicated: true });
          return res.status(200).json({ success: true, data: replayed, deduplicated: true });
        }
        const bosReplay = await Sale.findOne({ idempotencyKey: `${idempotencyKey}:BOS` });
        if (bosReplay) return res.status(200).json({ success: true, data: bosReplay, deduplicated: true });
      }
      return next(new ApiError(400, 'Invoice number already exists'));
    }
    next(error);
  }
};

/**
 * Convert an ESTIMATE into a NEW Tax Invoice.
 * The original Estimate is NEVER mutated/deleted/renumbered.
 * The new TAX invoice references the estimate via sourceEstimateId.
 * No duplicate stock movement is created (goods were already issued
 * via the estimate); the TAX invoice carries GST + its own TAX-stream
 * ledger entry. Transactional + audited.
 */
export const convertEstimateToTax = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const estimate = await Sale.findById(req.params.id).session(session);
    if (!estimate) throw new ApiError(404, 'Estimate not found');
    if (estimate.transactionType !== 'ESTIMATE') {
      throw new ApiError(400, 'Only estimates can be converted to tax invoices.');
    }
    if (estimate.status !== 'COMPLETED') {
      throw new ApiError(400, 'Only completed estimates can be converted.');
    }

    const alreadyConverted = await Sale.findOne({ sourceEstimateId: estimate._id }).session(session);
    if (alreadyConverted) {
      throw new ApiError(400, `Estimate already converted to ${alreadyConverted.invoiceNumber}`);
    }

    let settings = await CompanySettings.findOne().session(session);
    if (!settings) {
      settings = await new CompanySettings({ isSingleton: true }).save({ session });
    }
    const companyStateCode = settings ? settings.stateCode : '24';
    const custDoc = await Customer.findById(estimate.customer).session(session);
    if (!custDoc) throw new ApiError(404, 'Customer not found');
    const isIntraState = checkIntraState(companyStateCode, custDoc.stateCode || '24');

    const processedItems = [];
    for (const line of estimate.items) {
      // Return-aware conversion: only the not-yet-returned quantity is billed.
      const returned = await alreadyReturnedQty('Sale', estimate._id, line.product, session);
      const qty = Number(line.quantity) - returned;
      if (qty <= 0) continue; // fully returned line — nothing left to bill
      const product = await Product.findById(line.product).populate('unit', 'shortName').session(session);
      if (!product) throw new ApiError(404, `Product not found: ${line.product}`);
      const rate = Number(line.rate);
      // Carry the estimate line's dual quantities, pro-rated to the remainder.
      const ratio = qty / Number(line.quantity);
      const sec = Number(line.secondaryQty) || 0;
      const billSec = sec > 0 ? Math.round(sec * ratio * 1000) / 1000 : 0;
      const basis = line.pricingBasis === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
      const billBase = (basis === 'SECONDARY' ? billSec : qty) * rate; // Rate is exclusive of GST
      const gstRate = product.gstRate || 0;
      const { taxableValue, cgst, sgst, igst, total: lineTotal } = applyGst({
        billBase, gstRate, isTax: true, intra: isIntraState,
      });
      processedItems.push({
        product: line.product,
        quantity: qty,
        rate,
        secondaryQty: billSec,
        secondaryUnitName: line.secondaryUnitName || '',
        pricingBasis: basis,
        specification: String(line.specification || '').trim().slice(0, 500),
        taxableValue,
        gstRate,
        cgst,
        sgst,
        igst,
        total: lineTotal,
        productName: product.name || '',
        sku: product.sku || '',
        hsnCode: product.hsnCode || '',
        unitName: product.unit?.shortName || '',
      });
    }

    if (processedItems.length === 0) {
      throw new ApiError(400, 'Nothing left to convert — all estimate lines were fully returned.');
    }

    const estimateDiscount = Number(estimate.discount) || 0;
    const taxablePart = processedItems.filter((l) => Number(l.gstRate) > 0);
    const exemptPart = processedItems.filter((l) => !(Number(l.gstRate) > 0));
    const convSplit = taxablePart.length > 0 && exemptPart.length > 0;
    const convGroupId = convSplit ? new mongoose.Types.ObjectId() : null;

    const subPart = (lines) => lines.reduce((s, l) => s + l.taxableValue, 0);
    const convParts = [];
    if (convSplit) {
      convParts.push({ lines: taxablePart, billType: 'TAX_INVOICE', docType: 'TAX' });
      convParts.push({ lines: exemptPart, billType: 'BILL_OF_SUPPLY', docType: 'SUPPLY' });
    } else if (exemptPart.length > 0) {
      convParts.push({ lines: exemptPart, billType: 'BILL_OF_SUPPLY', docType: 'SUPPLY' });
    } else {
      convParts.push({ lines: taxablePart, billType: 'TAX_INVOICE', docType: 'TAX' });
    }
    // Pro-rate the estimate discount across the split pair by taxable value.
    const convSubTotal = convParts.reduce((s, p) => s + subPart(p.lines), 0);
    let convDiscountLeft = estimateDiscount;
    convParts.forEach((p, i) => {
      const st = subPart(p.lines);
      const cg = p.lines.reduce((s, l) => s + l.cgst, 0);
      const sg = p.lines.reduce((s, l) => s + l.sgst, 0);
      const ig = p.lines.reduce((s, l) => s + l.igst, 0);
      p.subTotal = st; p.totalCgst = cg; p.totalSgst = sg; p.totalIgst = ig;
      if (convParts.length === 1) p.discount = estimateDiscount;
      else if (i < convParts.length - 1) {
        p.discount = convSubTotal > 0 ? Math.round((estimateDiscount * st) / convSubTotal) : 0;
        convDiscountLeft -= p.discount;
      } else p.discount = convDiscountLeft;
      p.grandTotal = st + cg + sg + ig - p.discount;
    });

    const converted = [];
    for (const p of convParts) {
      const generated = await getNextDocumentNumber(p.docType, new Date());
      const invoice = new Sale({
        transactionType: 'TAX',
        billType: p.billType,
        ...(convGroupId ? { splitGroupId: convGroupId } : {}),
        customer: estimate.customer,
        invoiceNumber: generated.number,
        financialYear: generated.fy,
        sourceEstimateId: estimate._id,
        invoiceDate: new Date(),
        items: p.lines,
        subTotal: p.subTotal,
        totalCgst: p.totalCgst,
        totalSgst: p.totalSgst,
        totalIgst: p.totalIgst,
        discount: p.discount,
        grandTotal: p.grandTotal,
      status: 'COMPLETED',
      remarks: `Converted from estimate ${estimate.invoiceNumber}`,
      dispatchThrough: estimate.dispatchThrough || '',
      customerSnapshot: {
        name: custDoc.name || '',
        gstin: custDoc.gstin || '',
        address: custDoc.address || '',
        phone: custDoc.phone || '',
        stateCode: custDoc.stateCode || '',
      },
      companySnapshot: settings ? {
        companyName: settings.companyName || '',
        address: settings.address || '',
        gstin: settings.gstin || '',
        stateCode: settings.stateCode || '',
        phone: settings.phone || '',
        email: settings.email || '',
      } : undefined,
    });
    await invoice.save({ session });
      converted.push(invoice);

      // TAX-stream ledger debit for the new legal receivable.
      // Deliberately NO stock movement: goods already issued via the estimate.
      const lastLedger = await CustomerLedger.findOne({ customer: estimate.customer, stream: 'TAX' })
        .sort({ createdAt: -1 })
        .session(session);
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      await new CustomerLedger({
        customer: estimate.customer,
        stream: 'TAX',
        transactionType: 'SALE',
        referenceDocument: invoice._id,
        referenceModel: 'Sale',
        debit: p.grandTotal,
        balanceAfter: previousBalance + p.grandTotal,
      }).save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    for (const invoice of converted) {
      await generateSalePdf(invoice);
    }

    for (const invoice of converted) {
      logAudit({
        action: 'ESTIMATE_CONVERTED',
        entity: 'Sale',
        entityId: invoice._id,
        userId: req.user._id,
        summary: `Converted estimate ${estimate.invoiceNumber} to ${invoice.billType === 'BILL_OF_SUPPLY' ? 'bill of supply' : 'tax invoice'} ${invoice.invoiceNumber}`,
        metadata: {
          estimateId: estimate._id,
          estimateNumber: estimate.invoiceNumber,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          billType: invoice.billType,
          ...(convGroupId ? { splitGroupId: String(convGroupId) } : {}),
        },
        ipAddress: req.ip,
      });
    }

    converted.sort((a, b) => (a.billType === b.billType ? 0 : a.billType === 'TAX_INVOICE' ? -1 : 1));
    const primaryConverted = converted.find((s) => s.billType === 'TAX_INVOICE') || converted[0];
    if (converted.length > 1) {
      return res.status(201).json({ success: true, data: primaryConverted, splitBills: converted, splitOccurred: true });
    }
    return res.status(201).json({ success: true, data: primaryConverted, splitBills: converted, splitOccurred: false });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.code === 11000) {
      return next(new ApiError(400, 'Document sequence conflict. Please retry.'));
    }
    next(error);
  }
};

/**
 * Cancel a sale without reusing its number. COMPLETED sales post
 * reversing stock + ledger entries so history stays immutable.
 */
export const cancelSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const sale = await Sale.findById(req.params.id).session(session);
    if (!sale) throw new ApiError(404, 'Sale not found');
    if (sale.status === 'CANCELLED') throw new ApiError(400, 'Sale is already cancelled');

    // A document with returns must not be cancelled wholesale — that would
    // reverse stock/ledger twice. Correct via returns instead.
    const returnCount = await Return.countDocuments({ originalModel: 'Sale', originalDocument: sale._id }).session(session);
    if (returnCount > 0) {
      throw new ApiError(400, 'Sale has return documents and cannot be cancelled. Correct with further returns, not cancellation.');
    }

    // A converted estimate must not be cancelled — its TAX invoice carries
    // the live receivable while the estimate holds the stock movement.
    // Cancelling it would restore phantom stock. Cancel the tax invoice instead.
    if (sale.transactionType === 'ESTIMATE') {
      const child = await Sale.findOne({ sourceEstimateId: sale._id }).session(session);
      if (child) {
        throw new ApiError(400, `Estimate already converted to ${child.invoiceNumber} and cannot be cancelled. Cancel the tax invoice instead.`);
      }
    }

    // Money has moved — reverse payments first so allocations stay truthful.
    if ((sale.amountPaid || 0) > 0) {
      throw new ApiError(400, 'Sale has recorded payments and cannot be cancelled. Reverse the payments first.');
    }

    if (sale.status === 'COMPLETED') {
      // Reverse stock only if this document originally moved stock.
      // Conversion-created TAX invoices (sourceEstimateId set) never moved stock.
      const movedStock = !sale.sourceEstimateId;
      if (movedStock) {
        for (const item of sale.items) {
          await applyStockIn({
            productId: item.product,
            quantity: item.quantity,
            secondaryQuantity: item.secondaryQty || 0,
            unitCostPaise: 0, // reversal restores quantity; WAC unchanged
            stream: sale.transactionType,
            referenceDocument: sale._id,
            referenceModel: 'Sale',
            remarks: `Cancellation of ${sale.invoiceNumber}`,
          }, session);
        }
      }
      // Reverse the customer ledger effect in the same stream.
      const lastLedger = await CustomerLedger.findOne({ customer: sale.customer, stream: sale.transactionType })
        .sort({ createdAt: -1 })
        .session(session);
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      await new CustomerLedger({
        customer: sale.customer,
        stream: sale.transactionType,
        transactionType: 'RETURN',
        referenceDocument: sale._id,
        referenceModel: 'Sale',
        credit: sale.grandTotal,
        balanceAfter: previousBalance - sale.grandTotal,
      }).save({ session });
    }

    sale.status = 'CANCELLED';
    await sale.save({ session });
    await session.commitTransaction();
    session.endSession();

    logAudit({
      action: 'SALE_CANCELLED',
      entity: 'Sale',
      entityId: sale._id,
      userId: req.user._id,
      summary: `Cancelled ${sale.transactionType} ${sale.invoiceNumber} (number retained, never reused)`,
      metadata: { transactionType: sale.transactionType, invoiceNumber: sale.invoiceNumber },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: sale });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

// Helper function for serving PDFs (shared with the notes controller).
export const streamPdfToResponse = async (sale, res, contentDisposition) => {
  if (!sale) throw new ApiError(404, 'Sale not found');
  
  if (!sale.pdf || !sale.pdf.objectKey) {
    throw new ApiError(404, 'PDF file not yet generated or available');
  }

  // Set standard security and cache headers for private PDFs
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  if (sale.pdf.provider === 'oci') {
    try {
      const { stream, contentLength } = await getObjectStream(sale.pdf.objectKey);
      if (contentLength) res.setHeader('Content-Length', contentLength);
      stream.pipe(res);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Error streaming PDF from storage');
    }
  } else if (sale.pdf.provider === 'local') {
    const localPath = path.join(__dirname, '../../public/pdfs', sale.pdf.fileName || sale.pdf.objectKey);
    if (!fs.existsSync(localPath)) {
      throw new ApiError(404, 'Local PDF file not found');
    }
    const stream = fs.createReadStream(localPath);
    stream.pipe(res);
  } else {
    throw new ApiError(500, 'Unknown PDF provider');
  }
};

export const viewSalePdf = async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id);
    await streamPdfToResponse(sale, res, 'inline');
  } catch (error) {
    next(error);
  }
};

export const downloadSalePdf = async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('customer', 'name');
    if (!sale) throw new ApiError(404, 'Sale not found');

    const sanitizedCustomer = (sale.customer?.name || 'Unknown').replace(/[^a-zA-Z0-9-]/g, '_');
    const safeFilename = `${sale.invoiceNumber}_${sanitizedCustomer}.pdf`;
    
    await streamPdfToResponse(sale, res, `attachment; filename="${safeFilename}"`);
  } catch (error) {
    next(error);
  }
};

export const publicSalePdf = async (req, res, next) => {
  try {
    const sale = await Sale.findById(req.params.id);
    // Remove no-store for public PDF so it can be cached reasonably if needed, though private is okay
    await streamPdfToResponse(sale, res, 'inline');
  } catch (error) {
    next(error);
  }
};
