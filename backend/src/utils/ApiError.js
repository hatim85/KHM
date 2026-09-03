/**
 * Custom API Error class.
 * Extends the native Error to carry an HTTP status code and
 * a machine-readable error code for the frontend.
 */
class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'ERROR';
    // Ensure the name of this error is the same as the class name
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
