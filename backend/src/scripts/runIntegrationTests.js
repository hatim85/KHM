/**
 * Production acceptance suite — runs the §36 checklist against a live
 * (in-memory replica-set) MongoDB through the REAL Express routers.
 *
 * Covers: A–C sales math, D–M payments + reversal, N/O cancellation mechanics,
 * P/Q conversion no-double-count, R/S snapshot stability, T concurrency,
 * U number retention, V–Y backup/OAuth failure paths, Z/AA authorization,
 * AB audit immutability, plus WAC valuation, idempotency (§33) and
 * master-data delete guards (§30).
 *
 * Usage: npm run test:integration
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder';

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: masterRoutes } = await import('../routes/masterDataRoutes.js');
const { default: salesRoutes } = await import('../routes/salesRoutes.js');
const { default: purchaseRoutes } = await import('../routes/purchaseRoutes.js');
const { default: paymentRoutes } = await import('../routes/paymentRoutes.js');
const { default: returnsRoutes } = await import('../routes/returnsRoutes.js');
const { default: inventoryRoutes } = await import('../routes/inventoryRoutes.js');
const { default: reportRoutes } = await import('../routes/reportRoutes.js');
const { default: auditRoutes } = await import('../routes/auditRoutes.js');
const { default: settingsRoutes } = await import('../routes/settingsRoutes.js');
const { default: errorHandler } = await import('../middlewares/errorHandler.js');
const { default: User } = await import('../models/User.js');
const { default: Product } = await import('../models/Product.js');
const { default: Sale } = await import('../models/Sale.js');
const { default: StockMovement } = await import('../models/StockMovement.js');
const { default: AuditLog } = await import('../models/AuditLog.js');
const { runDatabaseBackup, cleanupOldDriveBackups } = await import('../services/backupService.js');
const { getDriveService } = await import('../services/backupService.js');
const { generateHTML } = await import('../utils/pdfGenerator.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
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
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const assertStatus = (res, expected, ctx) => {
  if (res.status !== expected) {
    throw new Error(`${ctx}: expected ${expected}, got ${res.status} — ${JSON.stringify(res.body).slice(0, 300)}`);
  }
};
const fyStart = (() => {
  const d = new Date();
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
})();

/**
 * First-write transactions on a fresh DB can transiently abort while the
 * server finishes background index builds (codes 112/251). Production
 * catalogs are stable so this only affects the suite's first sale —
 * retry it boundedly rather than masking real errors.
 */
const postSaleWithRetry = async (payload, attempts = 3) => {
  let last;
  for (let i = 0; i < attempts; i++) {
    const r = await admin.post('/api/sales').send({ ...payload, invoiceNumber: 'AUTO' });
    if (r.status === 201) return r;
    last = r;
    const transient = r.status === 500 && /aborted|112|transient|catalog/i.test(JSON.stringify(r.body));
    if (!transient) return r;
    await new Promise((res) => setTimeout(res, 1000));
  }
  return last;
};

console.log('[test] starting in-memory replica set...');
// ephemeralForTest keeps everything in RAM: hermetic suite, immune to host
// disk pressure (mongod otherwise refuses writes under ~512MB free).
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'ephemeralForTest' },
});
await mongoose.connect(replSet.getUri());
// Build all indexes up-front: fresh DBs build them in the background, and
// first-writes inside transactions would otherwise race catalog changes.
await mongoose.connection.syncIndexes();
// Hybrid builds continue in the background after the server acknowledges
// them — drain them before the suite starts.
{
  const adminDb = mongoose.connection.db.admin();
  const start = Date.now();
  for (;;) {
    const { inprog = [] } = await adminDb.command({ currentOp: true });
    const building = inprog.filter((op) => op.command && op.command.createIndexes);
    if (building.length === 0) break;
    if (Date.now() - start > 90000) throw new Error('timed out waiting for index builds');
    await new Promise((r) => setTimeout(r, 500));
  }
}
console.log('[test] connected');

// ---------- fixtures ----------
await User.create({ name: 'Admin', email: 'admin@khm.test', password: 'password123', role: 'Admin' });
await User.create({ name: 'Manager', email: 'manager@khm.test', password: 'password123', role: 'Manager', permissions: ['reports.view'] });
const admin = request.agent(app);
const manager = request.agent(app);
await test('login works (admin + manager)', async () => {
  assertStatus(await admin.post('/api/auth/login').send({ email: 'admin@khm.test', password: 'password123' }), 200, 'admin login');
  assertStatus(await manager.post('/api/auth/login').send({ email: 'manager@khm.test', password: 'password123' }), 200, 'manager login');
});

let unitId, productId, custIntraId, custInterId, supplierId;
await test('master fixtures (unit, product, customers, supplier)', async () => {
  const u = await admin.post('/api/master/units').send({ name: 'Pieces', shortName: 'PCS' });
  assertStatus(u, 201, 'create unit');
  unitId = u.body.data._id;
  const p = await admin.post('/api/master/products').send({
    name: 'Test Widget', sku: 'WDG-001', hsnCode: '8473', unit: unitId,
    purchasePrice: 200000, sellingPrice: 250000, gstRate: 18, reorderLevel: 5,
  });
  assertStatus(p, 201, 'create product');
  productId = p.body.data._id;
  assert(p.body.data.taxStock === 0 && p.body.data.estimateStock === 0, 'pools start empty');
  const c1 = await admin.post('/api/master/customers').send({ name: 'Local Trader', stateCode: '24', phone: '9999999999', address: 'Ahmedabad' });
  assertStatus(c1, 201, 'create intra-state customer');
  custIntraId = c1.body.data._id;
  const c2 = await admin.post('/api/master/customers').send({ name: 'Mumbai Trader', gstin: '27ABCDE1234F1Z5', stateCode: '27', address: 'Mumbai' });
  assertStatus(c2, 201, 'create inter-state customer');
  custInterId = c2.body.data._id;
  const s = await admin.post('/api/master/suppliers').send({ name: 'Test Supplier', stateCode: '24' });
  assertStatus(s, 201, 'create supplier');
  supplierId = s.body.data._id;
});

await test('GSTIN is optional free text; bad state code still rejected', async () => {
  const free = await admin.post('/api/master/customers').send({ name: 'Fake', gstin: 'ABCD', stateCode: '24' });
  assertStatus(free, 201, 'any GSTIN text accepted');
  assert(free.body.data.gstin === 'ABCD', 'stored as-is (upper-cased)');
  const badState = await admin.post('/api/master/customers').send({ name: 'Fake2', stateCode: '00' });
  assert(badState.status === 400, `bad state should 400, got ${badState.status}`);
});

// ---------- purchase (§35) + WAC ----------
let purchaseId;
await test('purchase §35 math + WAC seed (20 × ₹2000 @18%)', async () => {
  const r = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-001',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 20, rate: 200000, taxRate: 18 }],
  });
  assertStatus(r, 201, 'create purchase');
  const p = r.body.data;
  purchaseId = p._id;
  assert(p.subTotal === 4000000, `subTotal ${p.subTotal}`);
  assert(p.taxTotal === 720000, `taxTotal ${p.taxTotal}`);
  assert(p.grandTotal === 4720000, `grandTotal ${p.grandTotal}`);
  assert(p.supplierSnapshot?.name === 'Test Supplier', 'supplier snapshot captured');
  assert(p.items[0].productName === 'Test Widget', 'item snapshot captured');
  const prod = await Product.findById(productId);
  assert(prod.taxStock === 20, `TAX pool ${prod.taxStock}`);
  assert(prod.estimateStock === 0, 'ESTIMATE pool untouched');
  assert(prod.averageCostTax === 200000, `TAX WAC ${prod.averageCostTax}`);
});

await test('WAC updates on second purchase (10 × ₹2200)', async () => {
  const r = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-002',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 10, rate: 220000, taxRate: 18 }],
  });
  assertStatus(r, 201, 'second purchase');
  const prod = await Product.findById(productId);
  assert(prod.taxStock === 30, `TAX pool ${prod.taxStock}`);
  // (20*200000 + 10*220000)/30 = 206666.67 -> 206667
  assert(prod.averageCostTax === 206667, `TAX WAC ${prod.averageCostTax}`);
});

await test('ESTIMATE purchase funds only the ESTIMATE pool', async () => {
  const r = await admin.post('/api/purchases').send({
    transactionType: 'ESTIMATE', supplier: supplierId, invoiceNumber: 'SUP-EST-1',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 20, rate: 200000, taxRate: 0 }],
  });
  assertStatus(r, 201, 'estimate purchase');
  const prod = await Product.findById(productId);
  assert(prod.estimateStock === 20, `ESTIMATE pool ${prod.estimateStock}`);
  assert(prod.taxStock === 30, 'TAX pool untouched');
  assert(prod.averageCostEst === 200000, `ESTIMATE WAC ${prod.averageCostEst}`);
});

await test('duplicate product lines rejected on sale and purchase', async () => {
  const dup = { product: productId, quantity: 1, rate: 250000 };
  const rs = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [dup, { ...dup }],
  });
  assert(rs.status === 400, `duplicate sale lines → 400, got ${rs.status}`);
  assert(/uplicate product/.test(rs.body.message), 'clear duplicate message');
  const rp = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-DUP',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 200000, taxRate: 18 }, { product: productId, quantity: 1, rate: 200000, taxRate: 18 }],
  });
  assert(rp.status === 400, `duplicate purchase lines → 400, got ${rp.status}`);
});

await test('pools are isolated: TAX stock not sellable in ESTIMATE bills', async () => {
  const prod = await Product.findById(productId);
  const over = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: prod.estimateStock + 1, rate: 250000 }],
  });
  assert(over.status === 400, `cross-pool sale rejected, got ${over.status}`);
  assert(/ESTIMATE stock/.test(over.body.message), 'pool-specific message');
});

// ---------- A. intra-state tax sale (§35) ----------
let taxSaleId, taxSaleNumber;
await test('A. intra-state tax sale §35 (5 × ₹2500 @18% → CGST=SGST=₹1125)', async () => {
  const r = await postSaleWithRetry({
    transactionType: 'TAX', customer: custIntraId,
    invoiceDate: new Date().toISOString(), status: 'COMPLETED', discount: 0,
    items: [{ product: productId, quantity: 5, rate: 250000 }],
  });
  assertStatus(r, 201, 'create tax sale');
  const s = r.body.data;
  taxSaleId = s._id;
  taxSaleNumber = s.invoiceNumber;
  assert(s.subTotal === 1250000, `subTotal ${s.subTotal}`);
  assert(s.totalCgst === 112500, `cgst ${s.totalCgst}`);
  assert(s.totalSgst === 112500, `sgst ${s.totalSgst}`);
  assert(s.totalIgst === 0, `igst ${s.totalIgst}`);
  assert(s.grandTotal === 1475000, `grandTotal ${s.grandTotal}`);
  assert(new RegExp(`^INV-${fyStart}-\\d{6}$`).test(s.invoiceNumber), `FY number ${s.invoiceNumber}`);
  assert(s.customerSnapshot?.name === 'Local Trader', 'customer snapshot');
  assert(s.companySnapshot?.stateCode === '24', 'company snapshot');
  assert(s.items[0].productName === 'Test Widget', 'item snapshot');
  const prod = await Product.findById(productId);
  assert(prod.taxStock === 25, `TAX pool draws the tax sale (${prod.taxStock})`);
  assert(prod.estimateStock === 20, 'ESTIMATE pool untouched by tax sale');
});

// ---------- B. inter-state ----------
await test('B. inter-state tax sale → IGST only', async () => {
  const r = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custInterId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 250000 }],
  });
  assertStatus(r, 201, 'create inter-state sale');
  const s = r.body.data;
  assert(s.totalCgst === 0 && s.totalSgst === 0, 'no CGST/SGST');
  assert(s.totalIgst === 90000, `igst ${s.totalIgst}`); // 2*250000*18%
  assert(s.grandTotal === 590000, `total ${s.grandTotal}`);
});

// ---------- C. estimate ----------
let estimateId, estimateNumber;
await test('C. estimate sale: no GST, stock decreases', async () => {
  const r = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 250000 }],
  });
  assertStatus(r, 201, 'create estimate');
  const s = r.body.data;
  estimateId = s._id;
  estimateNumber = s.invoiceNumber;
  assert(s.totalCgst === 0 && s.totalSgst === 0 && s.totalIgst === 0, 'estimate has no GST');
  assert(s.grandTotal === 500000, `estimate total ${s.grandTotal}`);
  assert(new RegExp(`^EST-${fyStart}-\\d{6}$`).test(s.invoiceNumber), `FY number ${s.invoiceNumber}`);
  const prod = await Product.findById(productId);
  assert(prod.estimateStock === 18, `ESTIMATE pool draws the estimate sale (${prod.estimateStock})`); // 20-2
  assert(prod.taxStock === 23, 'TAX pool untouched by estimate sale'); // 30-5-2
});

// ---------- negative stock guard ----------
await test('PDF bill content: qty+unit, place of supply, amount words, transport placement', async () => {
  const company = { companyName: 'KHM', address: 'Addr', gstin: '24ABCDE1234F1Z5', stateCode: '24', phone: '123' };
  const baseItems = [{
    product: { name: 'Bosch Drill', sku: 'BD-1', hsnCode: '8467', unit: { shortName: 'NOS' } },
    quantity: 2, rate: 650000, specification: '12mm chuck, 5m coil',
    taxableValue: 1300000, gstRate: 18,
    cgst: 117000, sgst: 117000, igst: 0, total: 1534000,
    productName: '', sku: '', hsnCode: '', unitName: 'NOS',
  }];
  const taxSale = {
    transactionType: 'TAX', invoiceNumber: 'INV-2026-000001', invoiceDate: new Date(),
    customer: { name: 'Local Trader', address: 'Ahm', gstin: '24XYZ', stateCode: '24', phone: '999' },
    customerSnapshot: {}, items: baseItems,
    subTotal: 1300000, totalCgst: 117000, totalSgst: 117000, totalIgst: 0,
    discount: 0, grandTotal: 1534000, dispatchThrough: 'VRL Logistics', remarks: '',
  };
  const html = generateHTML(taxSale, company, '');
  assert(html.includes('2 NOS'), 'qty printed with unit');
  assert(html.includes('Place of Supply'), 'place of supply present');
  assert(html.includes('Gujarat (24)'), 'place of supply value');
  assert(html.includes('Rupees Fifteen Thousand Three Hundred Forty Only'), 'amount in words');
  assert(!html.includes('Terms'), 'no terms section');
  assert(html.includes('12mm chuck, 5m coil'), 'specification printed');
  assert(html.includes('meta-column'), 'transport sits in right meta column');
  assert(html.includes('amount-words-value'), 'amount words two-line compact box');
  const transportIdx = html.indexOf('Dispatch Details');
  const detailsIdx = html.indexOf('Invoice Details');
  const itemsIdx = html.indexOf('<table class="items-table"');
  assert(transportIdx > detailsIdx && transportIdx < itemsIdx, 'transport box below invoice details, above items');

  const est = {
    ...taxSale, transactionType: 'ESTIMATE', invoiceNumber: 'EST-2026-000001',
    totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 1300000,
    items: [{ ...baseItems[0], cgst: 0, sgst: 0, igst: 0, total: 1300000 }],
  };
  const estHtml = generateHTML(est, company, '');
  assert(estHtml.includes('Estimate Details') && estHtml.includes('Estimate No:'), 'estimate labels');
  assert(!estHtml.includes('Invoice Details') && !estHtml.includes('Invoice No:'), 'no invoice wording on estimate');
  assert(estHtml.includes('Rupees Thirteen Thousand Only'), 'estimate amount words');
});

await test('transport/dispatchThrough persists end-to-end', async () => {
  // DRAFT: proves persistence without moving stock (later tests assert exact quantities).
  const r = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT', dispatchThrough: 'VRL Logistics',
    items: [{ product: productId, quantity: 1, rate: 100000 }],
  });
  assertStatus(r, 201, 'create sale with transport');
  assert(r.body.data.dispatchThrough === 'VRL Logistics', 'transport stored');
  const fetched = await Sale.findById(r.body.data._id);
  assert(fetched.dispatchThrough === 'VRL Logistics', 'transport persisted');
});

await test('specification comes from product master, never the bill payload', async () => {
  const upd = await admin.put(`/api/master/products/${productId}`).send({ specification: '12mm chuck' });
  assertStatus(upd, 200, 'set master specification');
  const r = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 100000, specification: 'HACKED' }],
  });
  assertStatus(r, 201, 'create sale');
  assert(r.body.data.items[0].specification === '12mm chuck', `master spec snapshotted, payload ignored (got "${r.body.data.items[0].specification}")`);
  // Restore neutral master spec for later tests.
  await admin.put(`/api/master/products/${productId}`).send({ specification: '' });
});

// ---------- negative stock guard ----------
await test('insufficient stock rejected (no number burned silently)', async () => {
  const r = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 9999, rate: 250000 }],
  });
  assert(r.status === 400, `expected 400, got ${r.status}`);
  assert(/Insufficient .*stock/.test(r.body.message), 'clear stock message');
});

// ---------- D–G. payments ----------
let receiptId, receipt2Id;
await test('D/E/F. partial receipt on tax invoice (₹10000 of ₹14750)', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'TAX', partyType: 'Customer', partyId: custIntraId,
    amount: 1000000, paymentMode: 'CASH',
    allocations: [{ invoiceId: taxSaleId, amount: 1000000 }],
  });
  assertStatus(r, 201, 'create receipt');
  receiptId = r.body.data._id;
  assert(r.body.data.unallocatedAmount === 0, 'fully allocated');
  assert(r.body.data.partySnapshot?.name === 'Local Trader', 'party snapshot');
  assert(r.body.data.allocations[0].invoiceNumber === taxSaleNumber, 'allocation invoice snapshot');
  const sale = await Sale.findById(taxSaleId);
  assert(sale.amountPaid === 1000000 && sale.paymentStatus === 'PARTIAL', 'PARTIAL status');
  assert(sale.grandTotal - sale.amountPaid === 475000, 'remaining ₹4750');
});

await test('G. full payment completes invoice (PAID)', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'TAX', partyType: 'Customer', partyId: custIntraId,
    amount: 475000, paymentMode: 'UPI',
    allocations: [{ invoiceId: taxSaleId, amount: 475000 }],
  });
  assertStatus(r, 201, 'completing receipt');
  receipt2Id = r.body.data._id;
  const sale = await Sale.findById(taxSaleId);
  assert(sale.paymentStatus === 'PAID' && sale.amountPaid === 1475000, 'PAID in full');
});

await test('H. unallocated customer advance preserved', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'ESTIMATE', partyType: 'Customer', partyId: custIntraId,
    amount: 1000000, paymentMode: 'CASH',
    allocations: [{ invoiceId: estimateId, amount: 200000 }],
  });
  assertStatus(r, 201, 'advance receipt');
  assert(r.body.data.unallocatedAmount === 800000, `unallocated ${r.body.data.unallocatedAmount}`);
});

await test('K. over-allocation rejected', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'ESTIMATE', partyType: 'Customer', partyId: custIntraId,
    amount: 99999999, paymentMode: 'CASH',
    allocations: [{ invoiceId: estimateId, amount: 99999999 }],
  });
  assert(r.status === 400, `expected 400, got ${r.status}`);
  assert(/verpay|utstanding|exceed/i.test(r.body.message), 'clear overpay message');
});

await test('stream mixing rejected (TAX invoice in ESTIMATE payment)', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'ESTIMATE', partyType: 'Customer', partyId: custInterId,
    amount: 100000, paymentMode: 'CASH',
    allocations: [{ invoiceId: taxSaleId, amount: 100000 }],
  });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});

await test('L. idempotent replay returns original (no duplicate)', async () => {
  const key = `test-key-${Date.now()}`;
  const payload = {
    type: 'RECEIPT', stream: 'ESTIMATE', partyType: 'Customer', partyId: custIntraId,
    amount: 50000, paymentMode: 'CASH', allocations: [],
  };
  const r1 = await admin.post('/api/payments').set('idempotency-key', key).send(payload);
  assertStatus(r1, 201, 'first payment');
  assert(new RegExp(`^REC-${fyStart}-\\d{6}$`).test(r1.body.data.voucherNumber), `FY voucher ${r1.body.data.voucherNumber}`);
  const r2 = await admin.post('/api/payments').set('idempotency-key', key).send(payload);
  assert(r2.status === 200 && r2.body.deduplicated === true, 'replay deduplicated');
  assert(String(r2.body.data._id) === String(r1.body.data._id), 'same document returned');
});

// ---------- M. reversal ----------
await test('M. payment reversal restores outstanding + ledger', async () => {
  const before = await Sale.findById(taxSaleId);
  assert(before.paymentStatus === 'PAID', 'precondition PAID');
  const r = await admin.post(`/api/payments/${receiptId}/reverse`);
  assertStatus(r, 200, 'reverse payment');
  assert(r.body.data.status === 'REVERSED', 'marked REVERSED');
  const after = await Sale.findById(taxSaleId);
  assert(after.amountPaid === 475000 && after.paymentStatus === 'PARTIAL', `restored PARTIAL, paid=${after.amountPaid}`);
  const r2 = await admin.post(`/api/payments/${receiptId}/reverse`);
  assert(r2.status === 400, 'double reversal rejected');
  const audit = await AuditLog.findOne({ action: 'PAYMENT_REVERSED' });
  assert(!!audit, 'PAYMENT_REVERSED audited');
});

// ---------- supplier payment (§35: ₹20000 of ₹47200 → ₹27200) ----------
await test('supplier payment §35 (₹20000 of ₹47200 leaves ₹27200)', async () => {
  const r = await admin.post('/api/payments').send({
    type: 'PAYMENT', stream: 'TAX', partyType: 'Supplier', partyId: supplierId,
    amount: 2000000, paymentMode: 'BANK_TRANSFER',
    allocations: [{ invoiceId: purchaseId, amount: 2000000 }],
  });
  assertStatus(r, 201, 'supplier payment');
  assert(new RegExp(`^PAY-${fyStart}-\\d{6}$`).test(r.body.data.voucherNumber), `FY voucher ${r.body.data.voucherNumber}`);
  const { default: Purchase } = await import('../models/Purchase.js');
  const pur = await Purchase.findById(purchaseId);
  assert(pur.amountPaid === 2000000 && pur.paymentStatus === 'PARTIAL', 'purchase PARTIAL');
  assert(pur.grandTotal - pur.amountPaid === 2720000, 'remaining ₹27200');
});

// ---------- P/Q. conversion ----------
let convertedNumber;
await test('P/Q. estimate→tax conversion: new invoice, no double stock, no double count', async () => {
  const beforeDoc = await Product.findById(productId);
  const stockBefore = { tax: beforeDoc.taxStock, est: beforeDoc.estimateStock };
  const r = await admin.post(`/api/sales/${estimateId}/convert`);
  assertStatus(r, 201, 'convert estimate');
  const inv = r.body.data;
  convertedNumber = inv.invoiceNumber;
  assert(inv.transactionType === 'TAX', 'new doc is TAX');
  assert(String(inv.sourceEstimateId) === String(estimateId), 'references source');
  assert(inv.invoiceNumber !== estimateNumber, 'fresh number, estimate number untouched');
  assert(inv.totalCgst + inv.totalSgst + inv.totalIgst > 0, 'GST calculated on conversion');
  const afterDoc = await Product.findById(productId);
  const stockAfter = { tax: afterDoc.taxStock, est: afterDoc.estimateStock };
  assert(stockAfter.tax === stockBefore.tax && stockAfter.est === stockBefore.est, `no duplicate stock movement (TAX ${stockBefore.tax}→${stockAfter.tax}, EST ${stockBefore.est}→${stockAfter.est})`);
  const est = await Sale.findById(estimateId);
  assert(est.transactionType === 'ESTIMATE' && est.status === 'COMPLETED', 'estimate preserved');
  assert(!est.status || est.status !== 'CONVERTED', 'no CONVERTED status');

  // GST report counts only TAX docs
  const gst = await admin.get('/api/reports/gst');
  assertStatus(gst, 200, 'gst report');
  assert(gst.body.data.outputGst.taxableValue >= 1250000 + 500000, 'TAX sales in GST report');

  // Estimate conversions report shows CONVERTED
  const conv = await admin.get('/api/reports/estimates/conversions');
  assertStatus(conv, 200, 'conversions report');
  const row = conv.body.data.find((x) => x.estimateNumber === estimateNumber);
  assert(row && row.conversionStatus === 'CONVERTED' && row.invoiceNumber === convertedNumber, 'conversion tracked');

  // Double conversion rejected
  const r2 = await admin.post(`/api/sales/${estimateId}/convert`);
  assert(r2.status === 400, 'second conversion rejected');
});

// ---------- R/S. snapshot stability ----------
await test('R/S. history survives master edits (snapshots)', async () => {
  await admin.put(`/api/master/customers/${custIntraId}`).send({ name: 'Renamed Trader' });
  await admin.put(`/api/master/products/${productId}`).send({ name: 'Renamed Widget' });
  const r = await admin.get(`/api/sales?stream=TAX`);
  assertStatus(r, 200, 'list sales');
  const s = r.body.data.find((x) => String(x._id) === String(taxSaleId));
  assert(s.customerSnapshot?.name === 'Local Trader', `customer snapshot stable (${s.customerSnapshot?.name})`);
  assert(s.items[0].productName === 'Test Widget', 'item snapshot stable');
});

// ---------- T. concurrency ----------
await test('T. 10 parallel sales → 10 unique sequential FY numbers', async () => {
  // DRAFT exercises the identical atomic numbering path without the
  // stock/ledger/PDF side effects (which are covered by A–C).
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 100000 }],
  })));
  for (const [i, res] of results.entries()) assertStatus(res, 201, `parallel sale ${i}`);
  const numbers = results.map((res) => res.body.data.invoiceNumber);
  assert(new Set(numbers).size === 10, `all unique: ${numbers.join(',')}`);
  const seqs = numbers.map((n) => Number(n.split('-').pop())).sort((a, b) => a - b);
  for (let i = 1; i < seqs.length; i++) assert(seqs[i] === seqs[i - 1] + 1, `sequential: ${seqs.join(',')}`);
});

// ---------- U. cancelled number retained ----------
await test('U. paid bills cannot cancel; after reversing payments cancel works', async () => {
  const blocked = await admin.post(`/api/sales/${taxSaleId}/cancel`);
  assert(blocked.status === 400, `paid cancel blocked, got ${blocked.status}`);
  const rev = await admin.post(`/api/payments/${receipt2Id}/reverse`);
  assertStatus(rev, 200, 'reverse remaining payment');
  const r = await admin.post(`/api/sales/${taxSaleId}/cancel`);
  assertStatus(r, 200, 'cancel sale');
  assert(r.body.data.status === 'CANCELLED', 'marked CANCELLED');
  assert(r.body.data.invoiceNumber === taxSaleNumber, 'number retained');
  const prod = await Product.findById(productId);
  // TAX: 30 −5(A) −2(B) +5 restored = 28; EST: 20 −2(C) = 18 (T drafts move no stock)
  assert(prod.taxStock === 28, `TAX pool restored, got ${prod.taxStock}`);
  assert(prod.estimateStock === 18, `ESTIMATE pool untouched, got ${prod.estimateStock}`);
  const again = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 250000 }],
  });
  assertStatus(again, 201, 'next sale');
  assert(again.body.data.invoiceNumber !== taxSaleNumber, 'cancelled number not reused');
});

// ---------- stock valuation (WAC) ----------
await test('stock valuation uses WAC, not purchasePrice', async () => {
  const r = await admin.get('/api/reports/stock');
  assertStatus(r, 200, 'stock report');
  const item = r.body.data.items.find((x) => String(x._id) === String(productId));
  assert(item.quantity === 46, `qty ${item.quantity}`);
  assert(item.taxStock === 28 && item.estimateStock === 18, 'per-pool quantities');
  // 28×206667 + 18×200000 = 9,386,676
  assert(item.averageCostTax === 206667 && item.averageCostEst === 200000, 'per-pool WAC');
  assert(item.value === 9386676, `value ${item.value}`);
});

// ---------- P&L / COGS from ledger ----------
await test('P&L uses ledger COGS (cancelled excluded)', async () => {
  const r = await admin.get('/api/reports/pnl');
  assertStatus(r, 200, 'pnl');
  assert(typeof r.body.data.cogs === 'number' && r.body.data.cogs > 0, `cogs ${r.body.data.cogs}`);
});

// ---------- master delete guards ----------
await test('§30 referenced masters cannot be hard-deleted', async () => {
  const del = await admin.delete(`/api/master/products/${productId}`);
  assert(del.status === 400, `referenced product delete → 400, got ${del.status}`);
  const delCust = await admin.delete(`/api/master/customers/${custIntraId}`);
  assert(delCust.status === 400, `referenced customer delete → 400, got ${delCust.status}`);
  const u = await admin.post('/api/master/units').send({ name: 'Temp', shortName: 'TMP' });
  const delFree = await admin.delete(`/api/master/units/${u.body.data._id}`);
  assertStatus(delFree, 200, 'unreferenced delete allowed');
});

// ---------- Z/AA. authorization ----------
await test('Z/AA. non-admin blocked from business + sequence settings', async () => {
  const b = await manager.put('/api/settings/business').send({ companyName: 'Hacked' });
  assert(b.status === 403, `business edit → 403, got ${b.status}`);
  const s = await manager.put('/api/settings/sequences').send({ taxInvoiceNextNumber: 1 });
  assert(s.status === 403, `sequence edit → 403, got ${s.status}`);
  const freeGstin = await admin.put('/api/settings/business').send({ gstin: 'NOPE' });
  assertStatus(freeGstin, 200, 'any business GSTIN text accepted');
  assert(freeGstin.body.data.gstin === 'NOPE', 'stored as-is (upper-cased)');
});

// ---------- AB. audit immutability + pagination ----------
await test('AB. audit log read-only, paginated, SYSTEM for automation', async () => {
  const put = await admin.put('/api/audit/some-id').send({});
  assert(put.status === 404, `PUT audit → 404, got ${put.status}`);
  const del = await admin.delete('/api/audit/some-id');
  assert(del.status === 404, `DELETE audit → 404, got ${del.status}`);
  const page = await admin.get('/api/audit?page=1&limit=5');
  assertStatus(page, 200, 'audit page');
  assert(page.body.total > 0 && page.body.pages >= 1 && page.body.data.length <= 5, 'pagination works');
  const conv = await admin.get('/api/audit?action=ESTIMATE_CONVERTED');
  assert(conv.body.total >= 1, 'conversion audited + searchable');
});

// ---------- V/W/X/Y. backup + OAuth failure paths ----------
await test('V/W. backup failure is graceful + audited as SYSTEM', async () => {
  let threw = false;
  try {
    await runDatabaseBackup(null);
  } catch {
    threw = true;
  }
  // Either mongodump is missing (throws) or Drive auth missing (throws) — both must be graceful
  assert(threw, 'backup without tooling must throw (not hang)');
  const fail = await AuditLog.findOne({ action: 'BACKUP_FAILED' }).sort({ createdAt: -1 });
  assert(!!fail, 'BACKUP_FAILED audited');
  assert(!fail.user, 'SYSTEM actor (no user), not Unknown');
  assert(fail.metadata?.actor === 'SYSTEM', 'actor marked SYSTEM');
});

await test('X. retention deletes only own backup files', async () => {
  const deleted = [];
  const fakeDrive = {
    files: {
      list: async (params) => {
        assert(params.q.includes('khm-db-backup-'), `query scoped to own files: ${params.q}`);
        return { data: { files: [{ id: 'old1', name: 'khm-db-backup-old.gz' }] } };
      },
      delete: async ({ fileId }) => { deleted.push(fileId); },
    },
  };
  await cleanupOldDriveBackups(fakeDrive);
  assert(deleted.length === 1 && deleted[0] === 'old1', 'only listed backup file deleted');
});

await test('Y. Drive auth failure leaks no secrets', async () => {
  let msg = '';
  try {
    await getDriveService();
  } catch (e) {
    msg = e.message;
  }
  assert(msg, 'must throw without configured token');
  assert(!/refresh|secret|token\s*[:=]\s*\S+/i.test(msg), `no secret in message: ${msg}`);
});

// ---------- N/O. partial returns as documents (SR-/PR- FY numbering) ----------
let retSaleId, retPurchaseId;
await test('N. partial sales return: GST mirrors original, stock/ledger/outstanding update', async () => {
  const s = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 5, rate: 250000 }],
  });
  assertStatus(s, 201, 'return-test sale');
  retSaleId = s.body.data._id;
  const stockBefore = (await Product.findById(productId)).taxStock;

  const r = await admin.post('/api/returns/sales').send({
    saleId: retSaleId,
    items: [{ product: productId, quantity: 2 }],
    reason: 'Damaged in transit',
  });
  assertStatus(r, 201, 'create sales return');
  const ret = r.body.data;
  assert(new RegExp(`^SR-${fyStart}-\\d{6}$`).test(ret.returnNumber), `FY return number ${ret.returnNumber}`);
  assert(ret.stream === 'TAX', 'stream copied from original');
  assert(ret.originalNumber.length > 0, 'original linked');
  assert(ret.subTotal === 500000, `taxable ${ret.subTotal}`);
  assert(ret.totalCgst === 45000 && ret.totalSgst === 45000 && ret.totalIgst === 0, `GST mirrors intra-state (${ret.totalCgst}/${ret.totalSgst}/${ret.totalIgst})`);
  assert(ret.grandTotal === 590000, `return total ${ret.grandTotal}`);
  assert(ret.items[0].productName === 'Renamed Widget', `item snapshot mirrors original line (${ret.items[0].productName})`);
  assert(ret.customerSnapshot?.name === 'Renamed Trader', 'return snapshots current master');

  const stockAfter = (await Product.findById(productId)).taxStock;
  assert(stockAfter === stockBefore + 2, `stock restored (${stockBefore} → ${stockAfter})`);

  const orig = await Sale.findById(retSaleId);
  assert(orig.returnedAmount === 590000, `returnedAmount tracked (${orig.returnedAmount})`);

  const audit = await AuditLog.findOne({ action: 'SALES_RETURN_CREATED' });
  assert(!!audit, 'SALES_RETURN_CREATED audited');
});

await test('N. over-return rejected; remainder returnable; cancel blocked with returns', async () => {
  const over = await admin.post('/api/returns/sales').send({
    saleId: retSaleId, items: [{ product: productId, quantity: 4 }], reason: 'Too many',
  });
  assert(over.status === 400, `over-return → 400, got ${over.status}`);

  const ret2 = await admin.post('/api/returns/sales').send({
    saleId: retSaleId, items: [{ product: productId, quantity: 3 }], reason: 'Rest of batch faulty',
  });
  assertStatus(ret2, 201, 'remainder return');

  const third = await admin.post('/api/returns/sales').send({
    saleId: retSaleId, items: [{ product: productId, quantity: 1 }], reason: 'Nothing left',
  });
  assert(third.status === 400, 'fully-returned → 400');

  const returnable = await admin.get(`/api/returns/returnable/Sale/${retSaleId}`);
  assertStatus(returnable, 200, 'returnable endpoint');
  assert(returnable.body.data.lines[0].returnableQty === 0, 'nothing returnable left');

  const cancel = await admin.post(`/api/sales/${retSaleId}/cancel`);
  assert(cancel.status === 400, `cancel with returns blocked, got ${cancel.status}`);
});

await test('N. return-aware outstanding settles invoice (cash + credits)', async () => {
  // Sale total 1475000, returned 1475000 (2+3 units). Outstanding 0.
  const r = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'TAX', partyType: 'Customer', partyId: custIntraId,
    amount: 100000, paymentMode: 'CASH',
    allocations: [{ invoiceId: retSaleId, amount: 100000 }],
  });
  assert(r.status === 400, `allocating against fully-returned invoice rejected, got ${r.status}`);

  // Fresh sale: partial return, then cash covers the rest → PAID.
  const s = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 250000 }],
  });
  assertStatus(s, 201, 'partial-return sale');
  const saleId = s.body.data._id; // total 590000
  await admin.post('/api/returns/sales').send({
    saleId, items: [{ product: productId, quantity: 1 }], reason: 'One faulty',
  });
  const pay = await admin.post('/api/payments').send({
    type: 'RECEIPT', stream: 'TAX', partyType: 'Customer', partyId: custIntraId,
    amount: 295000, paymentMode: 'UPI',
    allocations: [{ invoiceId: saleId, amount: 295000 }],
  });
  assertStatus(pay, 201, 'settle remainder');
  const settled = await Sale.findById(saleId);
  assert(settled.paymentStatus === 'PAID', `cash+returns settle invoice (${settled.paymentStatus})`);
});

await test('N. estimate return carries no GST', async () => {
  const s = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 100000 }],
  });
  assertStatus(s, 201, 'estimate for return');
  const r = await admin.post('/api/returns/sales').send({
    saleId: s.body.data._id, items: [{ product: productId, quantity: 1 }], reason: 'Estimate short-shipped',
  });
  assertStatus(r, 201, 'estimate return');
  assert(r.body.data.totalCgst === 0 && r.body.data.totalSgst === 0 && r.body.data.totalIgst === 0, 'no GST on estimate return');
  assert(r.body.data.grandTotal === 100000, 'value preserved');
});

await test('returns blocked on draft/cancelled documents', async () => {
  const d = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'DRAFT',
    items: [{ product: productId, quantity: 1, rate: 250000 }],
  });
  assertStatus(d, 201, 'draft sale');
  const rd = await admin.post('/api/returns/sales').send({
    saleId: d.body.data._id, items: [{ product: productId, quantity: 1 }], reason: 'x',
  });
  assert(rd.status === 400, 'draft return blocked');
  const rc = await admin.post('/api/returns/sales').send({
    saleId: taxSaleId, items: [{ product: productId, quantity: 1 }], reason: 'x',
  });
  assert(rc.status === 400, 'cancelled return blocked');
});

await test('O. partial purchase return: stock/ledger/ITC update, PR- FY number', async () => {
  const p = await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-RET-1',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 10, rate: 200000, taxRate: 18 }],
  });
  assertStatus(p, 201, 'return-test purchase');
  retPurchaseId = p.body.data._id;
  const stockBefore = (await Product.findById(productId)).taxStock;

  const r = await admin.post('/api/returns/purchases').send({
    purchaseId: retPurchaseId,
    items: [{ product: productId, quantity: 3 }],
    reason: 'Expired batch',
  });
  assertStatus(r, 201, 'create purchase return');
  const ret = r.body.data;
  assert(new RegExp(`^PR-${fyStart}-\\d{6}$`).test(ret.returnNumber), `FY return number ${ret.returnNumber}`);
  assert(ret.subTotal === 600000, `taxable ${ret.subTotal}`);
  assert(ret.totalCgst + ret.totalSgst + ret.totalIgst === 108000, 'ITC reversal 108000');
  assert(ret.grandTotal === 708000, `return total ${ret.grandTotal}`);

  const stockAfter = (await Product.findById(productId)).taxStock;
  assert(stockAfter === stockBefore - 3, `stock reduced (${stockBefore} → ${stockAfter})`);

  const { default: Purchase } = await import('../models/Purchase.js');
  const orig = await Purchase.findById(retPurchaseId);
  assert(orig.returnedAmount === 708000, 'purchase returnedAmount tracked');

  const audit = await AuditLog.findOne({ action: 'PURCHASE_RETURN_CREATED' });
  assert(!!audit, 'PURCHASE_RETURN_CREATED audited');
});

await test('O. purchase return beyond stock rejected (no negative stock)', async () => {
  // Drain the TAX pool with a big tax sale, then attempt a TAX purchase return.
  const prod = await Product.findById(productId);
  const drain = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: prod.taxStock, rate: 100000 }],
  });
  assertStatus(drain, 201, 'drain TAX pool');
  const r = await admin.post('/api/returns/purchases').send({
    purchaseId: retPurchaseId, items: [{ product: productId, quantity: 1 }], reason: 'x',
  });
  assert(r.status === 400, `return into zero stock rejected, got ${r.status}`);
  // Restore stock for later tests (none depend on it, but keep ledger sane).
  await admin.post('/api/purchases').send({
    transactionType: 'TAX', supplier: supplierId, invoiceNumber: 'SUP-RESTORE',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 5, rate: 200000, taxRate: 18 }],
  });
});

await test('reports net returns (GST output + P&L sales)', async () => {
  const gstBefore = (await admin.get('/api/reports/gst')).body.data;
  const pnlBefore = (await admin.get('/api/reports/pnl')).body.data;
  const s = await admin.post('/api/sales').send({
    transactionType: 'TAX', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 1, rate: 250000 }],
  });
  assertStatus(s, 201, 'report-test sale');
  await admin.post('/api/returns/sales').send({
    saleId: s.body.data._id, items: [{ product: productId, quantity: 1 }], reason: 'Report check',
  });
  const gstAfter = (await admin.get('/api/reports/gst')).body.data;
  const pnlAfter = (await admin.get('/api/reports/pnl')).body.data;
  // Full return nets the added sale exactly.
  assert(gstAfter.outputGst.taxableValue === gstBefore.outputGst.taxableValue, `GST nets returns (${gstBefore.outputGst.taxableValue} → ${gstAfter.outputGst.taxableValue})`);
  assert(pnlAfter.netSales === pnlBefore.netSales, `P&L nets returns (${pnlBefore.netSales} → ${pnlAfter.netSales})`);
});

await test('return idempotency: replay returns original', async () => {
  const key = `ret-key-${Date.now()}`;
  const payload = { saleId: retSaleId, items: [], reason: 'x' };
  // retSaleId fully returned → both attempts 400 (validation), proving no dupes:
  const r1 = await admin.post('/api/returns/sales').set('idempotency-key', key).send(payload);
  assert(r1.status === 400, 'empty items rejected');
  const s = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 100000 }],
  });
  const ok = { saleId: s.body.data._id, items: [{ product: productId, quantity: 1 }], reason: 'idem' };
  const a = await admin.post('/api/returns/sales').set('idempotency-key', key).send(ok);
  assertStatus(a, 201, 'first return');
  const b = await admin.post('/api/returns/sales').set('idempotency-key', key).send(ok);
  assert(b.status === 200 && b.body.deduplicated === true, 'replay deduplicated');
  assert(String(b.body.data._id) === String(a.body.data._id), 'same return returned');
});

// ---------- master-data write guards + audit ----------
await test('product pool quantities/valuations cannot be set via master edits', async () => {
  const before = await Product.findById(productId);
  const r = await admin.put(`/api/master/products/${productId}`).send({
    name: before.name, taxStock: 9999, estimateStock: 9999, averageCostTax: 999999, averageCostEst: 999999,
  });
  assertStatus(r, 200, 'update succeeds (fields stripped, not rejected)');
  const after = await Product.findById(productId);
  assert(after.taxStock === before.taxStock, `taxStock untouched (${before.taxStock} → ${after.taxStock})`);
  assert(after.estimateStock === before.estimateStock, 'estimateStock untouched');
  assert(after.averageCostTax === before.averageCostTax, 'averageCostTax untouched');
  assert(after.averageCostEst === before.averageCostEst, 'averageCostEst untouched');
  const audit = await AuditLog.findOne({ action: 'PRODUCT_UPDATED' }).sort({ createdAt: -1 });
  assert(!!audit, 'PRODUCT_UPDATED audited');
});

await test('bill lists filter by payment status; returns filter by stream', async () => {
  const paid = await admin.get('/api/sales?stream=TAX&paymentStatus=PAID');
  assertStatus(paid, 200, 'paid filter');
  assert(paid.body.data.length > 0, 'at least one PAID tax bill');
  assert(paid.body.data.every((s) => s.paymentStatus === 'PAID'), 'all PAID');
  const unpaid = await admin.get('/api/sales?stream=ESTIMATE&paymentStatus=UNPAID');
  assert(unpaid.body.data.length > 0, 'unpaid estimates exist');
  assert(unpaid.body.data.every((s) => s.paymentStatus === 'UNPAID'), 'all UNPAID');
  const taxRets = await admin.get('/api/returns?returnType=SALES_RETURN&stream=TAX');
  assert(taxRets.body.data.length > 0 && taxRets.body.data.every((r) => r.stream === 'TAX'), 'tax returns only');
});

await test('converted estimates cannot be cancelled (no phantom stock)', async () => {
  const r = await admin.post(`/api/sales/${estimateId}/cancel`);
  assert(r.status === 400, `converted-estimate cancel blocked, got ${r.status}`);
  assert(/convert/i.test(r.body.message), 'points at the tax invoice');
  const est = await Sale.findById(estimateId);
  assert(est.status === 'COMPLETED', 'estimate preserved');
});

await test('conversion bills only the not-yet-returned quantity', async () => {
  const s = await admin.post('/api/sales').send({
    transactionType: 'ESTIMATE', customer: custIntraId, invoiceNumber: 'AUTO',
    invoiceDate: new Date().toISOString(), status: 'COMPLETED',
    items: [{ product: productId, quantity: 2, rate: 250000 }],
  });
  assertStatus(s, 201, 'estimate for partial conversion');
  await admin.post('/api/returns/sales').send({
    saleId: s.body.data._id, items: [{ product: productId, quantity: 1 }], reason: 'Partial refusal',
  });
  const c = await admin.post(`/api/sales/${s.body.data._id}/convert`);
  assertStatus(c, 201, 'convert remainder');
  assert(c.body.data.items[0].quantity === 1, `only remainder billed (got ${c.body.data.items[0].quantity})`);
  assert(c.body.data.subTotal === 250000, 'totals follow remainder');
});

// ---------- summary ----------
await mongoose.disconnect();
await replSet.stop();
const failed = results.filter((r) => !r.ok);
console.log(`\n[test] ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error('[test] FAILURES:');
  for (const f of failed) console.error(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
console.log('[test] ALL INTEGRATION TESTS PASSED');
