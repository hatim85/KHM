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
import { getNextDocumentNumber, isPlaceholderNumber } from '../utils/documentNumbering.js';
import { isIntraStateSupply as checkIntraState } from '../utils/gstMaster.js';
import { alreadyReturnedQty } from './returnsController.js';
import { applyStockIn, applyStockOut } from '../services/inventoryService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getObjectStream } from '../services/ociStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSales = async (req, res, next) => {
  try {
    const { stream, status, paymentStatus } = req.query;
    let query = Sale.find().populate('customer', 'name').sort({ createdAt: -1 });

    if (stream) query = query.where('transactionType').equals(stream);
    if (status) query = query.where('status').equals(status);
    if (paymentStatus) query = query.where('paymentStatus').equals(paymentStatus);

    const sales = await query;
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error) {
    next(error);
  }
};

export const createSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  // Hoisted for the duplicate-key handler below (catch scope).
  let idempotencyKey;

  try {
    const { transactionType, customer, invoiceDate, items, status, discount, remarks, dispatchThrough } = req.body;
    let { invoiceNumber } = req.body;

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
    // original document instead of creating a second sale.
    idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey || undefined;
    if (idempotencyKey) {
      const replayed = await Sale.findOne({ idempotencyKey }).session(session);
      if (replayed) {
        await session.abortTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: replayed, deduplicated: true });
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

    // Backend-authoritative FY-aware numbering. Frontend must NOT be trusted
    // for document numbers: placeholders / missing values are generated atomically.
    const docType = transactionType === 'TAX' ? 'TAX' : 'ESTIMATE';
    let financialYear = null;
    if (isPlaceholderNumber(invoiceNumber)) {
      const generated = await getNextDocumentNumber(docType, invoiceDate ? new Date(invoiceDate) : new Date());
      invoiceNumber = generated.number;
      financialYear = generated.fy;
    } else {
      invoiceNumber = String(invoiceNumber).trim();
      const existing = await Sale.findOne({ invoiceNumber }).session(session);
      if (existing) throw new ApiError(400, 'Invoice number already exists');
      const fyMatch = String(invoiceNumber).match(/^[A-Z]{2,5}-(\d{4})-\d{6}$/);
      financialYear = fyMatch ? Number(fyMatch[1]) : null;
    }

    // Intra/inter-state is decided purely on 2-digit GST state codes.
    const isIntraState = checkIntraState(companyStateCode, customerStateCode);

    let subTotal = 0; // Sum of taxable values
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).populate('unit', 'shortName').session(session);
      if (!product) throw new ApiError(404, `Product not found: ${item.product}`);

      const qty = Number(item.quantity);

      // GST Calculation
      const taxableValue = qty * item.rate; // Rate is exclusive of GST
      let cgst = 0, sgst = 0, igst = 0;

      const gstRate = product.gstRate || 0;
      const taxAmount = Math.round(taxableValue * (gstRate / 100));

      if (transactionType === 'TAX') {
        if (isIntraState) {
          cgst = Math.round(taxAmount / 2);
          sgst = taxAmount - cgst; // Ensure no rounding errors
        } else {
          igst = taxAmount;
        }
      }

      const itemTotal = taxableValue + cgst + sgst + igst;

      subTotal += taxableValue;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;

      processedItems.push({
        product: item.product,
        quantity: qty,
        rate: item.rate,
        // Snapshot from the product master — never client-supplied.
        specification: String(product.specification || '').trim().slice(0, 500),
        taxableValue,
        gstRate,
        cgst,
        sgst,
        igst,
        total: itemTotal,
        // Snapshot at finalization — history never reads live masters.
        productName: product.name || '',
        sku: product.sku || '',
        hsnCode: product.hsnCode || '',
        unitName: product.unit?.shortName || '',
      });
    }

    const parsedDiscount = Number(discount) || 0;
    const grandTotal = subTotal + totalCgst + totalSgst + totalIgst - parsedDiscount;

    // Create Sale Document (numbers are immutable after finalization)
    const sale = new Sale({
      transactionType,
      customer,
      invoiceNumber,
      financialYear,
      invoiceDate,
      items: processedItems,
      subTotal,
      totalCgst,
      totalSgst,
      totalIgst,
      discount: parsedDiscount,
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

    // If COMPLETED, process stock reduction, ledger, and PDF
    if (status === 'COMPLETED') {
      for (const item of processedItems) {
        // Single physical stock OUT (TAX and ESTIMATE both reduce it).
        // Stream is recorded on the movement for classification only.
        await applyStockOut({
          productId: item.product,
          quantity: item.quantity,
          stream: transactionType,
          referenceDocument: sale._id,
          referenceModel: 'Sale',
        }, session);
      }

      // 3. Update Customer Ledger
      const lastLedger = await CustomerLedger.findOne({ customer, stream: transactionType })
        .sort({ createdAt: -1 })
        .session(session);
      
      const previousBalance = lastLedger ? lastLedger.balanceAfter : 0;
      const newBalance = previousBalance + grandTotal; // Increase debt

      const ledgerEntry = new CustomerLedger({
        customer,
        stream: transactionType,
        transactionType: 'SALE',
        referenceDocument: sale._id,
        referenceModel: 'Sale',
        debit: grandTotal,
        balanceAfter: newBalance
      });
      await ledgerEntry.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Generate PDF asynchronously
    if (status === 'COMPLETED') {
      try {
        await sale.populate('customer', 'name address gstin phone stateCode');
        await sale.populate({ path: 'items.product', select: 'name sku hsnCode unit', populate: { path: 'unit', select: 'shortName' } });
        
        const settings = await CompanySettings.findOne();
        const pdfMeta = await generateInvoicePDF(sale, settings);
        
        await Sale.findByIdAndUpdate(sale._id, { pdf: pdfMeta });
        sale.pdf = pdfMeta;
      } catch (pdfError) {
        console.error("PDF Generation failed:", pdfError);
      }
    }

    // Audit Log
    logAudit({
      action: `SALE_CREATED`,
      entity: 'Sale',
      entityId: sale._id,
      userId: req.user._id,
      summary: `Created ${transactionType} ${invoiceNumber} for ${custDoc.name} — ${(grandTotal / 100).toFixed(2)}`,
      metadata: { transactionType, invoiceNumber, grandTotal, customer: custDoc.name },
      ipAddress: req.ip
    });

    res.status(201).json({ success: true, data: sale });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    if (error.code === 11000) {
      // Idempotency-Key race: another request won — return the original.
      if (idempotencyKey) {
        const replayed = await Sale.findOne({ idempotencyKey });
        if (replayed) return res.status(200).json({ success: true, data: replayed, deduplicated: true });
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

    let subTotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const processedItems = [];
    for (const line of estimate.items) {
      // Return-aware conversion: only the not-yet-returned quantity is billed.
      const returned = await alreadyReturnedQty('Sale', estimate._id, line.product, session);
      const qty = Number(line.quantity) - returned;
      if (qty <= 0) continue; // fully returned line — nothing left to bill
      const product = await Product.findById(line.product).populate('unit', 'shortName').session(session);
      if (!product) throw new ApiError(404, `Product not found: ${line.product}`);
      const rate = Number(line.rate);
      const taxableValue = qty * rate;
      const gstRate = product.gstRate || 0;
      const taxAmount = Math.round(taxableValue * (gstRate / 100));
      let cgst = 0, sgst = 0, igst = 0;
      if (isIntraState) {
        cgst = Math.round(taxAmount / 2);
        sgst = taxAmount - cgst;
      } else {
        igst = taxAmount;
      }
      subTotal += taxableValue;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      processedItems.push({
        product: line.product,
        quantity: qty,
        rate,
        specification: String(line.specification || '').trim().slice(0, 500),
        taxableValue,
        gstRate,
        cgst,
        sgst,
        igst,
        total: taxableValue + cgst + sgst + igst,
        productName: product.name || '',
        sku: product.sku || '',
        hsnCode: product.hsnCode || '',
        unitName: product.unit?.shortName || '',
      });
    }

    if (processedItems.length === 0) {
      throw new ApiError(400, 'Nothing left to convert — all estimate lines were fully returned.');
    }

    const grandTotal = subTotal + totalCgst + totalSgst + totalIgst - (Number(estimate.discount) || 0);
    const generated = await getNextDocumentNumber('TAX', new Date());

    const invoice = new Sale({
      transactionType: 'TAX',
      customer: estimate.customer,
      invoiceNumber: generated.number,
      financialYear: generated.fy,
      sourceEstimateId: estimate._id,
      invoiceDate: new Date(),
      items: processedItems,
      subTotal,
      totalCgst,
      totalSgst,
      totalIgst,
      discount: Number(estimate.discount) || 0,
      grandTotal,
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
      debit: grandTotal,
      balanceAfter: previousBalance + grandTotal,
    }).save({ session });

    await session.commitTransaction();
    session.endSession();

    try {
      await invoice.populate('customer', 'name address gstin phone stateCode');
      await invoice.populate({ path: 'items.product', select: 'name sku hsnCode unit', populate: { path: 'unit', select: 'shortName' } });
      const companySettings = await CompanySettings.findOne();
      const pdfMeta = await generateInvoicePDF(invoice, companySettings);
      await Sale.findByIdAndUpdate(invoice._id, { pdf: pdfMeta });
      invoice.pdf = pdfMeta;
    } catch (pdfError) {
      console.error('PDF Generation failed:', pdfError);
    }

    logAudit({
      action: 'ESTIMATE_CONVERTED',
      entity: 'Sale',
      entityId: invoice._id,
      userId: req.user._id,
      summary: `Converted estimate ${estimate.invoiceNumber} to tax invoice ${invoice.invoiceNumber}`,
      metadata: {
        estimateId: estimate._id,
        estimateNumber: estimate.invoiceNumber,
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: invoice });
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

// Helper function for serving PDFs
const streamPdfToResponse = async (sale, res, contentDisposition) => {
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
