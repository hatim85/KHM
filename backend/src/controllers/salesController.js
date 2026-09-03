import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import StockMovement from '../models/StockMovement.js';
import CustomerLedger from '../models/CustomerLedger.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import CompanySettings from '../models/CompanySettings.js';
import ApiError from '../utils/ApiError.js';
import { generateInvoicePDF } from '../utils/pdfGenerator.js';
import { logAudit } from '../utils/auditLogger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getObjectStream } from '../services/ociStorageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getSales = async (req, res, next) => {
  try {
    const { stream, status } = req.query;
    let query = Sale.find().populate('customer', 'name').sort({ createdAt: -1 });

    if (stream) query = query.where('transactionType').equals(stream);
    if (status) query = query.where('status').equals(status);

    const sales = await query;
    res.json({ success: true, count: sales.length, data: sales });
  } catch (error) {
    next(error);
  }
};

export const createSale = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionType, customer, invoiceNumber, invoiceDate, items, status, discount, remarks } = req.body;

    const settings = await CompanySettings.findOne().session(session);
    const companyStateCode = settings ? settings.stateCode : '24'; // Default to Gujarat

    const custDoc = await Customer.findById(customer).session(session);
    if (!custDoc) throw new ApiError(404, 'Customer not found');
    const customerStateCode = custDoc.stateCode || '24';

    const isIntraState = (companyStateCode === customerStateCode);

    let subTotal = 0; // Sum of taxable values
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) throw new ApiError(404, `Product not found: ${item.product}`);

      const qty = Number(item.quantity);
      const stockField = transactionType === 'TAX' ? 'taxStock' : 'estimateStock';
      
      if (status === 'COMPLETED' && product[stockField] < qty) {
        throw new ApiError(400, `Insufficient ${transactionType} stock for ${product.name}. Required: ${qty}, Available: ${product[stockField]}`);
      }

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
        taxableValue,
        gstRate,
        cgst,
        sgst,
        igst,
        total: itemTotal
      });
    }

    const parsedDiscount = Number(discount) || 0;
    const grandTotal = subTotal + totalCgst + totalSgst + totalIgst - parsedDiscount;

    // Create Sale Document
    const sale = new Sale({
      transactionType,
      customer,
      invoiceNumber,
      invoiceDate,
      items: processedItems,
      subTotal,
      totalCgst,
      totalSgst,
      totalIgst,
      discount: parsedDiscount,
      grandTotal,
      status,
      remarks
    });

    await sale.save({ session });

    // If COMPLETED, process stock reduction, ledger, and PDF
    if (status === 'COMPLETED') {
      for (const item of processedItems) {
        // 1. Create Stock Movement (OUT)
        const stockMove = new StockMovement({
          product: item.product,
          stream: transactionType,
          type: 'OUT',
          quantity: -item.quantity,
          referenceDocument: sale._id,
          referenceModel: 'Sale'
        });
        await stockMove.save({ session });

        // 2. Update Cached Stock on Product
        const stockField = transactionType === 'TAX' ? 'taxStock' : 'estimateStock';
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { [stockField]: -item.quantity } },
          { session }
        );
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
        await sale.populate('items.product', 'name sku hsnCode');
        
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
      return next(new ApiError(400, 'Invoice number already exists'));
    }
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
