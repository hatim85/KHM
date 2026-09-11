import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret';

import cookieParser from 'cookie-parser';

const { default: authRoutes } = await import('../routes/authRoutes.js');
const { default: salesRoutes } = await import('../routes/salesRoutes.js');
const { default: errorHandler } = await import('../middlewares/errorHandler.js');
const { default: User } = await import('../models/User.js');
const { default: Product } = await import('../models/Product.js');
const { default: Customer } = await import('../models/Customer.js');
const { default: Unit } = await import('../models/Unit.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/sales', salesRoutes);
app.use(errorHandler);

console.log('Starting In-Memory MongoDB for Custom PDF test...');
const repl = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(repl.getUri());

try {
  const adminUser = await User.create({
    name: 'Admin',
    email: 'admin@khm.test',
    password: 'password123',
    role: 'Admin',
  });

  const unit = await Unit.create({ name: 'Pieces', shortName: 'PCS' });

  // 1. Create a 0% GST product (exempt)
  const exemptProduct = await Product.create({
    name: 'Exempt Flour',
    sku: 'FLOUR-001',
    unit: unit._id,
    purchasePrice: 10000,
    sellingPrice: 15000,
    gstRate: 0,
    taxStock: 100,
    estimateStock: 100,
  });

  // 2. Create an 18% GST product (taxable)
  const taxableProduct = await Product.create({
    name: 'Taxable Tool',
    sku: 'TOOL-001',
    unit: unit._id,
    purchasePrice: 20000,
    sellingPrice: 30000,
    gstRate: 18,
    taxStock: 100,
    estimateStock: 100,
  });

  const customer = await Customer.create({
    name: 'Test Customer',
    stateCode: '24',
  });

  // Login admin to get cookie
  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'admin@khm.test',
    password: 'password123',
  });
  const cookie = loginRes.headers['set-cookie'];

  // Test 1: Custom PDF with ONLY 0% GST item (without billType in body)
  const res1 = await request(app)
    .post('/api/sales/custom-pdf')
    .set('Cookie', cookie)
    .send({
      transactionType: 'TAX',
      customer: customer._id,
      invoiceNumber: 'BOS/26-27/001',
      deliveryCharge: 5000,
      items: [{ product: exemptProduct._id, quantity: 2, rate: 15000 }],
    });

  if (res1.status !== 200) {
    throw new Error(`Custom PDF failed: ${res1.status} ${JSON.stringify(res1.body)}`);
  }
  const contentDisp1 = res1.headers['content-disposition'];
  if (!contentDisp1.includes('BillOfSupply_BOS')) {
    throw new Error(`Expected filename to start with BillOfSupply_, got: ${contentDisp1}`);
  }
  console.log('✓ Test 1 Passed: 0% GST items automatically generate Bill of Supply (' + contentDisp1 + ')');

  // Test 2: Custom PDF with 18% GST item
  const res2 = await request(app)
    .post('/api/sales/custom-pdf')
    .set('Cookie', cookie)
    .send({
      transactionType: 'TAX',
      customer: customer._id,
      invoiceNumber: 'INV/26-27/001',
      items: [{ product: taxableProduct._id, quantity: 1, rate: 30000 }],
    });

  if (res2.status !== 200) {
    throw new Error(`Tax Invoice Custom PDF failed: ${res2.status}`);
  }
  const contentDisp2 = res2.headers['content-disposition'];
  if (!contentDisp2.includes('TaxInvoice_INV')) {
    throw new Error(`Expected filename to start with TaxInvoice_, got: ${contentDisp2}`);
  }
  console.log('✓ Test 2 Passed: Taxable items generate Tax Invoice (' + contentDisp2 + ')');

  // Test 3: Mixed items with explicit billType: 'BILL_OF_SUPPLY'
  const res3 = await request(app)
    .post('/api/sales/custom-pdf')
    .set('Cookie', cookie)
    .send({
      transactionType: 'TAX',
      billType: 'BILL_OF_SUPPLY',
      customer: customer._id,
      invoiceNumber: 'BOS/26-27/002',
      items: [
        { product: exemptProduct._id, quantity: 2, rate: 15000 },
        { product: taxableProduct._id, quantity: 1, rate: 30000 },
      ],
    });

  if (res3.status !== 200) {
    throw new Error(`Mixed Custom PDF failed: ${res3.status}`);
  }
  const contentDisp3 = res3.headers['content-disposition'];
  if (!contentDisp3.includes('BillOfSupply_BOS')) {
    throw new Error(`Expected filename to start with BillOfSupply_, got: ${contentDisp3}`);
  }
  console.log('✓ Test 3 Passed: Mixed items with billType: BILL_OF_SUPPLY generates Bill of Supply (' + contentDisp3 + ')');

  console.log('\n=============================================');
  console.log('ALL CUSTOM PDF BILL OF SUPPLY TESTS PASSED!');
  console.log('=============================================\n');
} finally {
  await mongoose.disconnect();
  await repl.stop();
  process.exit(0);
}
