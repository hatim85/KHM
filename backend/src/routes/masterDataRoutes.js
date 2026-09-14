import express from 'express';
const router = express.Router();
import mongoose from 'mongoose';
import crudFactory from '../utils/crudFactory.js';
import { protect  } from '../middlewares/authMiddleware.js';
import { getCustomerLedger, getSupplierLedger } from '../controllers/ledgerController.js';
import { logAudit } from '../utils/auditLogger.js';

import Customer from '../models/Customer.js';
import Supplier from '../models/Supplier.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Unit from '../models/Unit.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import Return from '../models/Return.js';
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
 * Product delete (§30, refined): a product that was never purchased or
 * sold CAN be hard-deleted. Deletion is blocked only when real history
 * exists — non-cancelled sale / purchase / return lines — or when stock
 * is non-zero. Manual ADJUSTMENT ledger rows (e.g. opening corrections)
 * are cleaned up in the same transaction since they are meaningless
 * without the product itself.
 */
const deleteProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const id = req.params.id;
    // Cancelled bills are void (reports already exclude them), so only
    // live history blocks deletion. Drafts count: the draft holds a
    // dangling reference otherwise.
    const liveHistory = { status: { $ne: 'CANCELLED' } };
    const [saleCount, purchaseCount, returnCount] = await Promise.all([
      Sale.countDocuments({ 'items.product': id, ...liveHistory }),
      Purchase.countDocuments({ 'items.product': id, ...liveHistory }),
      Return.countDocuments({ 'items.product': id }),
    ]);
    if (saleCount > 0) {
      throw new ApiError(400, `Cannot delete: used in ${saleCount} sale bill(s) (drafts included). Remove it from those bills first, or Edit and deactivate the product instead.`);
    }
    if (purchaseCount > 0) {
      throw new ApiError(400, `Cannot delete: used in ${purchaseCount} purchase bill(s) (drafts included). Remove it from those bills first, or Edit and deactivate the product instead.`);
    }
    if (returnCount > 0) {
      throw new ApiError(400, `Cannot delete: referenced by ${returnCount} return document(s). Edit and deactivate the product instead to preserve history.`);
    }

    const product = await Product.findById(id).session(session);
    if (!product) {
      throw new ApiError(404, 'Product not found', 'NOT_FOUND');
    }
    const stock = (product.taxStock || 0) + (product.estimateStock || 0);
    if (stock !== 0) {
      throw new ApiError(400, `Cannot delete: stock is ${stock}. Adjust stock to zero first, or Edit and deactivate the product instead.`);
    }

    await StockMovement.deleteMany({ product: id }).session(session);
    await Product.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    logAudit({
      action: 'PRODUCT_DELETED',
      entity: 'Product',
      entityId: product._id,
      userId: req.user?._id,
      summary: `Product deleted: ${product.name || product._id}`,
      metadata: { name: product.name },
      ipAddress: req.ip,
    });
    res.json({ success: true, data: {} });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
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
// Products use a dedicated delete handler (see deleteProduct above):
// never-purchased/sold products can be hard-deleted; only real history
// or non-zero stock blocks deletion.
const productRoutes = express.Router();
productRoutes.route('/')
  .get(productController.getAll)
  .post(productController.create);
productRoutes.route('/:id')
  .get(productController.getOne)
  .put(productController.update)
  .delete(deleteProduct);
router.use('/products', productRoutes);

export default router;
