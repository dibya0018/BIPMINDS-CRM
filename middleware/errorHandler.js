/**
 * Error Handler Middleware
 * 
 * Provides centralized error handling for the entire application.
 * Formats errors into standardized response format.
 * Maps error types to appropriate HTTP status codes.
 * Logs errors with stack traces for debugging.
 * Hides sensitive information from error responses.
 * 
 * Requirements: 1.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10
 */

const logger = require('../config/logger');

/**
 * Error type to status code mapping
 * Maps common error types to appropriate HTTP status codes
 */
const ERROR_STATUS_MAP = {
  // Validation errors
  'ValidationError': 400,
  'VAL_001': 400,
  
  // Authentication errors
  'AuthenticationError': 401,
  'AUTH_001': 401,
  'AUTH_002': 401,
  'AUTH_003': 401,
  'JsonWebTokenError': 401,
  'TokenExpiredError': 401,
  
  // Authorization/Permission errors
  'AuthorizationError': 403,
  'PERM_001': 403,
  'AUTH_003': 403,
  
  // Not found errors
  'NotFoundError': 404,
  'NOT_FOUND': 404,
  
  // Conflict errors
  'ConflictError': 409,
  'CONFLICT': 409,
  
  // Rate limit errors
  'RateLimitError': 429,
  'RATE_LIMIT': 429
};

/**
 * Error code to message mapping
 * Provides user-friendly messages for common error codes
 */
const ERROR_MESSAGES = {
  'AUTH_001': 'Invalid credentials',
  'AUTH_002': 'Token expired or invalid',
  'AUTH_003': 'Unauthorized access',
  'PERM_001': 'Permission denied',
  'VAL_001': 'Validation error',
  'NOT_FOUND': 'Resource not found',
  'CONFLICT': 'Resource already exists',
  'RATE_LIMIT': 'Too many requests',
  'SERVER_ERROR': 'Internal server error'
};

/**
 * Determine HTTP status code from error
 * 
 * @param {Error} err - Error object
 * @returns {number} HTTP status code
 */
function getStatusCode(err) {
  // Check if error has explicit status code
  if (err.statusCode) {
    return err.statusCode;
  }
  
  // Check if error has status property
  if (err.status) {
    return err.status;
  }
  
  // Check error type/name mapping
  if (err.name && ERROR_STATUS_MAP[err.name]) {
    return ERROR_STATUS_MAP[err.name];
  }
  
  // Check error code mapping
  if (err.code && ERROR_STATUS_MAP[err.code]) {
    return ERROR_STATUS_MAP[err.code];
  }
  
  // Default to 500 for unknown errors
  return 500;
}

/**
 * Determine error code from error
 * 
 * @param {Error} err - Error object
 * @returns {string} Error code
 */
function getErrorCode(err) {
  // Check if error has explicit code
  if (err.code && typeof err.code === 'string') {
    return err.code;
  }
  
  // Map error name to code
  if (err.name === 'ValidationError') return 'VAL_001';
  if (err.name === 'JsonWebTokenError') return 'AUTH_002';
  if (err.name === 'TokenExpiredError') return 'AUTH_002';
  if (err.name === 'AuthenticationError') return 'AUTH_001';
  if (err.name === 'AuthorizationError') return 'PERM_001';
  if (err.name === 'NotFoundError') return 'NOT_FOUND';
  if (err.name === 'ConflictError') return 'CONFLICT';
  if (err.name === 'RateLimitError') return 'RATE_LIMIT';
  
  // Default to SERVER_ERROR
  return 'SERVER_ERROR';
}

/**
 * Get user-friendly error message
 * 
 * @param {Error} err - Error object
 * @param {string} errorCode - Error code
 * @returns {string} Error message
 */
function getErrorMessage(err, errorCode) {
  // Use error message if available and not sensitive
  if (err.message && !isSensitiveMessage(err.message)) {
    return err.message;
  }
  
  // Use predefined message for error code
  if (ERROR_MESSAGES[errorCode]) {
    return ERROR_MESSAGES[errorCode];
  }
  
  // Default message
  return 'An error occurred while processing your request';
}

/**
 * Check if error message contains sensitive information
 * 
 * @param {string} message - Error message
 * @returns {boolean} True if message is sensitive
 */
function isSensitiveMessage(message) {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /credential/i,
    /database/i,
    /connection/i,
    /ECONNREFUSED/i,
    /ER_/i, // MySQL error codes
    /file system/i,
    /path/i
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(message));
}

/**
 * Extract validation error details
 * 
 * @param {Error} err - Error object
 * @returns {Array|null} Validation error details
 */
function getValidationDetails(err) {
  // Express-validator errors
  if (err.array && typeof err.array === 'function') {
    return err.array();
  }
  
  // Custom validation errors
  if (err.errors && Array.isArray(err.errors)) {
    return err.errors;
  }
  
  // Mongoose validation errors
  if (err.name === 'ValidationError' && err.errors) {
    return Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
  }
  
  return null;
}

/**
 * Log error with appropriate level and details
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {number} statusCode - HTTP status code
 */
function logError(err, req, statusCode) {
  const logData = {
    statusCode,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user ? req.user.userId : null,
    errorName: err.name,
    errorCode: err.code,
    errorMessage: err.message,
    stack: err.stack
  };
  
  // Log as error for 5xx, warn for 4xx
  if (statusCode >= 500) {
    logger.error('Server error occurred', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client error occurred', logData);
  }
}

/**
 * Error handler middleware function
 * 
 * This middleware should be registered LAST in the middleware stack
 * to catch all errors from previous middleware and route handlers.
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * @example
 * // In server.js
 * app.use('/api', routes);
 * app.use(errorHandler); // Register last
 * 
 * Requirements: 1.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10
 */
function errorHandler(err, req, res, next) {
  // Determine status code
  const statusCode = getStatusCode(err);
  
  // Determine error code
  const errorCode = getErrorCode(err);
  
  // Get error message
  const errorMessage = getErrorMessage(err, errorCode);
  
  // Log error with stack trace
  logError(err, req, statusCode);
  
  // Build error response
  const errorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: errorMessage
    }
  };
  
  // Add validation details for validation errors
  if (statusCode === 400) {
    const validationDetails = getValidationDetails(err);
    if (validationDetails) {
      errorResponse.error.details = validationDetails;
    }
  }
  
  // In development, include stack trace for 500 errors
  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    errorResponse.error.stack = err.stack;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Create custom error classes for better error handling
 */
class ValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VAL_001';
    this.errors = details;
  }
}

class AuthenticationError extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
    this.code = 'AUTH_001';
  }
}

class AuthorizationError extends Error {
  constructor(message = 'Permission denied') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
    this.code = 'PERM_001';
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource already exists') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
    this.code = 'CONFLICT';
  }
}

class RateLimitError extends Error {
  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.code = 'RATE_LIMIT';
  }
}

module.exports = {
  errorHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
