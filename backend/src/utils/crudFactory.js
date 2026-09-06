import ApiError from './ApiError.js';
import { logAudit } from './auditLogger.js';

/**
 * Factory for basic CRUD operations on a Mongoose Model
 * @param {Model} Model - The Mongoose model
 * @param {String} modelName - Name for error messages
 * @param {Array} populateFields - Fields to populate on GET
 * @param {Object} options - { guardedFields: [fields stripped from writes],
 *                             auditEntity: 'Product' (enables audit logging) }
 */
const crudFactory = (Model, modelName = 'Document', populateFields = [], options = {}) => {
  const { guardedFields = [], auditEntity = null } = options;

  // System-maintained fields (e.g. Product.stock/averageCost) can only change
  // through audited transactions — never through master edits.
  const sanitize = (body = {}) => {
    const copy = { ...body };
    for (const field of guardedFields) delete copy[field];
    return copy;
  };

  const auditWrite = (req, action, doc, verb) => {
    if (!auditEntity || !doc) return;
    logAudit({
      action,
      entity: auditEntity,
      entityId: doc._id,
      userId: req.user?._id,
      summary: `${modelName} ${verb}: ${doc.name || doc._id}`,
      metadata: { name: doc.name },
      ipAddress: req.ip,
    });
  };
  return {
    getAll: async (req, res, next) => {
      try {
        let query = Model.find();
        
        // Handle search by name (generic)
        if (req.query.search) {
          query = query.find({ name: { $regex: req.query.search, $options: 'i' } });
        }

        // Handle active/inactive filter
        if (req.query.isActive !== undefined) {
          query = query.find({ isActive: req.query.isActive === 'true' });
        }

        if (populateFields.length > 0) {
          populateFields.forEach(field => query.populate(field));
        }

        // Sorting
        query.sort({ createdAt: -1 });

        const docs = await query;
        res.json({ success: true, count: docs.length, data: docs });
      } catch (error) {
        next(error);
      }
    },

    getOne: async (req, res, next) => {
      try {
        let query = Model.findById(req.params.id);
        if (populateFields.length > 0) {
          populateFields.forEach(field => query.populate(field));
        }
        
        const doc = await query;
        if (!doc) {
          return next(new ApiError(404, `${modelName} not found`, 'NOT_FOUND'));
        }
        res.json({ success: true, data: doc });
      } catch (error) {
        next(error);
      }
    },

    create: async (req, res, next) => {
      try {
        const doc = await Model.create(sanitize(req.body));
        auditWrite(req, `${auditEntity ? auditEntity.toUpperCase() : modelName.toUpperCase()}_CREATED`, doc, 'created');
        res.status(201).json({ success: true, data: doc });
      } catch (error) {
        next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const doc = await Model.findByIdAndUpdate(req.params.id, sanitize(req.body), {
          returnDocument: 'after',
          runValidators: true,
        });
        if (!doc) {
          return next(new ApiError(404, `${modelName} not found`, 'NOT_FOUND'));
        }
        auditWrite(req, `${auditEntity ? auditEntity.toUpperCase() : modelName.toUpperCase()}_UPDATED`, doc, 'updated');
        res.json({ success: true, data: doc });
      } catch (error) {
        next(error);
      }
    },

    remove: async (req, res, next) => {
      try {
        const doc = await Model.findByIdAndDelete(req.params.id);
        if (!doc) {
          return next(new ApiError(404, `${modelName} not found`, 'NOT_FOUND'));
        }
        res.json({ success: true, data: {} });
      } catch (error) {
        next(error);
      }
    },
  };
};

export default crudFactory;
