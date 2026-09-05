import express from 'express';
import { getPayments, createPayment, reversePayment, getUnpaidInvoices } from '../controllers/paymentController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/unpaid', getUnpaidInvoices);

router.route('/')
  .get(getPayments)
  .post(createPayment);

router.post('/:id/reverse', reversePayment);

export default router;
