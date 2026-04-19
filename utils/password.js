/**
 * Password Security Utilities
 * 
 * Provides secure password hashing, verification, and validation functions.
 * Uses bcrypt with 12 salt rounds for strong password security.
 * 
 * Requirements: 20.1, 20.2, 20.3
 */

const bcrypt = require('bcrypt');

// Configuration
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt with 12 salt rounds
 * 
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} - Hashed password
 * @throws {Error} - If password is invalid or hashing fails
 * 
 * Requirement 20.1: Hash passwords using bcrypt with 12 salt rounds
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    return hash;
  } catch (error) {
    throw new Error(`Failed to hash password: ${error.message}`);
  }
}

/**
 * Verify a password against a bcrypt hash
 * 
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Bcrypt hash to compare against
 * @returns {Promise<boolean>} - True if password matches hash, false otherwise
 * @throws {Error} - If inputs are invalid or verification fails
 * 
 * Requirement 20.2: Verify passwords using bcrypt compare function
 */
async function verifyPassword(password, hash) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }

  try {
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    throw new Error(`Failed to verify password: ${error.message}`);
  }
}

/**
 * Validate password complexity requirements
 * 
 * Password must meet the following criteria:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * 
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets complexity requirements, false otherwise
 * 
 * Requirement 20.3: Enforce password complexity requirements
 */
function isStrongPassword(password) {
  if (!password || typeof password !== 'string') {
    return false;
  }

  // Minimum 8 characters
  if (password.length < 8) {
    return false;
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return false;
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return false;
  }

  // At least one number
  if (!/[0-9]/.test(password)) {
    return false;
  }

  // At least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return false;
  }

  return true;
}

module.exports = {
  hashPassword,
  verifyPassword,
  isStrongPassword
};
