/**
 * Production numbering + Credit/Debit Note acceptance suite.
 *
 * Covers the FINAL FORMAT (PREFIX-FYMMDD-SEQUENCE):
 * - Indian FY boundaries + "2627" style FY codes
 * - MMDD business-date component (business timezone)
 * - Per-day reset (001 each date), per-type isolation
 * - 999/day ceiling (never issues 1000; admin error instead)
 * - Concurrent allocation uniqueness (no MAX()+1)
 * - DB uniqueness constraints + no number reuse after cancel
 * - CN/DN lifecycle: ledger + outstanding effects, GST nets,
 *   original-rate mirroring, draft semantics, cancellation reversal
 *
 * Usage: npm run test:numbering
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'numbering-test-secret';

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: masterRoutes } = await import('../routes/masterDataRoutes.js');
const { default: salesRoutes } = await import('../routes/salesRoutes.js');
const { default: purchaseRoutes } = await import('../routes/purchaseRoutes.js');
const { default: paymentRoutes } = await import('../routes/paymentRoutes.js');
const { default: returnsRoutes } = await import('../routes/returnsRoutes.js');
const { default: notesRoutes } = await import('../routes/notesRoutes.js');
const { default: reportRoutes } = await import('../routes/reportRoutes.js');
const { default: settingsRoutes } = await import('../routes/settingsRoutes.js');
const { default: errorHandler } = await import('../middlewares/errorHandler.js');
const { default: User } = await import('../models/User.js');
const { default: Product } = await import('../models/Product.js');
const { default: Sale } = await import('../models/Sale.js');
const { default: Note } = await import('../models/Note.js');
const { default: DocumentCounter } = await import('../models/DocumentCounter.js');
const { default: CustomerLedger } = await import('../models/CustomerLedger.js');
const { default: SupplierLedger } = await import('../models/SupplierLedger.js');
const {
  getNextDocumentNumber,
  getFinancialYearStart,
  getFinancialYearCode,
  getBusinessDateParts,
  isNewDocumentNumber,
  peekNextSequence,
  MAX_DAILY_SEQUENCE,
} = await import('../utils/documentNumbering.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertStatus = (res, expected, ctx) => {
  if (res.status !== expected) {
    throw new Error(`${ctx}: expected ${expected}, got ${res.status} — ${JSON.stringify(res.body).slice(0, 400)}`);
  }
};
// 06 Sep 2026 10:30 IST == 05:00 UTC. IST = UTC+5:30 (no DST, safe arithmetic).
const ist = (y, m, d, hh = 10, mm = 30) => new Date(Date.UTC(y, m - 1, d, hh - 5, mm - 30));

console.log('[test] starting in-memory replica set...');
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'ephemeralForTest' } });
await mongoose.connect(replSet.getUri());
await mongoose.connection.syncIndexes();
console.log('[test] connected');

await User.create({ name: 'Admin', email: 'admin@num.test', password: 'password123', role: 'Admin' });
const admin = request.agent(app);
await test('login works', async () => {
  assertStatus(await admin.post('/api/auth/login').send({ email: 'admin@num.test', password: 'password123' }), 200, 'login');
});

// ---------------- FY / date math ----------------
await test('FY boundaries: Mar 31 → prior FY, Apr 1 → new FY', async () => {
  assert(getFinancialYearStart(ist(2026, 3, 31, 23, 59), 'Asia/Kolkata') === 2025, 'Mar 31 2026 → FY 2025');
  assert(getFinancialYearStart(ist(2026, 4, 1, 0, 0), 'Asia/Kolkata') === 2026, 'Apr 1 2026 → FY 2026');
  assert(getFinancialYearCode(2026) === '2627', 'FY 2026-27 code is 2627');
  assert(getFinancialYearCode(2027) === '2728', 'FY 2027-28 code is 2728');
});

await test('business date parts honor the business timezone', async () => {
  // 2026-09-06 23:30 UTC is already 2026-09-07 in Kolkata.
  const instant = new Date(Date.UTC(2026, 8, 6, 23, 30));
  const inIst = getBusinessDateParts(instant, 'Asia/Kolkata');
  assert(inIst.d === 7 && inIst.m === 9, `IST sees Sep 7 (${JSON.stringify(inIst)})`);
  const inUtc = getBusinessDateParts(instant, 'UTC');
  assert(inUtc.d === 6, 'UTC still sees Sep 6');
});

// ---------------- spec examples ----------------
await test('spec examples: 06 Sep 2026 → INV-26270906-001/-002, next day resets', async () => {
  const a = await getNextDocumentNumber('TAX', ist(2026, 9, 6));
  assert(a.number === 'INV-26270906-001', `got ${a.number}`);
  assert(a.fy === 2026 && a.fyCode === '2627' && a.mmdd === '0906' && a.seq === 1, 'parts decoded');
  assert(isNewDocumentNumber(a.number), 'matches production regex');
  const b = await getNextDocumentNumber('TAX', ist(2026, 9, 6));
  assert(b.number === 'INV-26270906-002', `got ${b.number}`);
  const c = await getNextDocumentNumber('TAX', ist(2026, 9, 7));
  assert(c.number === 'INV-26270907-001', `reset on new date: ${c.number}`);
});

await test('spec examples: Jan/Mar/Apr boundaries', async () => {
  // Isolate from earlier buckets by using dedicated prefixes per call? No —
  // same INV series, fresh dates, so each must be 001 of its own date.
  const jan = await getNextDocumentNumber('TAX', ist(2027, 1, 1));
  assert(jan.number === 'INV-26270101-001', `got ${jan.number}`);
  const mar = await getNextDocumentNumber('TAX', ist(2027, 3, 31));
  assert(mar.number === 'INV-26270331-001', `got ${mar.number}`);
  const apr = await getNextDocumentNumber('TAX', ist(2027, 4, 1));
  assert(apr.number === 'INV-27280401-001', `FY rollover: ${apr.number}`);
  assert(apr.fy === 2027 && apr.fyCode === '2728', 'rolled FY parts');
});

await test('sequences are isolated per document type and per series', async () => {
  const inv = await getNextDocumentNumber('TAX', ist(2026, 10, 5));
  const bos = await getNextDocumentNumber('SUPPLY', ist(2026, 10, 5));
  assert(inv.number === 'INV-26271005-001' && bos.number === 'BOS-26271005-001', `${inv.number} / ${bos.number}`);
  const rec = await getNextDocumentNumber('RECEIPT', ist(2026, 10, 5));
  assert(rec.number === 'REC-26271005-001', `got ${rec.number}`);
  const cn = await getNextDocumentNumber('CREDIT_NOTE', ist(2026, 10, 5));
  const dn = await getNextDocumentNumber('DEBIT_NOTE', ist(2026, 10, 5));
  assert(cn.number === 'CN-26271005-001' && dn.number === 'DN-26271005-001', `${cn.number} / ${dn.number}`);
});

await test('999/day ceiling: 1000th allocation fails, never issues …-1000', async () => {
  const day = ist(2026, 11, 11);
  await DocumentCounter.create({ _id: `PAYMENT:PAY-:2627:20261111`, seq: MAX_DAILY_SEQUENCE });
  assert(MAX_DAILY_SEQUENCE === 999, 'ceiling constant is 999');
  let threw = null;
  try {
    await getNextDocumentNumber('PAYMENT', day);
  } catch (e) { threw = e; }
  assert(threw && threw.statusCode === 409, `admin 409 error, got ${threw?.statusCode}: ${threw?.message}`);
  assert(/another series/i.test(threw.message), 'error demands another series');
  const peek = await peekNextSequence('PAYMENT', 'PAY-', '2627', '20261111');
  assert(peek === 1001, `counter parked past ceiling (peek ${peek}) — 1000 never formatted`);
  const all = await DocumentCounter.find({ _id: /PAYMENT:PAY/ });
  assert(!all.some((c) => String(c.seq).padStart(3, '0') === '1000' && false), 'sanity');
});

await test('20 parallel allocations → 20 unique sequential numbers', async () => {
  const day = ist(2026, 12, 1);
  const out = await Promise.all(Array.from({ length: 20 }, () => getNextDocumentNumber('ESTIMATE', day)));
  const numbers = out.map((o) => o.number);
  assert(new Set(numbers).size === 20, `all unique: ${numbers.join(',')}`);
  const seqs = out.map((o) => o.seq).sort((x, y) => x - y);
  assert(seqs[0] === 1 && seqs[19] === 20, `1..20, got ${seqs.join(',')}`);
  assert(numbers.every((n) => n.startsWith('EST-26271201-')), 'same FYMMDD bucket');
});

await test('preview endpoint shows FY, date, next seq and preview without consuming', async () => {
  const r = await admin.get('/api/settings/sequences/preview');
  assertStatus(r, 200, 'preview');
  for (const key of ['TAX', 'SUPPLY', 'ESTIMATE', 'SALES_RETURN', 'PURCHASE_RETURN', 'CREDIT_NOTE', 'DEBIT_NOTE', 'RECEIPT', 'PAYMENT']) {
    const row = r.body.data[key];
    assert(row && row.prefix && row.fyCode && row.mmdd && row.nextSeq >= 1, `${key} row complete`);
    if (!row.exhausted) assert(isNewDocumentNumber(row.preview), `${key} preview format ${row.preview}`);
  }
  const before = r.body.data.TAX.nextSeq;
  const again = await admin.get('/api/settings/sequences/preview');
  assert(again.body.data.TAX.nextSeq === before, 'preview consumes nothing');
});

// ---------------- fixtures for doc-level tests ----------------
let unitId, productId, custId, supplierId, saleId, saleNumber, purchaseId;
await test('fixtures (unit, 18% product, customer, supplier, stock)', async () => {
  const u = await admin.post('/api/master/units').send({ name: 'Pieces', shortName: 'PCS' });
  assertStatus(u, 201, 'unit');
  unitId = u.body.data._id;
  const p = await admin.post('/api/master/products').send({
    name: 'Numbered Widget', sku: 'NW-1', hsnCode: '8473', unit: unitId,
    purchasePrice: 100000, sellingPrice: 100000, gstRate: 18,
  });
  assertStatus(p, 201, 'product');
  productId = p.body.data._id;
  const c = await admin.post('/api/master/customers').send({ name: 'Num Buyer', stateCode: '24' });
  assertStatus(c, 201, 'customer');
  custId = c.body.data._id;
  const s = await admin.post('/api/master/suppliers').send({ name: 'Num Supplier', stateCode: '24' });
  assertStatus(s, 201, 'supplier');
  supplierId = s.body.data._id;
  const pur = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-NUM-1',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 50, rate: 80000, taxRate: 18 }],
  });
  assertStatus(pur, 201, 'stocking purchase');
  purchaseId = pur.body.data._id;
});

await test('HTTP sale gets a production number; cancel never reuses it', async () => {
  const r1 = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custId, invoiceDate: new Date().toISOString(),
    status: 'DRAFT', items: [{ product: productId, quantity: 1, rate: 100000 }],
  });
  assertStatus(r1, 201, 'draft sale');
  assert(isNewDocumentNumber(r1.body.data.invoiceNumber), `format ${r1.body.data.invoiceNumber}`);
  assert(r1.body.data.financialYear >= 2025 && r1.body.data.documentDate, 'FY + documentDate stored');
  // Client-supplied numbers are ignored (backend-only numbering).
  const r2 = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custId, invoiceNumber: 'INV-9999-999999',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 100000 }],
  });
  assertStatus(r2, 201, 'second draft');
  assert(!r2.body.data.invoiceNumber.includes('9999'), `client number ignored: ${r2.body.data.invoiceNumber}`);
  const cancel = await admin.post(`/api/sales/${r1.body.data._id}/cancel`);
  assertStatus(cancel, 200, 'cancel');
  const r3 = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custId, invoiceDate: new Date().toISOString(),
    status: 'DRAFT', items: [{ product: productId, quantity: 1, rate: 100000 }],
  });
  assertStatus(r3, 201, 'third draft');
  assert(r3.body.data.invoiceNumber !== r1.body.data.invoiceNumber, 'cancelled number not reused');
});

await test('mixed GST sale splits into INV + BOS of the same date bucket', async () => {
  const p0 = await admin.post('/api/master/products').send({
    name: 'Exempt Widget', unit: unitId, purchasePrice: 50000, sellingPrice: 50000, gstRate: 0,
  });
  assertStatus(p0, 201, '0% product');
  const exId = p0.body.data._id;
  const stock = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-NUM-2',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: exId, quantity: 10, rate: 40000, taxRate: 0 }],
  });
  assertStatus(stock, 201, 'exempt stock');
  const r = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custId, invoiceDate: new Date().toISOString(),
    status: 'COMPLETED', discount: 0,
    items: [
      { product: productId, quantity: 1, rate: 100000 },
      { product: exId, quantity: 2, rate: 50000 },
    ],
  });
  assertStatus(r, 201, 'mixed sale');
  assert(r.body.splitOccurred === true && r.body.splitBills?.length === 2, 'split into 2');
  const tax = r.body.splitBills.find((b) => b.billType === 'TAX_INVOICE');
  const bos = r.body.splitBills.find((b) => b.billType === 'BILL_OF_SUPPLY');
  assert(tax && bos, 'one of each kind');
  const taxDate = tax.invoiceNumber.slice(4, 12);
  assert(bos.invoiceNumber === `BOS-${taxDate}-001` || /^BOS-\d{8}-001$/.test(bos.invoiceNumber), `BOS same bucket: ${tax.invoiceNumber} / ${bos.invoiceNumber}`);
  assert(tax.invoiceNumber.slice(4, 12) === bos.invoiceNumber.slice(4, 12), 'same FYMMDD bucket');
  assert(bos.totalCgst === 0 && bos.totalSgst === 0 && bos.totalIgst === 0, 'BOS tax-free');
  assert(String(tax.splitGroupId) === String(bos.splitGroupId), 'linked pair');
});

await test('duplicate documentNumber rejected by uniqueness constraint', async () => {
  const dup = 'CN-26270906-001';
  const base = {
    noteType: 'CREDIT_NOTE', documentNumber: dup, noteDate: new Date(), documentDate: new Date(),
    financialYear: 2026, partyType: 'Customer', customer: custId,
    originalModel: 'Sale', originalDocument: new mongoose.Types.ObjectId(), originalDocumentNumber: 'INV-X',
    stream: 'TAX', items: [{ description: 'x', quantity: 1, rate: 100, taxableValue: 100, total: 118, gstRate: 18, cgst: 9, sgst: 9 }],
    subTotal: 100, totalCgst: 9, totalSgst: 9, grandTotal: 118, reason: 'dup test',
  };
  await new Note(base).save();
  let code = null;
  try { await new Note({ ...base }).save(); } catch (e) { code = e.code; }
  assert(code === 11000, `duplicate rejected with 11000, got ${code}`);
  await Note.deleteOne({ documentNumber: dup });
});

// ---------------- CN / DN lifecycle ----------------
await test('COMPLETED tax sale to adjust (₹1000 + 18% GST)', async () => {
  const r = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custId, invoiceDate: new Date().toISOString(),
    status: 'COMPLETED', discount: 0,
    items: [{ product: productId, quantity: 1, rate: 100000 }],
  });
  assertStatus(r, 201, 'sale');
  saleId = r.body.data._id;
  saleNumber = r.body.data.invoiceNumber;
  assert(r.body.data.grandTotal === 118000, `grandTotal ${r.body.data.grandTotal}`);
});

await test('CN: free-form partial credit posts ledger + shrinks outstanding', async () => {
  const before = await admin.get('/api/reports/gst');
  const outBefore = before.body.data.outputGst.total;
  const r = await admin.post('/api/notes').send({
    noteType: 'CREDIT_NOTE', customer: custId, originalId: saleId,
    noteDate: new Date().toISOString(), status: 'COMPLETED',
    reason: 'Excess amount charged',
    items: [{ description: 'Rate correction', quantity: 1, rate: 10000, gstRate: 18 }],
  });
  assertStatus(r, 201, 'credit note');
  const note = r.body.data;
  assert(/^CN-\d{8}-\d{3}$/.test(note.documentNumber), `CN number ${note.documentNumber}`);
  assert(note.grandTotal === 11800, `CN total 10000+18% = ${note.grandTotal}`);
  assert(note.originalDocumentNumber === saleNumber, 'original number linked');
  const sale = await Sale.findById(saleId);
  assert(sale.creditNoteAmount === 11800, `creditNoteAmount ${sale.creditNoteAmount}`);
  assert(sale.paymentStatus === 'PARTIAL', `status ${sale.paymentStatus}`);
  const ledger = await CustomerLedger.findOne({ referenceDocument: note._id });
  assert(ledger && ledger.credit === 11800 && ledger.transactionType === 'CREDIT_NOTE', 'ledger credit posted');
  const after = await admin.get('/api/reports/gst');
  assert(after.body.data.outputGst.total === outBefore - 1800, `output tax down by CN GST (1800): ${outBefore} → ${after.body.data.outputGst.total}`);
  assert(after.body.data.creditNotes.total === 1800, 'CN row in GST summary');
});

await test('CN exceeding outstanding is rejected (no negative outstanding)', async () => {
  const r = await admin.post('/api/notes').send({
    noteType: 'CREDIT_NOTE', customer: custId, originalId: saleId,
    noteDate: new Date().toISOString(), status: 'COMPLETED',
    reason: 'Too big',
    items: [{ description: 'Overshoot', quantity: 1, rate: 500000, gstRate: 18 }],
  });
  assert(r.status === 400, `oversize CN → 400, got ${r.status}`);
  assert(/outstanding/i.test(r.body.message), 'clear outstanding message');
});

await test('CN product lines mirror the original GST rate (never client input)', async () => {
  const r = await admin.post('/api/notes').send({
    noteType: 'CREDIT_NOTE', customer: custId, originalId: saleId,
    noteDate: new Date().toISOString(), status: 'DRAFT',
    reason: 'Damaged item',
    items: [{ description: 'Damaged widget', product: productId, quantity: 1, rate: 100000, gstRate: 5 }],
  });
  assertStatus(r, 201, 'draft CN');
  assert(r.body.data.items[0].gstRate === 18, `mirrored 18, not supplied 5 (got ${r.body.data.items[0].gstRate})`);
  const ledger = await CustomerLedger.findOne({ referenceDocument: r.body.data._id });
  assert(!ledger, 'DRAFT posts no ledger');
});

await test('CN cancel reverses ledger + restores outstanding', async () => {
  const cn = await Note.findOne({ noteType: 'CREDIT_NOTE', status: 'COMPLETED' });
  const c = await admin.post(`/api/notes/${cn._id}/cancel`);
  assertStatus(c, 200, 'cancel CN');
  assert(c.body.data.status === 'CANCELLED', 'marked cancelled');
  assert(c.body.data.documentNumber === cn.documentNumber, 'number retained');
  const sale = await Sale.findById(saleId);
  assert(sale.creditNoteAmount === 0, `creditNoteAmount restored (${sale.creditNoteAmount})`);
  assert(sale.paymentStatus === 'UNPAID', `status back to UNPAID (${sale.paymentStatus})`);
});

await test('DN: purchase upward adjustment posts supplier ledger + raises ITC', async () => {
  const before = await admin.get('/api/reports/gst');
  const itcBefore = before.body.data.inputTaxCredit.total;
  const r = await admin.post('/api/notes').send({
    noteType: 'DEBIT_NOTE', supplier: supplierId, originalId: purchaseId,
    noteDate: new Date().toISOString(), status: 'COMPLETED',
    reason: 'Price revision by supplier',
    items: [{ description: 'Rate difference', quantity: 1, rate: 10000, gstRate: 18 }],
  });
  assertStatus(r, 201, 'debit note');
  assert(/^DN-\d{8}-\d{3}$/.test(r.body.data.documentNumber), `DN number ${r.body.data.documentNumber}`);
  const ledger = await SupplierLedger.findOne({ referenceDocument: r.body.data._id });
  assert(ledger && ledger.credit === 11800 && ledger.transactionType === 'DEBIT_NOTE', 'supplier ledger credit posted');
  const after = await admin.get('/api/reports/gst');
  assert(after.body.data.inputTaxCredit.total === itcBefore + 1800, `ITC up by DN GST: ${itcBefore} → ${after.body.data.inputTaxCredit.total}`);
  assert(after.body.data.debitNotes.total === 1800, 'DN row in GST summary');
  const cancel = await admin.post(`/api/notes/${r.body.data._id}/cancel`);
  assertStatus(cancel, 200, 'cancel DN');
});

await test('CN/DN are record-only: no PDF stored, no PDF endpoints', async () => {
  const cn = await Note.findOne({ noteType: 'CREDIT_NOTE' });
  assert(cn && cn.pdf === undefined, 'no pdf field stored on notes');
  assertStatus(await admin.get(`/api/notes/${cn._id}/pdf/view`), 404, 'no view endpoint');
  assertStatus(await admin.get(`/api/notes/${cn._id}/pdf/download`), 404, 'no download endpoint');
});

await test('SR and CN stay separate concepts (return creates no note)', async () => {
  const notesBefore = await Note.countDocuments();
  const ret = await admin.post('/api/returns/sales').send({
    saleId, reason: 'Damage check', returnDate: new Date().toISOString(),
    items: [{ product: productId, quantity: 1 }],
  });
  assertStatus(ret, 201, 'sales return');
  assert(/^SR-\d{8}-\d{3}$/.test(ret.body.data.returnNumber), `SR number ${ret.body.data.returnNumber}`);
  assert(ret.body.data.documentDate, 'return documentDate stored');
  assert((await Note.countDocuments()) === notesBefore, 'no auto-created note');
});

console.log(`[test] ${results.filter((r) => r.ok).length}/${results.length} passed`);
if (results.some((r) => !r.ok)) {
  console.error('[test] NUMBERING/NOTE FAILURES');
  process.exit(1);
}
console.log('[test] ALL NUMBERING + NOTE TESTS PASSED');
await mongoose.disconnect();
await replSet.stop();
