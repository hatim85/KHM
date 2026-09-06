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
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import StockMovement from '../models/StockMovement.js';
import CustomerLedger from '../models/CustomerLedger.js';
import SupplierLedger from '../models/SupplierLedger.js';
import Payment from '../models/Payment.js';
import ApiError from '../utils/ApiError.js';

// Initialize controllers using the factory.
// Product pool quantities and valuations are system-maintained (inventory
// transactions only) and can never be set through master edits.
const customerController = crudFactory(Customer, 'Customer', [], { auditEntity: 'Customer' });
const supplierController = crudFactory(Supplier, 'Supplier', [], { auditEntity: 'Supplier' });
const categoryController = crudFactory(Category, 'Category', [], { auditEntity: 'Category' });
const brandController = crudFactory(Brand, 'Brand', [], { auditEntity: 'Brand' });
const unitController = crudFactory(Unit, 'Unit', [], { auditEntity: 'Unit' });
const productController = crudFactory(Product, 'Product', ['category', 'brand', 'unit', 'secondaryUnit'], {
  guardedFields: ['taxStock', 'estimateStock', 'averageCostTax', 'averageCostEst'],
  auditEntity: 'Product',
});

const createRoutes = (controller, referenceChecks = []) => {
  const r = express.Router();
  r.route('/')
    .get(controller.getAll)
    .post(controller.create);
  r.route('/:id')
    .get(controller.getOne)
    .put(controller.update)
    .delete(blockReferencedDelete(referenceChecks), controller.remove);
  return r;
};

/**
 * Historical integrity guard (§30): masters referenced by transactions,
 * ledger entries, or other masters must NOT be hard-deleted.
 * Responds 400 guiding the user to archive (isActive=false) instead.
 */
function blockReferencedDelete(checks) {
  return async (req, res, next) => {
    try {
      const id = req.params.id;
      for (const { model, field, label, match = {} } of checks) {
        const count = await model.countDocuments({ [field]: id, ...match });
        if (count > 0) {
          return next(new ApiError(
            400,
            `Cannot delete: referenced by ${count} ${label} record(s). Archive (deactivate) instead to preserve history.`
          ));
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Protect all master data routes
router.use(protect);

const customerRouter = createRoutes(customerController, [
  { model: Sale, field: 'customer', label: 'sale' },
  { model: CustomerLedger, field: 'customer', label: 'customer ledger' },
  { model: Payment, field: 'partyId', label: 'payment', match: { partyType: 'Customer' } },
]);
customerRouter.get('/:customerId/ledger', getCustomerLedger);
router.use('/customers', customerRouter);

const supplierRouter = createRoutes(supplierController, [
  { model: Purchase, field: 'supplier', label: 'purchase' },
  { model: SupplierLedger, field: 'supplier', label: 'supplier ledger' },
  { model: Payment, field: 'partyId', label: 'payment', match: { partyType: 'Supplier' } },
]);
supplierRouter.get('/:supplierId/ledger', getSupplierLedger);
router.use('/suppliers', supplierRouter);
router.use('/categories', createRoutes(categoryController, [
  { model: Product, field: 'category', label: 'product' },
]));
router.use('/brands', createRoutes(brandController, [
  { model: Product, field: 'brand', label: 'product' },
]));
router.use('/units', createRoutes(unitController, [
  { model: Product, field: 'unit', label: 'product' },
]));
router.use('/products', createRoutes(productController, [
  { model: Sale, field: 'items.product', label: 'sale' },
  { model: Purchase, field: 'items.product', label: 'purchase' },
  { model: StockMovement, field: 'product', label: 'stock movement' },
]));

export default router;
