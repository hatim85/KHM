import express from 'express';
const router = express.Router();
import crudFactory from '../utils/crudFactory.js';
import { protect  } from '../middlewares/authMiddleware.js';
import { getCustomerLedger, getSupplierLedger } from '../controllers/ledgerController.js';

import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Unit from '../models/Unit.js';
import Product from '../models/Product.js';

// Initialize controllers using the factory
const customerController = crudFactory(Customer, 'Customer');
const supplierController = crudFactory(Supplier, 'Supplier');
const categoryController = crudFactory(Category, 'Category');
const brandController = crudFactory(Brand, 'Brand');
const unitController = crudFactory(Unit, 'Unit');
const productController = crudFactory(Product, 'Product', ['category', 'brand', 'unit']);

const createRoutes = (controller) => {
  const r = express.Router();
  r.route('/')
    .get(controller.getAll)
    .post(controller.create);
  r.route('/:id')
    .get(controller.getOne)
    .put(controller.update)
    .delete(controller.remove);
  return r;
};

// Protect all master data routes
router.use(protect);

const customerRouter = createRoutes(customerController);
customerRouter.get('/:customerId/ledger', getCustomerLedger);
router.use('/customers', customerRouter);

const supplierRouter = createRoutes(supplierController);
supplierRouter.get('/:supplierId/ledger', getSupplierLedger);
router.use('/suppliers', supplierRouter);
router.use('/categories', createRoutes(categoryController));
router.use('/brands', createRoutes(brandController));
router.use('/units', createRoutes(unitController));
router.use('/products', createRoutes(productController));

export default router;
