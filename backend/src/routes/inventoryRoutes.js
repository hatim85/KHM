import express from 'express';
import { getStockMovements, getLowStock, adjustStock } from '../controllers/inventoryController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/movements', getStockMovements);
router.get('/low-stock', getLowStock);
router.post('/adjust', adjustStock);

export default router;
