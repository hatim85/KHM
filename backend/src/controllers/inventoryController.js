import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';

/**
 * Get all stock movements (Ledger View)
 * Query params: stream (TAX/ESTIMATE), product (ObjectId), type (IN/OUT/ADJUSTMENT)
 */
export const getStockMovements = async (req, res, next) => {
  try {
    const { stream, product, type } = req.query;
    let query = StockMovement.find().populate('product', 'name sku').sort({ createdAt: -1 });

    if (stream) query = query.where('stream').equals(stream);
    if (type) query = query.where('type').equals(type);
    if (product) query = query.where('product').equals(product);

    const movements = await query;
    res.json({ success: true, count: movements.length, data: movements });
  } catch (error) {
    next(error);
  }
};

/**
 * Get low stock alerts
 * A product is low stock if (taxStock + estimateStock) < reorderLevel
 */
export const getLowStock = async (req, res, next) => {
  try {
    // MongoDB aggregation to sum taxStock and estimateStock and compare with reorderLevel
    const lowStockProducts = await Product.aggregate([
      {
        $addFields: {
          totalStock: { $add: ["$taxStock", "$estimateStock"] }
        }
      },
      {
        $match: {
          $expr: { $lt: ["$totalStock", "$reorderLevel"] },
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
    
    if (!product || !stream || !quantity || !reason) {
      throw new ApiError(400, 'Product, stream, quantity, and reason are required');
    }

    if (quantity === 0) {
      throw new ApiError(400, 'Adjustment quantity cannot be zero');
    }

    const parsedQty = Number(quantity);

    // 1. Update Cached Stock on Product
    const stockField = stream === 'TAX' ? 'taxStock' : 'estimateStock';
    
    const updatedProduct = await Product.findByIdAndUpdate(
      product,
      { $inc: { [stockField]: parsedQty } },
      { session, new: true }
    );

    if (!updatedProduct) {
      throw new ApiError(404, 'Product not found');
    }

    // 2. Insert Stock Movement
    // Use the product ID itself as reference if there's no actual document
    // OR create a generic InventoryAdjustment reference model
    const stockMove = new StockMovement({
      product,
      stream,
      type: 'ADJUSTMENT',
      quantity: parsedQty,
      referenceDocument: product, 
      referenceModel: 'ManualAdjustment',
      remarks: reason,
    });

    await stockMove.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: 'Stock adjusted successfully', data: updatedProduct });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};
