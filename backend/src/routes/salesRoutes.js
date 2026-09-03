import express from 'express';
import { getSales, createSale, viewSalePdf, downloadSalePdf, publicSalePdf } from '../controllers/salesController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Public route for QR code
router.get('/:id/pdf/public', publicSalePdf);

// Protected routes
router.use(protect);

router.route('/')
  .get(getSales)
  .post(createSale);

router.get('/:id/pdf/view', viewSalePdf);
router.get('/:id/pdf/download', downloadSalePdf);

export default router;
