/**
 * Rate Limiting Middleware
 * 
 * Provides rate limiting for API endpoints to prevent abuse and DDoS attacks.
 * Uses express-rate-limit with in-memory store (can be configured with Redis for distributed systems).
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * Limits all API endpoints to 100 requests per minute per IP
 * 
 * Requirements: 12.1, 12.4, 12.5
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests from this IP, please try again later'
    }
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Add custom headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many requests from this IP, please try again later'
      }
    });
  }
});

/**
 * Login endpoint rate limiter
 * Limits login attempts to 5 requests per minute per IP
 * More restrictive to prevent brute force attacks
 * In development: 30 seconds window, in production: 1 minute window
 * 
 * Requirements: 12.2, 12.4, 12.5
 */
// Determine window duration based on environment
const loginWindowMs = process.env.NODE_ENV === 'development' 
  ? 10 * 1000  // 10 seconds for development
  : (parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000); // 1 minute for production

const loginLimiter = rateLimit({
  windowMs: loginWindowMs,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5, // 5 requests per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many login attempts from this IP, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful login requests from rate limit counter
  skipSuccessfulRequests: true,
  handler: (req, res, next, options) => {
    const retryAfter = Math.ceil(loginWindowMs / 1000); // Convert to seconds
    const timeMessage = process.env.NODE_ENV === 'development' 
      ? `${retryAfter} seconds`
      : `${Math.ceil(retryAfter / 60)} minutes`;
    
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: `Too many login attempts from this IP, please try again in ${timeMessage}`
      }
    });
  }
});

/**
 * QR code scan rate limiter
 * Limits QR scan endpoint to 50 requests per minute per IP
 * Moderate restriction for frequent but legitimate use
 * 
 * Requirements: 12.3, 12.4, 12.5
 */
const qrScanLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.QR_SCAN_RATE_LIMIT_MAX) || 50, // 50 requests per window
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many QR scan requests from this IP, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many QR scan requests from this IP, please try again later'
      }
    });
  }
});

module.exports = {
  apiLimiter,
  loginLimiter,
  qrScanLimiter
};
