import express from 'express';
import { getPayments, createPayment, getUnpaidInvoices } from '../controllers/paymentController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/unpaid', getUnpaidInvoices);

router.route('/')
  .get(getPayments)
  .post(createPayment);

export default router;
