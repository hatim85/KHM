import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { getAuditLogs } from '../controllers/auditController.js';

const router = express.Router();

router.use(protect);

router.get('/', getAuditLogs);

export default router;
