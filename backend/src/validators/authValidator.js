import { body, validationResult  } from 'express-validator';
import ApiError from '../utils/ApiError.js';

/**
 * Middleware that runs after express-validator checks.
 * If there are validation errors, it throws a structured ApiError.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors.array().map(e => e.msg).join(', ');
    return next(new ApiError(400, message, 'VALIDATION_ERROR'));
  }
  next();
};

const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role')
    .optional()
    .isIn(['Admin', 'Manager', 'Accountant', 'Sales', 'Inventory'])
    .withMessage('Invalid role'),
  handleValidationErrors,
];

export { loginValidator,
  registerValidator,
  handleValidationErrors,
 };
