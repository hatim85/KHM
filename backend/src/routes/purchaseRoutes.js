import express from 'express';
import { getPurchases, getPurchaseById, createPurchase } from '../controllers/purchaseController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect); // All purchase routes require auth

router.route('/')
  .get(getPurchases)
  .post(createPurchase);

router.route('/:id')
  .get(getPurchaseById);

export default router;
