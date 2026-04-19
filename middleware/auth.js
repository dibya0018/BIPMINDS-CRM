/**
 * Authentication Middleware
 * 
 * Provides JWT-based authentication for protected routes.
 * Extracts and verifies JWT tokens from Authorization header.
 * Attaches user data to request object for downstream middleware and controllers.
 * 
 * Requirements: 4.7, 4.8
 */

const { verifyToken } = require('../utils/jwt');

/**
 * Authentication middleware function
 * 
 * Extracts JWT token from Authorization header, verifies it, and attaches
 * user data to the request object. Returns 401 error if token is missing,
 * invalid, or expired.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * 
 * Requirements: 4.7, 4.8
 */
function authenticate(req, res, next) {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;
    
    // Check if Authorization header exists (empty string is also considered missing)
    if (!authHeader || authHeader.trim() === '') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header is missing'
        }
      });
    }
    
    // Check if Authorization header follows Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header must use Bearer token format'
        }
      });
    }
    
    // Extract token from "Bearer <token>"
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    // Check if token is present after Bearer prefix
    if (!token || token.trim() === '') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Token is missing from Authorization header'
        }
      });
    }
    
    // Verify token
    const decoded = verifyToken(token);
    
    // Check if token verification failed
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired token'
        }
      });
    }
    
    // Attach user data to request object for downstream use
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      userType: decoded.userType,
      roles: decoded.roles || []
    };
    
    // Continue to next middleware
    next();
    
  } catch (error) {
    // Handle unexpected errors
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_002',
        message: 'Authentication failed'
      }
    });
  }
}

module.exports = {
  authenticate
};
