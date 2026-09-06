import CompanySettings from '../models/CompanySettings.js';
import DocumentCounter from '../models/DocumentCounter.js';
import ApiError from './ApiError.js';

/**
 * Production document numbering.
 *
 * FINAL FORMAT:  PREFIX-FYMMDD-SEQUENCE
 *   e.g. INV-26270906-001
 *     INV      = document-type series prefix
 *     2627     = Indian financial year 2026-27 (last 2 digits of start + end)
 *     0906     = document date in the business timezone (MMDD)
 *     001      = per-day sequence for that type + FY + date + series (001–999)
 *
 * Rules enforced here:
 * - Indian FY (1 Apr – 31 Mar), derived from the DOCUMENT date in the
 *   business timezone — never the server clock alone.
 * - Sequence resets to 001 every new date, per document type / FY / series.
 * - 999 per day is the hard ceiling: the 1000th allocation throws an admin
 *   error and no `…-1000` number is ever created.
 * - Allocation is a single atomic MongoDB upsert (`$inc`), so concurrent
 *   requests can never collide and can never raise write conflicts.
 * - Numbers are backend-only. Callers must NOT accept frontend numbers.
 * - A consumed number is never reused: cancelled/failed documents keep
 *   their numbers, and gaps from aborted transactions are never refilled.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const MAX_DAILY_SEQUENCE = 999;

/** Business-calendar parts of a date in a given IANA timezone. */
export const getBusinessDateParts = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
};

/**
 * Indian financial-year START year for a date.
 * 1 April – 31 March. April (m=4) belongs to the new FY.
 * `dateOrYear`: a Date/timestamp, or (legacy) a full year number which is
 * returned as-is. `timezone` applies when a Date is given.
 */
export const getFinancialYearStart = (dateOrYear = new Date(), timezone = DEFAULT_TIMEZONE) => {
  if (typeof dateOrYear === 'number' && Number.isInteger(dateOrYear) && dateOrYear > 1900 && dateOrYear < 2200) {
    return dateOrYear;
  }
  const { y, m } = getBusinessDateParts(dateOrYear, timezone);
  return m >= 4 ? y : y - 1;
};

/** FY code embedded in numbers: FY 2026-27 => "2627". */
export const getFinancialYearCode = (fyStart) => {
  const s = Number(fyStart);
  return `${String(s).slice(-2)}${String(s + 1).slice(-2)}`;
};

export const getFinancialYearLabel = (fyStart) => `${fyStart}-${String(Number(fyStart) + 1).slice(-2)}`;

/** "20260906" key for per-day counter isolation. */
export const getDateKey = (y, m, d) =>
  `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;

/** "0906" (MMDD) as printed in the number. */
export const getMMDD = (m, d) => `${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;

export const DOCUMENT_TYPES = Object.freeze({
  TAX: { prefixField: 'taxInvoicePrefix', defaultPrefix: 'INV-', label: 'Tax Invoice' },
  SUPPLY: { prefixField: 'supplyPrefix', defaultPrefix: 'BOS-', label: 'Bill of Supply' },
  ESTIMATE: { prefixField: 'estimatePrefix', defaultPrefix: 'EST-', label: 'Estimate' },
  SALES_RETURN: { prefixField: 'salesReturnPrefix', defaultPrefix: 'SR-', label: 'Sales Return' },
  PURCHASE_RETURN: { prefixField: 'purchaseReturnPrefix', defaultPrefix: 'PR-', label: 'Purchase Return' },
  CREDIT_NOTE: { prefixField: 'creditNotePrefix', defaultPrefix: 'CN-', label: 'Credit Note' },
  DEBIT_NOTE: { prefixField: 'debitNotePrefix', defaultPrefix: 'DN-', label: 'Debit Note' },
  RECEIPT: { prefixField: 'receiptPrefix', defaultPrefix: 'REC-', label: 'Receipt Voucher' },
  PAYMENT: { prefixField: 'paymentPrefix', defaultPrefix: 'PAY-', label: 'Payment Voucher' },
});

export const formatDocumentNumber = (prefix, fyCode, mmdd, seq) =>
  `${prefix}${fyCode}${mmdd}-${String(seq).padStart(3, '0')}`;

/** Matches the production format: PREFIX-FYMMDD-SEQ (e.g. INV-26270906-001). */
const NEW_NUMBER_REGEX = /^[A-Z]{2,5}-\d{8}-\d{3}$/;

export const isNewDocumentNumber = (value) => {
  if (!value) return false;
  return NEW_NUMBER_REGEX.test(String(value).trim());
};

/** Matches the previous FY format (INV-2026-000001) — history, never generated. */
const OLD_FY_NUMBER_REGEX = /^[A-Z]{2,5}-(\d{4})-(\d{6})$/;

export const isFyDocumentNumber = (value) => {
  if (!value) return false;
  return OLD_FY_NUMBER_REGEX.test(String(value).trim());
};

/** Client placeholders that mean "backend, generate a number for me". */
export const isPlaceholderNumber = (value) => {
  if (!value) return true;
  const s = String(value).trim();
  if (s === '') return true;
  if (/\d{13,}/.test(s)) return true; // Date.now() style
  if (s === 'AUTO' || s === 'auto') return true;
  return false;
};

const resolveSettings = async () => {
  let settings = await CompanySettings.findOne();
  if (!settings) settings = await CompanySettings.create({ isSingleton: true });
  return settings;
};

/**
 * Atomically consume the next per-day sequence for a document type.
 *
 * Counter operations run WITHOUT the caller's transaction session, as
 * single-document atomic upserts. Concurrent requests serialize on the
 * counter document and each receives a distinct sequence.
 *
 * Resolves prefix + timezone from CompanySettings (override via opts).
 * The sequence bucket is keyed on the DOCUMENT date (not "now"), so
 * backdated documents consume that date's series.
 *
 * Throws 409 when the day's series is exhausted (999 used) — an admin must
 * configure another series (prefix); the ceiling value 1000 is never issued.
 *
 * Returns { number, prefix, fy, fyCode, fyLabel, dateKey, mmdd, seq, documentDate }.
 */
export const getNextDocumentNumber = async (docType, refDate = new Date(), opts = {}) => {
  const config = DOCUMENT_TYPES[docType];
  if (!config) throw new Error(`Unknown document type: ${docType}`);
  const settings = opts.settings || await resolveSettings();
  const timezone = opts.timezone || settings?.timezone || DEFAULT_TIMEZONE;
  const prefix = (opts.prefix || settings?.[config.prefixField] || config.defaultPrefix).toUpperCase();

  const businessDate = new Date(refDate || new Date());
  const { y, m, d } = getBusinessDateParts(businessDate, timezone);
  const fy = m >= 4 ? y : y - 1;
  const fyCode = getFinancialYearCode(fy);
  const dateKey = getDateKey(y, m, d);
  const mmdd = getMMDD(m, d);

  const key = `${docType}:${prefix}:${fyCode}:${dateKey}`;
  const counter = await DocumentCounter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true },
  );
  const seq = counter.seq;
  if (seq > MAX_DAILY_SEQUENCE) {
    throw new ApiError(
      409,
      `Daily sequence exhausted for ${prefix} on ${getFinancialYearLabel(fy)} ${mmdd} (${MAX_DAILY_SEQUENCE} documents already issued). ` +
      `Ask an administrator to configure another series (prefix) for continued billing — numbers are never reused.`,
    );
  }
  return {
    number: formatDocumentNumber(prefix, fyCode, mmdd, seq),
    prefix, fy, fyCode, fyLabel: getFinancialYearLabel(fy), dateKey, mmdd, seq,
    documentDate: businessDate,
    timezone,
  };
};

/** Read the would-be next sequence for a type+date WITHOUT consuming it. */
export const peekNextSequence = async (docType, prefix, fyCode, dateKey) => {
  const counter = await DocumentCounter.findOne({
    _id: `${docType}:${prefix}:${fyCode}:${dateKey}`,
  }).lean();
  return (counter?.seq || 0) + 1;
};

/**
 * Preview the next number for every document type WITHOUT consuming it.
 * Uses today's business date. Returns per-type:
 * { prefix, label, fy, fyLabel, fyCode, dateKey, mmdd, nextSeq, preview, exhausted }.
 */
export const previewNextDocumentNumber = (settings, docType, refDate = new Date()) => {
  const config = DOCUMENT_TYPES[docType];
  if (!config) return '';
  const timezone = settings?.timezone || DEFAULT_TIMEZONE;
  const prefix = (settings?.[config.prefixField] || config.defaultPrefix).toUpperCase();
  const { y, m, d } = getBusinessDateParts(refDate, timezone);
  const fy = m >= 4 ? y : y - 1;
  const fyCode = getFinancialYearCode(fy);
  return {
    prefix,
    label: config.label,
    fy,
    fyLabel: getFinancialYearLabel(fy),
    fyCode,
    dateKey: getDateKey(y, m, d),
    mmdd: getMMDD(m, d),
    timezone,
  };
};

/** Full async preview (includes live next sequence + formatted number). */
export const previewAllSequences = async (settings, refDate = new Date()) => {
  const out = {};
  for (const [key, config] of Object.entries(DOCUMENT_TYPES)) {
    const base = previewNextDocumentNumber(settings, key, refDate);
    const nextSeq = await peekNextSequence(key, base.prefix, base.fyCode, base.dateKey);
    out[key] = {
      ...base,
      nextSeq,
      exhausted: nextSeq > MAX_DAILY_SEQUENCE,
      preview: nextSeq > MAX_DAILY_SEQUENCE
        ? null
        : formatDocumentNumber(base.prefix, base.fyCode, base.mmdd, nextSeq),
    };
  }
  return out;
};
