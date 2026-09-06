import express from 'express';
import { getNotes, getNoteById, getNoteOriginals, createNote, cancelNote } from '../controllers/notesController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// NOTE: Credit/Debit Notes are record-only documents — no PDF endpoints exist
// (nothing is generated locally or uploaded anywhere).

// Protected routes
router.use(protect);

router.route('/')
  .get(getNotes)
  .post(createNote);

router.get('/originals', getNoteOriginals);

router.get('/:id', getNoteById);
router.post('/:id/cancel', cancelNote);

export default router;
