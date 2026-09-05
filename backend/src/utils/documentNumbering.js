import CompanySettings from '../models/CompanySettings.js';

/**
 * Financial-year-aware document numbering.
 * Indian FY: 1 April – 31 March. Year component = FY start year.
 *   FY 2026-27 => INV-2026-000001
 * Each document type owns an independent sequence.
 * Generation is atomic (MongoDB findOneAndUpdate) so concurrent
 * requests can never receive the same number.
 */

export const getFinancialYearStart = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed; April = 3
  return month >= 3 ? year : year - 1;
};

export const DOCUMENT_TYPES = Object.freeze({
  TAX: { prefixField: 'taxInvoicePrefix', nextField: 'taxInvoiceNextNumber', fyField: 'taxInvoiceFY', defaultPrefix: 'INV-' },
  ESTIMATE: { prefixField: 'estimatePrefix', nextField: 'estimateNextNumber', fyField: 'estimateFY', defaultPrefix: 'EST-' },
  SALES_RETURN: { prefixField: 'salesReturnPrefix', nextField: 'salesReturnNextNumber', fyField: 'salesReturnFY', defaultPrefix: 'SR-' },
  PURCHASE_RETURN: { prefixField: 'purchaseReturnPrefix', nextField: 'purchaseReturnNextNumber', fyField: 'purchaseReturnFY', defaultPrefix: 'PR-' },
  RECEIPT: { prefixField: 'receiptPrefix', nextField: 'receiptNextNumber', fyField: 'receiptFY', defaultPrefix: 'REC-' },
  PAYMENT: { prefixField: 'paymentPrefix', nextField: 'paymentNextNumber', fyField: 'paymentFY', defaultPrefix: 'PAY-' },
});

export const formatDocumentNumber = (prefix, fyStart, seq) =>
  `${prefix}${fyStart}-${String(seq).padStart(6, '0')}`;

/** Matches INV-2026-000001 style numbers (prefix letters + FY + 6 digits). */
const FY_NUMBER_REGEX = /^[A-Z]{2,5}-(\d{4})-(\d{6})$/;

export const isFyDocumentNumber = (value) => {
  if (!value) return false;
  return FY_NUMBER_REGEX.test(String(value).trim());
};

/** Legacy numbers (INV-0001, timestamps) are accepted for backward compat but never generated. */
export const isPlaceholderNumber = (value) => {
  if (!value) return true;
  const s = String(value).trim();
  if (s === '') return true;
  if (/\d{13,}/.test(s)) return true; // Date.now() style
  if (s === 'AUTO' || s === 'auto') return true;
  return false;
};

/**
 * Atomically consume the next sequence value for a document type.
 *
 * Counter operations run WITHOUT the caller's transaction session, as
 * single-document atomic writes. WiredTiger serializes them, so parallel
 * requests can neither collide nor raise write conflicts (code 112) —
 * unlike counter updates inside multi-document transactions.
 *
 * Trade-off: a business transaction that aborts after consuming a number
 * leaves a gap. Gaps are safe (numbers are never reused); stock
 * pre-validation upstream keeps burns rare.
 *
 * FY rollover is race-safe: exactly one request wins the $ne-guarded reset
 * (seq 1); losers fall through to the increment path (seq 2, 3, ...).
 * Returns { number, prefix, fy, seq }.
 */
export const getNextDocumentNumber = async (docType, refDate = new Date()) => {
  const config = DOCUMENT_TYPES[docType];
  if (!config) throw new Error(`Unknown document type: ${docType}`);
  const fy = getFinancialYearStart(refDate);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Fast path: FY already current — atomic increment.
    const current = await CompanySettings.findOneAndUpdate(
      { isSingleton: true, [config.fyField]: fy },
      { $inc: { [config.nextField]: 1 } },
      { new: true }
    );
    if (current) {
      const seq = current[config.nextField] - 1;
      const prefix = current[config.prefixField] || config.defaultPrefix;
      return { number: formatDocumentNumber(prefix, fy, seq), prefix, fy, seq };
    }

    // FY rollover (or first use): exactly one request wins the reset.
    const rolled = await CompanySettings.findOneAndUpdate(
      { isSingleton: true, [config.fyField]: { $ne: fy } },
      { $set: { [config.fyField]: fy, [config.nextField]: 2 } },
      { new: true }
    );
    if (rolled) {
      const prefix = rolled[config.prefixField] || config.defaultPrefix;
      return { number: formatDocumentNumber(prefix, fy, 1), prefix, fy, seq: 1 };
    }

    // Singleton missing (or lost a creation race): create-or-ignore, then loop.
    try {
      await CompanySettings.create({ isSingleton: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new Error(`Could not allocate a ${docType} document number after retries`);
};

/** Preview the next number WITHOUT consuming it. */
export const previewNextDocumentNumber = (settings, docType, refDate = new Date()) => {
  const config = DOCUMENT_TYPES[docType];
  if (!config) return '';
  const fy = getFinancialYearStart(refDate);
  const prefix = settings?.[config.prefixField] || config.defaultPrefix;
  const storedFy = settings?.[config.fyField];
  const next = storedFy === fy ? settings?.[config.nextField] || 1 : 1;
  return formatDocumentNumber(prefix, fy, next);
};
