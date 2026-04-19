/**
 * JWT Configuration Module
 * 
 * Provides JWT configuration including secret and token expiration times.
 * Validates required environment variables on load.
 * 
 * Requirements: 18.4
 */

// Validate JWT_SECRET environment variable
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

module.exports = {
  // JWT secret key from environment
  secret: process.env.JWT_SECRET,
  
  // Access token expiration (24 hours)
  accessTokenExpiry: '24h',
  
  // Refresh token expiration (7 days)
  refreshTokenExpiry: '7d',
  
  // Token issuer
  issuer: 'hospital-crm-api',
  
  // Token audience
  audience: 'hospital-crm-client'
};
