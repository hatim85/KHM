import mongoose from 'mongoose';

/**
 * Per-day document sequence counters for the production numbering scheme:
 *   PREFIX-FYMMDD-SEQUENCE   e.g. INV-26270906-001
 *
 * One counter document per (document type, series prefix, financial year,
 * business date). `_id` carries the full composite key so the unique index
 * on `_id` plus atomic `$inc` guarantees no two concurrent requests ever
 * receive the same sequence — no MAX()+1 anywhere.
 */
const documentCounterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    // `${docType}:${prefix}:${fyCode}:${dateKey}`
    // e.g. `TAX:INV-:2627:20260906`
  },
  seq: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
}, { timestamps: true });

const DocumentCounter = mongoose.model('DocumentCounter', documentCounterSchema);
export default DocumentCounter;
