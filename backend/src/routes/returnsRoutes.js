import express from 'express';
import { getReturns, getReturnById, getReturnable, createSalesReturn, createPurchaseReturn } from '../controllers/returnsController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getReturns);

router.post('/sales', createSalesReturn);
router.post('/purchases', createPurchaseReturn);

router.get('/returnable/:model/:id', getReturnable);

router.get('/:id', getReturnById);

export default router;
