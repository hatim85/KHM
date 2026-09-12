import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import { logAudit } from '../utils/auditLogger.js';
import { applyStockAdjustment } from '../services/inventoryService.js';

/**
 * Get all stock movements (Ledger View)
 * Query params: stream (TAX/ESTIMATE), product (ObjectId), type (IN/OUT/ADJUSTMENT)
 */
export const getStockMovements = async (req, res, next) => {
  try {
    const { stream, product, type, page = 1, limit = 15, startDate, endDate } = req.query;
    
    let match = {};
    if (stream) match.stream = stream;
    if (type) match.type = type;
    if (product) match.product = new mongoose.Types.ObjectId(product);
    
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const skip = (parsedPage - 1) * parsedLimit;

    const [movements, total] = await Promise.all([
      StockMovement.find(match)
        .populate('product', 'name sku')
        .populate('buyer', 'name phone')
        .populate('supplier', 'name phone')
        .populate({
          path: 'referenceDocument',
          select: 'invoiceNumber billNumber returnNumber customer supplier',
          populate: [
            { path: 'customer', select: 'name phone', strictPopulate: false },
            { path: 'supplier', select: 'name phone', strictPopulate: false }
          ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      StockMovement.countDocuments(match)
    ]);

    res.json({
      success: true,
      data: movements,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get low stock alerts
 * A product is low stock if combined physical stock (taxStock + estimateStock) < reorderLevel
 */
export const getLowStock = async (req, res, next) => {
  try {
    const lowStockProducts = await Product.aggregate([
      {
        $addFields: {
          totalStock: { $add: [{ $ifNull: ['$taxStock', 0] }, { $ifNull: ['$estimateStock', 0] }] }
        }
      },
      {
        $match: {
          $expr: { $lt: ['$totalStock', '$reorderLevel'] },
          isActive: true
        }
      },
      {
        $lookup: {
          from: "units",
          localField: "unit",
          foreignField: "_id",
          as: "unitData"
        }
      },
      {
        $unwind: {
          path: "$unitData",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          name: 1,
          sku: 1,
          taxStock: 1,
          estimateStock: 1,
          totalStock: 1,
          reorderLevel: 1,
          unitName: "$unitData.shortName"
        }
      }
    ]);

    res.json({ success: true, count: lowStockProducts.length, data: lowStockProducts });
  } catch (error) {
    next(error);
  }
};

/**
 * Adjust Stock Manually
 * Requires atomic transaction to insert StockMovement and update Product.
 */
export const adjustStock = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { product, stream, quantity, reason } = req.body;
    
    if (!product || !stream || quantity === undefined || quantity === null || !reason) {
      throw new ApiError(400, 'Product, stream, quantity, and reason are required');
    }

    if (!['TAX', 'ESTIMATE'].includes(stream)) {
      throw new ApiError(400, 'Stream must be TAX or ESTIMATE (movement classification).');
    }

    const parsedQty = Number(quantity);
    if (!parsedQty) {
      throw new ApiError(400, 'Adjustment quantity cannot be zero');
    }

    const productDoc = await Product.findById(product).session(session);
    if (!productDoc) {
      throw new ApiError(404, 'Product not found');
    }

    // Single physical stock adjustment — audited, never drives stock negative.
    const updatedProduct = await applyStockAdjustment({
      productId: product,
      delta: parsedQty,
      stream,
      referenceDocument: productDoc._id,
      referenceModel: 'ManualAdjustment',
      remarks: reason,
    }, session);

    await session.commitTransaction();
    session.endSession();

    logAudit({
      action: 'STOCK_ADJUSTED',
      entity: 'Product',
      entityId: productDoc._id,
      userId: req.user._id,
      summary: `Stock adjusted for ${productDoc.name}: ${parsedQty > 0 ? '+' : ''}${parsedQty} (${stream}) — ${reason}`,
      metadata: { product: productDoc.name, delta: parsedQty, stream, reason, stockAfter: updatedProduct.stock },
      ipAddress: req.ip,
    });

    res.status(200).json({ success: true, message: 'Stock adjusted successfully', data: updatedProduct });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
