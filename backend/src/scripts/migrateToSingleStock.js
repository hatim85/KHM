/**
 * One-time migration: dual taxStock/estimateStock -> single physical `stock` + WAC `averageCost`.
 *
 *   stock       = (taxStock || 0) + (estimateStock || 0)
 *   averageCost = purchasePrice || 0   (no movement-cost history exists pre-migration)
 *
 * Legacy taxStock/estimateStock fields are $unset. Historical StockMovement rows
 * are left immutable (unitCost/stockAfter stay null for them).
 * Snapshots missing on old Sale/Purchase/Payment docs are backfilled from
 * current master data where the referenced master still exists.
 *
 * Usage:  node src/scripts/migrateToSingleStock.js
 * Requires MONGODB_URI in environment / .env
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // ---- 1. Products: unify stock, seed WAC ----
  const products = await db.collection('products').find({}).toArray();
  let migratedProducts = 0;
  for (const p of products) {
    if (typeof p.stock === 'number' && typeof p.averageCost === 'number' && p.taxStock === undefined) continue;
    const unified = (p.stock ?? (p.taxStock || 0) + (p.estimateStock || 0));
    if (unified < 0) {
      console.warn(`[migrate] WARNING: product "${p.name}" (${p.sku || 'no-sku'}) has negative unified stock ${unified} (tax=${p.taxStock || 0}, est=${p.estimateStock || 0}). Carried as-is — verify with a physical count and correct via an audited stock adjustment.`);
    }
    await db.collection('products').updateOne(
      { _id: p._id },
      {
        $set: { stock: unified, averageCost: p.averageCost ?? p.purchasePrice ?? 0 },
        $unset: { taxStock: '', estimateStock: '' },
      }
    );
    migratedProducts += 1;
  }
  console.log(`[migrate] products unified: ${migratedProducts}/${products.length}`);

  // ---- 2. Backfill snapshots on old documents (only where missing) ----
  const customerMap = new Map((await db.collection('customers').find({}).toArray()).map((c) => [String(c._id), c]));
  const supplierMap = new Map((await db.collection('suppliers').find({}).toArray()).map((s) => [String(s._id), s]));
  const productMap = new Map((await db.collection('products').find({}).toArray()).map((p) => [String(p._id), p]));
  const settings = await db.collection('companiesettings').findOne({ isSingleton: true });

  const snapProduct = (line) => {
    const p = line.product ? productMap.get(String(line.product)) : null;
    return {
      ...(line.productName ? {} : { productName: p?.name || '' }),
      ...(line.sku ? {} : { sku: p?.sku || '' }),
      ...(line.hsnCode ? {} : { hsnCode: p?.hsnCode || '' }),
    };
  };

  let salesFixed = 0;
  for (const s of await db.collection('sales').find({}).toArray()) {
    const set = {};
    if (!s.customerSnapshot && s.customer) {
      const c = customerMap.get(String(s.customer));
      if (c) set.customerSnapshot = { name: c.name || '', gstin: c.gstin || '', address: c.address || '', phone: c.phone || '', stateCode: c.stateCode || '' };
    }
    if (!s.companySnapshot && settings) {
      set.companySnapshot = { companyName: settings.companyName || '', address: settings.address || '', gstin: settings.gstin || '', stateCode: settings.stateCode || '', phone: settings.phone || '', email: settings.email || '' };
    }
    if (Array.isArray(s.items) && s.items.some((l) => !l.productName)) {
      set.items = s.items.map((l) => ({ ...l, ...snapProduct(l) }));
    }
    if (Object.keys(set).length > 0) {
      await db.collection('sales').updateOne({ _id: s._id }, { $set: set });
      salesFixed += 1;
    }
  }
  console.log(`[migrate] sales snapshot-backfilled: ${salesFixed}`);

  let purchasesFixed = 0;
  for (const p of await db.collection('purchases').find({}).toArray()) {
    const set = {};
    if (!p.supplierSnapshot && p.supplier) {
      const s = supplierMap.get(String(p.supplier));
      if (s) set.supplierSnapshot = { name: s.name || '', gstin: s.gstin || '', address: s.address || '', phone: s.phone || '', stateCode: s.stateCode || '' };
    }
    if (Array.isArray(p.items) && p.items.some((l) => !l.productName)) {
      set.items = p.items.map((l) => ({ ...l, ...snapProduct(l) }));
    }
    if (Object.keys(set).length > 0) {
      await db.collection('purchases').updateOne({ _id: p._id }, { $set: set });
      purchasesFixed += 1;
    }
  }
  console.log(`[migrate] purchases snapshot-backfilled: ${purchasesFixed}`);

  let paymentsFixed = 0;
  for (const pay of await db.collection('payments').find({}).toArray()) {
    if (!pay.partySnapshot && pay.partyId) {
      const party = pay.partyType === 'Customer' ? customerMap.get(String(pay.partyId)) : supplierMap.get(String(pay.partyId));
      if (party) {
        await db.collection('payments').updateOne({ _id: pay._id }, { $set: { partySnapshot: { name: party.name || '' } } });
        paymentsFixed += 1;
      }
    }
  }
  console.log(`[migrate] payments snapshot-backfilled: ${paymentsFixed}`);

  await mongoose.disconnect();
  console.log('[migrate] done');
};

run().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
