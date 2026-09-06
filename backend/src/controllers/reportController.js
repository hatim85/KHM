import mongoose from 'mongoose';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Expense from '../models/Expense.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import Return from '../models/Return.js';
import Note from '../models/Note.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import Payment from '../models/Payment.js';

// Helper for date matching
const getDateMatch = (startDate, endDate, dateField = 'createdAt') => {
  const match = {};
  if (startDate || endDate) {
    match[dateField] = {};
    if (startDate) match[dateField].$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match[dateField].$lte = end;
    }
  }
  return match;
};

// ==========================================
// 1. PROFIT & LOSS (TAX STREAM)
// ==========================================
export const getProfitAndLoss = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');
    const expenseDateMatch = getDateMatch(startDate, endDate, 'date');

    // Net Sales (TAX Invoices Only, Excluding Cancelled, Net of Sales Returns)
    const salesAgg = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED' } },
      { $group: { _id: null, totalSales: { $sum: '$subTotal' } } }
    ]);
    const grossSales = salesAgg[0]?.totalSales || 0;

    const returnDateMatch = getDateMatch(startDate, endDate, 'returnDate');
    const salesReturnAgg = await Return.aggregate([
      { $match: { ...returnDateMatch, returnType: 'SALES_RETURN', stream: 'TAX' } },
      { $group: { _id: null, totalReturns: { $sum: '$subTotal' } } }
    ]);
    const salesReturns = salesReturnAgg[0]?.totalReturns || 0;

    // Completed Credit Notes reduce recognized sales value (post-invoice
    // downward adjustments). Cancelled notes are excluded.
    const noteDateMatch = getDateMatch(startDate, endDate, 'noteDate');
    const creditAgg = await Note.aggregate([
      { $match: { ...noteDateMatch, noteType: 'CREDIT_NOTE', status: 'COMPLETED' } },
      { $group: { _id: null, totalCredit: { $sum: '$subTotal' } } }
    ]);
    const creditNotes = creditAgg[0]?.totalCredit || 0;
    const netSales = Math.max(0, grossSales - salesReturns - creditNotes);

    // COGS from the stock movement ledger: TAX OUT issues valued at the
    // carrying average cost recorded at issue time. Cancelled sales excluded.
    // (Conversion-created TAX invoices intentionally carry no OUT movement —
    // goods were already issued via the source estimate; see convertEstimateToTax.)
    const cogsAgg = await StockMovement.aggregate([
      { $match: { ...getDateMatch(startDate, endDate, 'createdAt'), type: 'OUT', stream: 'TAX', referenceModel: 'Sale' } },
      { $lookup: { from: 'sales', localField: 'referenceDocument', foreignField: '_id', as: 'saleDoc' } },
      { $unwind: { path: '$saleDoc', preserveNullAndEmptyArrays: true } },
      { $match: { 'saleDoc.status': { $ne: 'CANCELLED' } } },
      { $project: { cogsItem: { $multiply: [{ $abs: '$quantity' }, { $ifNull: ['$unitCost', 0] }] } } },
      { $group: { _id: null, totalCOGS: { $sum: '$cogsItem' } } }
    ]);
    // Sales-return IN movements carry the carrying cost back into stock —
    // net them so returned goods don't inflate COGS.
    const returnCogsAgg = await StockMovement.aggregate([
      { $match: { ...getDateMatch(startDate, endDate, 'createdAt'), type: 'IN', stream: 'TAX', referenceModel: 'Return' } },
      { $project: { cogsItem: { $multiply: [{ $abs: '$quantity' }, { $ifNull: ['$unitCost', 0] }] } } },
      { $group: { _id: null, totalReturnCOGS: { $sum: '$cogsItem' } } }
    ]);
    const cogs = Math.max(0, Math.round(cogsAgg[0]?.totalCOGS || 0) - Math.round(returnCogsAgg[0]?.totalReturnCOGS || 0));

    const grossProfit = netSales - cogs;

    // Operating Expenses
    const expensesAgg = await Expense.aggregate([
      { $match: expenseDateMatch },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' } } }
    ]);
    const totalExpenses = expensesAgg[0]?.totalExpenses || 0;

    const netProfit = grossProfit - totalExpenses;

    res.json({
      success: true,
      data: { netSales, grossSales, salesReturns, creditNotes, cogs, grossProfit, totalExpenses, netProfit }
    });
  } catch (error) { next(error); }
};

// ==========================================
// 2. GST SUMMARY (TAX STREAM)
// ==========================================
export const getGstSummary = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');

    // Output GST (Tax Invoices only — Bills of Supply carry no GST and are
    // reported separately as exempt turnover. `billType: {$ne}` keeps legacy
    // documents written before billType existed inside the taxable bucket.)
    const salesGst = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED', billType: { $ne: 'BILL_OF_SUPPLY' } } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          cgst: { $sum: '$totalCgst' },
          sgst: { $sum: '$totalSgst' },
          igst: { $sum: '$totalIgst' },
      }}
    ]);
    const output = salesGst[0] || { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };

    // Exempt turnover via Bills of Supply (0%-GST lines, never taxed).
    const exemptAgg = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED', billType: 'BILL_OF_SUPPLY' } },
      { $group: { _id: null, exemptValue: { $sum: '$subTotal' }, count: { $sum: 1 } } }
    ]);
    const exempt = exemptAgg[0] || { exemptValue: 0, count: 0 };

    // Net sales returns (TAX stream): GST reversal reduces output tax.
    const returnDateMatch = getDateMatch(startDate, endDate, 'returnDate');
    const salesReturnGst = await Return.aggregate([
      { $match: { ...returnDateMatch, returnType: 'SALES_RETURN', stream: 'TAX' } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          cgst: { $sum: '$totalCgst' },
          sgst: { $sum: '$totalSgst' },
          igst: { $sum: '$totalIgst' },
      }}
    ]);
    const retOut = salesReturnGst[0] || { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
    // Completed Credit Notes (sales-side downward adjustments) reduce output
    // tax exactly like returns do. Cancelled notes are excluded.
    const noteDateMatch = getDateMatch(startDate, endDate, 'noteDate');
    const creditGst = await Note.aggregate([
      { $match: { ...noteDateMatch, noteType: 'CREDIT_NOTE', status: 'COMPLETED', stream: 'TAX' } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          cgst: { $sum: '$totalCgst' },
          sgst: { $sum: '$totalSgst' },
          igst: { $sum: '$totalIgst' },
      }}
    ]);
    const cnOut = creditGst[0] || { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
    // Clamped at zero: range slicing can place a return inside the window
    // while its original sale sits outside it.
    output.taxableValue = Math.max(0, output.taxableValue - retOut.taxableValue - cnOut.taxableValue);
    output.cgst = Math.max(0, output.cgst - retOut.cgst - cnOut.cgst);
    output.sgst = Math.max(0, output.sgst - retOut.sgst - cnOut.sgst);
    output.igst = Math.max(0, output.igst - retOut.igst - cnOut.igst);
    const totalOutputGst = output.cgst + output.sgst + output.igst;

    // Input Tax Credit (TAX Purchases)
    const purchaseGst = await Purchase.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED' } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          totalTax: { $sum: '$taxTotal' },
      }}
    ]);
    const input = purchaseGst[0] || { taxableValue: 0, totalTax: 0 };

    // Net purchase returns (TAX stream): ITC reversal reduces input credit.
    const purchaseReturnGst = await Return.aggregate([
      { $match: { ...returnDateMatch, returnType: 'PURCHASE_RETURN', stream: 'TAX' } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          totalTax: { $sum: { $add: ['$totalCgst', '$totalSgst', '$totalIgst'] } },
      }}
    ]);
    const retIn = purchaseReturnGst[0] || { taxableValue: 0, totalTax: 0 };
    input.taxableValue = Math.max(0, input.taxableValue - retIn.taxableValue);
    input.totalTax = Math.max(0, input.totalTax - retIn.totalTax);
    // Completed Debit Notes (purchase-side upward adjustments) add ITC.
    const debitGst = await Note.aggregate([
      { $match: { ...noteDateMatch, noteType: 'DEBIT_NOTE', status: 'COMPLETED', stream: 'TAX' } },
      { $group: {
          _id: null,
          taxableValue: { $sum: '$subTotal' },
          totalTax: { $sum: { $add: ['$totalCgst', '$totalSgst', '$totalIgst'] } },
      }}
    ]);
    const dnIn = debitGst[0] || { taxableValue: 0, totalTax: 0 };
    input.taxableValue = input.taxableValue + dnIn.taxableValue;
    input.totalTax = input.totalTax + dnIn.totalTax;
    const totalItc = input.totalTax;

    const netLiability = totalOutputGst - totalItc;

    res.json({
      success: true,
      data: {
        outputGst: { ...output, total: totalOutputGst },
        creditNotes: { taxableValue: cnOut.taxableValue, cgst: cnOut.cgst, sgst: cnOut.sgst, igst: cnOut.igst, total: cnOut.cgst + cnOut.sgst + cnOut.igst },
        debitNotes: { taxableValue: dnIn.taxableValue, total: dnIn.totalTax },
        exemptSupplies: { exemptValue: exempt.exemptValue || 0, count: exempt.count || 0 },
        inputTaxCredit: { taxableValue: input.taxableValue, total: totalItc },
        netLiability
      }
    });
  } catch (error) { next(error); }
};

// ==========================================
// 3. STOCK VALUATION
// ==========================================
export const getStockValuation = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).populate('unit', 'shortName');
    
    let totalValue = 0;
    const items = products.map(p => {
      const taxQty = p.taxStock || 0;
      const estQty = p.estimateStock || 0;
      const taxValue = taxQty * (p.averageCostTax || 0);
      const estValue = estQty * (p.averageCostEst || 0);
      const value = taxValue + estValue; // per-pool WAC valuation
      totalValue += value;
      return {
        _id: p._id,
        name: p.name,
        sku: p.sku,
        quantity: taxQty + estQty,
        taxStock: taxQty,
        estimateStock: estQty,
        unit: p.unit?.shortName || '',
        averageCost: taxQty + estQty > 0 ? Math.round(value / (taxQty + estQty)) : 0,
        averageCostTax: p.averageCostTax || 0,
        averageCostEst: p.averageCostEst || 0,
        value
      };
    });

    res.json({ success: true, data: { items, totalValue } });
  } catch (error) { next(error); }
};

// ==========================================
// 4. TAX SALES REPORT
// ==========================================
export const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, customerId } = req.query;
    const match = { transactionType: 'TAX', status: 'COMPLETED', ...getDateMatch(startDate, endDate, 'invoiceDate') };
    if (customerId) match.customer = new mongoose.Types.ObjectId(customerId);

    const sales = await Sale.find(match).populate('customer', 'name gstin').sort({ invoiceDate: -1 }).limit(100);
    res.json({ success: true, data: sales });
  } catch (error) { next(error); }
};

// ==========================================
// 5. ESTIMATE SALES REPORT
// ==========================================
export const getEstimateSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, customerId } = req.query;
    const match = { transactionType: 'ESTIMATE', status: 'COMPLETED', ...getDateMatch(startDate, endDate, 'invoiceDate') };
    if (customerId) match.customer = new mongoose.Types.ObjectId(customerId);

    const estimates = await Sale.find(match).populate('customer', 'name').sort({ invoiceDate: -1 }).limit(100);
    res.json({ success: true, data: estimates });
  } catch (error) { next(error); }
};

// ==========================================
// 6. CUSTOMER OUTSTANDING (TAX OR ESTIMATE)
// ==========================================
export const getCustomerOutstanding = async (req, res, next) => {
  try {
    const { stream = 'TAX' } = req.query;
    const customersAgg = await CustomerLedger.aggregate([
      { $match: { stream } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$customer', latestBalance: { $first: '$balanceAfter' } } },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      { $project: { _id: 1, name: '$customer.name', phone: '$customer.phone', totalOutstanding: '$latestBalance' } },
      { $sort: { totalOutstanding: -1 } }
    ]);
    res.json({ success: true, data: customersAgg });
  } catch (error) { next(error); }
};

// ==========================================
// 7. SUPPLIER OUTSTANDING
// ==========================================
export const getSupplierOutstanding = async (req, res, next) => {
  try {
    const { stream = 'TAX' } = req.query;
    const suppliersAgg = await SupplierLedger.aggregate([
      { $match: { stream } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$supplier', latestBalance: { $first: '$balanceAfter' } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
      { $unwind: '$supplier' },
      { $project: { _id: 1, name: '$supplier.name', phone: '$supplier.phone', totalOutstanding: '$latestBalance' } },
      { $sort: { totalOutstanding: -1 } }
    ]);
    res.json({ success: true, data: suppliersAgg });
  } catch (error) { next(error); }
};

// ==========================================
// 8. TOP SELLING PRODUCTS (TAX)
// ==========================================
export const getTopSellingProducts = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');

    const topProducts = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED' } },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalSecondaryQuantity: { $sum: { $ifNull: ['$items.secondaryQty', 0] } },
          secondaryUnit: { $first: '$items.secondaryUnitName' },
          // Revenue from stored taxable values (correct under any pricing basis).
          totalRevenue: { $sum: '$items.taxableValue' }
      }},
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: {
          _id: 1, name: '$product.name', sku: '$product.sku',
          totalQuantity: 1, totalSecondaryQuantity: 1, secondaryUnit: 1, totalRevenue: 1,
          averageSellingPrice: { $divide: ['$totalRevenue', '$totalQuantity'] }
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 }
    ]);
    res.json({ success: true, data: topProducts });
  } catch (error) { next(error); }
};

// ==========================================
// 9. TOP ESTIMATED PRODUCTS (ESTIMATE)
// ==========================================
export const getTopEstimateProducts = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');

    const topProducts = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'ESTIMATE', status: 'COMPLETED' } },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          totalSecondaryQuantity: { $sum: { $ifNull: ['$items.secondaryQty', 0] } },
          secondaryUnit: { $first: '$items.secondaryUnitName' },
          totalRevenue: { $sum: '$items.taxableValue' }
      }},
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: {
          _id: 1, name: '$product.name', sku: '$product.sku',
          totalQuantity: 1, totalSecondaryQuantity: 1, secondaryUnit: 1, totalRevenue: 1,
          averageSellingPrice: { $divide: ['$totalRevenue', '$totalQuantity'] }
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 20 }
    ]);
    res.json({ success: true, data: topProducts });
  } catch (error) { next(error); }
};

// ==========================================
// 10. ESTIMATE CONVERSIONS
// ==========================================
export const getEstimateConversions = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const match = { transactionType: 'ESTIMATE', status: 'COMPLETED', ...getDateMatch(startDate, endDate, 'invoiceDate') };

    const conversions = await Sale.aggregate([
      { $match: match },
      { $lookup: { from: 'sales', localField: '_id', foreignField: 'sourceEstimateId', as: 'taxInvoice' } },
      { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'customerObj' } },
      { $unwind: '$customerObj' },
      { $project: {
          estimateNumber: '$invoiceNumber',
          estimateDate: '$invoiceDate',
          customer: '$customerObj.name',
          estimateTotal: '$subTotal',
          estimateStatus: '$status',
          conversionStatus: { $cond: { if: { $gt: [{ $size: '$taxInvoice' }, 0] }, then: 'CONVERTED', else: 'NOT_CONVERTED' } },
          invoiceNumber: { $arrayElemAt: ['$taxInvoice.invoiceNumber', 0] },
          invoiceDate: { $arrayElemAt: ['$taxInvoice.invoiceDate', 0] },
          invoiceTotal: { $arrayElemAt: ['$taxInvoice.grandTotal', 0] },
      }},
      { $sort: { estimateDate: -1 } }
    ]);
    res.json({ success: true, data: conversions });
  } catch (error) { next(error); }
};

// ==========================================
// 11. CUSTOMER SALES (TAX)
// ==========================================
export const getCustomerSales = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');

    const customerSales = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'TAX', status: 'COMPLETED' } },
      { $group: {
          _id: '$customer',
          numberOfInvoices: { $sum: 1 },
          totalQuantity: { $sum: { $sum: '$items.quantity' } },
          totalSecondaryQuantity: { $sum: { $sum: { $map: { input: '$items', as: 'it', in: { $ifNull: ['$$it.secondaryQty', 0] } } } } },
          taxableValue: { $sum: '$subTotal' },
          totalGst: { $sum: { $add: ['$totalCgst', '$totalSgst', '$totalIgst'] } },
          totalSales: { $sum: '$grandTotal' }
      }},
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customerObj' } },
      { $unwind: '$customerObj' },
      { $project: {
          _id: 1, name: '$customerObj.name',
          numberOfInvoices: 1, totalQuantity: 1, totalSecondaryQuantity: 1,
          taxableValue: 1, totalGst: 1, totalSales: 1
      }},
      { $sort: { totalSales: -1 } }
    ]);
    res.json({ success: true, data: customerSales });
  } catch (error) { next(error); }
};

// ==========================================
// 12. CUSTOMER ESTIMATES (ESTIMATE)
// ==========================================
export const getCustomerEstimates = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const dateMatch = getDateMatch(startDate, endDate, 'invoiceDate');

    const customerEstimates = await Sale.aggregate([
      { $match: { ...dateMatch, transactionType: 'ESTIMATE', status: 'COMPLETED' } },
      { $group: {
          _id: '$customer',
          numberOfEstimates: { $sum: 1 },
          totalQuantity: { $sum: { $sum: '$items.quantity' } },
          totalSecondaryQuantity: { $sum: { $sum: { $map: { input: '$items', as: 'it', in: { $ifNull: ['$$it.secondaryQty', 0] } } } } },
          totalEstimateValue: { $sum: '$subTotal' }
      }},
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customerObj' } },
      { $unwind: '$customerObj' },
      { $project: {
          _id: 1, name: '$customerObj.name',
          numberOfEstimates: 1, totalQuantity: 1, totalSecondaryQuantity: 1,
          totalEstimateValue: 1
      }},
      { $sort: { totalEstimateValue: -1 } }
    ]);
    res.json({ success: true, data: customerEstimates });
  } catch (error) { next(error); }
};

// ==========================================
// 13. PURCHASE REPORT
// ==========================================
export const getPurchaseReport = async (req, res, next) => {
  try {
    const { startDate, endDate, stream = 'TAX' } = req.query;
    const match = { transactionType: stream, status: 'COMPLETED', ...getDateMatch(startDate, endDate, 'invoiceDate') };

    const purchases = await Purchase.find(match).populate('supplier', 'name').sort({ invoiceDate: -1 }).limit(100);
    res.json({ success: true, data: purchases });
  } catch (error) { next(error); }
};

// ==========================================
// 14. EXPENSE REPORT
// ==========================================
export const getExpenseReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const match = getDateMatch(startDate, endDate, 'date');

    const expenses = await Expense.find(match).populate('category', 'name').sort({ date: -1 }).limit(100);
    res.json({ success: true, data: expenses });
  } catch (error) { next(error); }
};
