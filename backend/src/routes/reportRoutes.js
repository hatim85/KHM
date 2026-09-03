import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
  getProfitAndLoss,
  getGstSummary,
  getStockValuation,
  getSalesReport,
  getEstimateSalesReport,
  getCustomerOutstanding,
  getSupplierOutstanding,
  getTopSellingProducts,
  getTopEstimateProducts,
  getEstimateConversions,
  getCustomerSales,
  getCustomerEstimates,
  getPurchaseReport,
  getExpenseReport
} from '../controllers/reportController.js';

const router = express.Router();

router.use(protect);

// TAX Stream Reports
router.get('/pnl', getProfitAndLoss);
router.get('/gst', getGstSummary);
router.get('/stock', getStockValuation);
router.get('/sales', getSalesReport);
router.get('/customers/outstanding', getCustomerOutstanding);
router.get('/suppliers/outstanding', getSupplierOutstanding);
router.get('/products/top-selling', getTopSellingProducts);
router.get('/customers/sales', getCustomerSales);

// ESTIMATE Stream Reports
router.get('/estimates', getEstimateSalesReport);
router.get('/products/top-estimates', getTopEstimateProducts);
router.get('/estimates/conversions', getEstimateConversions);
router.get('/customers/estimates', getCustomerEstimates);

// Global / Combined Reports
router.get('/purchases', getPurchaseReport);
router.get('/expenses', getExpenseReport);

export default router;
