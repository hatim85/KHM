/**
 * Migration: single `stock`/`averageCost` (or legacy dual fields) ->
 * separate TAX / ESTIMATE pools (`taxStock`, `estimateStock`,
 * `averageCostTax`, `averageCostEst`).
 *
 * Pool quantities are reconstructed from the StockMovement ledger
 * (authoritative history): every movement carries its stream.
 * Per-pool WAC is replayed from IN movements with known unit costs.
 *
 * If the replayed total disagrees with the stored unified quantity
 * (legacy direct writes), the product is flagged and its whole unified
 * stock goes to the TAX pool for manual correction.
 * Missing snapshots on old Sale/Purchase/Payment docs are backfilled
 * from current master data where the referenced master still exists.
 *
 * Usage:  node src/scripts/migrateToSplitStock.js
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

  // ---- 1. Products: reconstruct pools from the movement ledger ----
  const products = await db.collection('products').find({}).toArray();
  const movements = await db.collection('stockmovements').find({}).sort({ createdAt: 1 }).toArray();
  const byProduct = new Map();
  for (const m of movements) {
    const key = String(m.product);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(m);
  }

  let migrated = 0;
  let flagged = 0;
  for (const p of products) {
    if (typeof p.taxStock === 'number' && typeof p.estimateStock === 'number' && p.stock === undefined) continue;
    const unified = (p.stock ?? (p.taxStock || 0) + (p.estimateStock || 0));

    // Replay ledger per stream.
    const pools = {
      TAX: { qty: 0, avg: 0 },
      ESTIMATE: { qty: 0, avg: 0 },
    };
    for (const m of byProduct.get(String(p._id)) || []) {
      const pool = pools[m.stream] || pools.TAX;
      const q = Number(m.quantity) || 0;
      if (m.type === 'OUT') {
        pool.qty += q; // OUT quantities are stored negative
      } else {
        const cost = m.unitCost != null ? Number(m.unitCost) || 0 : pool.avg;
        const newQty = pool.qty + q;
        if (q > 0 && cost > 0 && newQty > 0) {
          pool.avg = Math.round((pool.avg * pool.qty + cost * q) / newQty);
        }
        pool.qty = newQty;
      }
    }

    let taxStock = pools.TAX.qty;
    let estimateStock = pools.ESTIMATE.qty;
    let averageCostTax = pools.TAX.avg;
    let averageCostEst = pools.ESTIMATE.avg;

    if (taxStock + estimateStock !== unified) {
      flagged += 1;
      console.warn(`[migrate] WARNING: "${p.name}" ledger replay (${taxStock}+${estimateStock}) disagrees with stored ${unified}. Whole quantity assigned to TAX pool — verify with a physical count.`);
      taxStock = unified;
      estimateStock = 0;
      averageCostTax = p.averageCost ?? p.purchasePrice ?? 0;
      averageCostEst = 0;
    }
    if (taxStock < 0 || estimateStock < 0) {
      flagged += 1;
      console.warn(`[migrate] WARNING: "${p.name}" reconstructed negative pool (tax=${taxStock}, est=${estimateStock}). Verify with a physical count and correct via an audited adjustment.`);
    }

    await db.collection('products').updateOne(
      { _id: p._id },
      {
        $set: { taxStock, estimateStock, averageCostTax, averageCostEst },
        $unset: { stock: '', averageCost: '' },
      }
    );
    migrated += 1;
  }
  console.log(`[migrate] products split: ${migrated}/${products.length}, flagged: ${flagged}`);

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
