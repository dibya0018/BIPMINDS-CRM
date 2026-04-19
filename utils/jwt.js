/**
 * JWT Utility Module
 * 
 * Provides functions for generating and verifying JWT tokens.
 * Supports access tokens and refresh tokens with different expiration times.
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.7
 */

const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');

/**
 * Generate an access token for a user
 * 
 * @param {Object} user - User object
 * @param {number} user.userId - User ID
 * @param {string} user.email - User email
 * @param {string} user.userType - User type (admin, doctor, staff, receptionist)
 * @param {Array<string>} user.roles - User roles
 * @returns {string} JWT access token
 * 
 * Requirements: 4.2, 4.3, 4.4
 */
function generateAccessToken(user) {
  const payload = {
    userId: user.userId,
    email: user.email,
    userType: user.userType,
    roles: user.roles || []
  };

  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.accessTokenExpiry,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience
  });
}

/**
 * Generate a refresh token for a user
 * 
 * @param {Object} user - User object
 * @param {number} user.userId - User ID
 * @param {string} user.email - User email
 * @returns {string} JWT refresh token
 * 
 * Requirements: 4.2, 4.3
 */
function generateRefreshToken(user) {
  const payload = {
    userId: user.userId,
    email: user.email,
    type: 'refresh'
  };

  return jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.refreshTokenExpiry,
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience
  });
}

/**
 * Verify and decode a JWT token
 * 
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 * 
 * Requirements: 4.7
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, jwtConfig.secret, {
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    });
    return decoded;
  } catch (error) {
    // Token is invalid, expired, or malformed
    return null;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken
};
