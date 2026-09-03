import ApiError from './ApiError.js';

/**
 * Factory for basic CRUD operations on a Mongoose Model
 * @param {Model} Model - The Mongoose model
 * @param {String} modelName - Name for error messages
 * @param {Array} populateFields - Fields to populate on GET
 */
const crudFactory = (Model, modelName = 'Document', populateFields = []) => {
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
        const doc = await Model.create(req.body);
        res.status(201).json({ success: true, data: doc });
      } catch (error) {
        next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
          new: true,
          runValidators: true,
        });
        if (!doc) {
          return next(new ApiError(404, `${modelName} not found`, 'NOT_FOUND'));
        }
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
