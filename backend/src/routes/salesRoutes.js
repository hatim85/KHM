import express from 'express';
import { getSales, createSale, convertEstimateToTax, cancelSale, viewSalePdf, downloadSalePdf, publicSalePdf, generateCustomPdf } from '../controllers/salesController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { pdfLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();

// Public route for QR code
router.get('/:id/pdf/public', pdfLimiter, publicSalePdf);

// Protected routes
router.use(protect);

router.route('/')
  .get(getSales)
  .post(createSale);

router.post('/custom-pdf', pdfLimiter, generateCustomPdf);
router.post('/:id/convert', convertEstimateToTax);
router.post('/:id/cancel', cancelSale);

router.get('/:id/pdf/view', pdfLimiter, viewSalePdf);
router.get('/:id/pdf/download', pdfLimiter, downloadSalePdf);

export default router;
