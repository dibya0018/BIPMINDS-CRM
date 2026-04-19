/**
 * Authentication Controller
 * 
 * Handles user authentication, session management, and token operations.
 * Implements login, logout, token refresh, and current user retrieval.
 * Tracks failed login attempts and implements account lockout logic.
 * 
 * Requirements: 4.1, 4.2, 4.5, 4.6, 4.9, 4.10, 20.6, 20.8
 */

const { getPool } = require('../config/database');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
const { verifyPassword, hashPassword } = require('../utils/password');
const logger = require('../config/logger');
const crypto = require('crypto');

// Redis client would be initialized here for production
// For now, we'll use in-memory storage for failed login attempts
const failedLoginAttempts = new Map();

// Configuration
const MAX_LOGIN_ATTEMPTS = 5;
// Lockout duration: 30 seconds in development, 15 minutes in production
const LOCKOUT_DURATION_MS = process.env.NODE_ENV === 'development' 
  ? 30 * 1000  // 30 seconds for development
  : (parseInt(process.env.ACCOUNT_LOCKOUT_DURATION) || 15 * 60 * 1000); // 15 minutes for production

/**
 * Check if account is locked due to failed login attempts
 * 
 * @param {string} email - User email
 * @returns {Object} Lock status and remaining time
 */
function checkAccountLock(email) {
  const attempts = failedLoginAttempts.get(email);
  
  if (!attempts) {
    return { isLocked: false, remainingTime: 0 };
  }
  
  // Check if lockout period has expired
  const now = Date.now();
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingMs = attempts.lockedUntil - now;
    // In development, show seconds if less than 60 seconds, otherwise show minutes
    if (process.env.NODE_ENV === 'development' && remainingMs < 60000) {
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      return { isLocked: true, remainingTime: remainingSeconds, unit: 'seconds' };
    }
    const remainingTime = Math.ceil(remainingMs / 1000 / 60); // minutes
    return { isLocked: true, remainingTime, unit: 'minutes' };
  }
  
  // Lockout expired, clear attempts
  if (attempts.lockedUntil && now >= attempts.lockedUntil) {
    failedLoginAttempts.delete(email);
    return { isLocked: false, remainingTime: 0 };
  }
  
  return { isLocked: false, remainingTime: 0 };
}

/**
 * Record failed login attempt
 * 
 * @param {string} email - User email
 * @returns {Object} Updated attempt count and lock status
 */
function recordFailedAttempt(email) {
  const attempts = failedLoginAttempts.get(email) || { count: 0, lockedUntil: null };
  attempts.count += 1;
  
  // Lock account if max attempts reached
  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    failedLoginAttempts.set(email, attempts);
    return { count: attempts.count, isLocked: true };
  }
  
  failedLoginAttempts.set(email, attempts);
  return { count: attempts.count, isLocked: false };
}

/**
 * Clear failed login attempts on successful login
 * 
 * @param {string} email - User email
 */
function clearFailedAttempts(email) {
  failedLoginAttempts.delete(email);
}

/**
 * Login function
 * Authenticates user credentials, generates JWT tokens, and creates session
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 4.1, 4.2, 4.6, 4.10, 20.6, 20.8
 */
async function login(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Email and password are required'
        }
      });
    }
    
    // Check if account is locked
    const lockStatus = checkAccountLock(email);
    if (lockStatus.isLocked) {
      logger.warn('Login attempt on locked account', { email });
      const timeMessage = lockStatus.unit === 'seconds' 
        ? `${lockStatus.remainingTime} seconds`
        : `${lockStatus.remainingTime} minutes`;
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_004',
          message: `Account is locked due to too many failed login attempts. Please try again in ${timeMessage}.`
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Call stored procedure to get user data
    const [results] = await connection.query(
      'CALL sp_user_login(?, @user_id, @password_hash, @first_name, @last_name, @user_type, @is_active)',
      [email]
    );
    
    // Get output parameters
    const [outputParams] = await connection.query(
      'SELECT @user_id as user_id, @password_hash as password_hash, @first_name as first_name, @last_name as last_name, @user_type as user_type, @is_active as is_active'
    );
    
    const userData = outputParams[0];
    
    // Check if user exists
    if (!userData.user_id) {
      const attemptResult = recordFailedAttempt(email);
      logger.warn('Login attempt with non-existent email', { email });
      
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Invalid credentials'
        }
      });
    }
    
    // Check if account is active
    if (!userData.is_active) {
      logger.warn('Login attempt on inactive account', { email, userId: userData.user_id });
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_005',
          message: 'Account is inactive. Please contact administrator.'
        }
      });
    }
    
    // Verify password
    const isPasswordValid = await verifyPassword(password, userData.password_hash);
    
    if (!isPasswordValid) {
      const attemptResult = recordFailedAttempt(email);
      logger.warn('Login attempt with invalid password', { 
        email, 
        userId: userData.user_id,
        attemptCount: attemptResult.count 
      });
      
      if (attemptResult.isLocked) {
        const lockStatus = checkAccountLock(email);
        const timeMessage = lockStatus.unit === 'seconds' 
          ? `${lockStatus.remainingTime} seconds`
          : `${lockStatus.remainingTime} minutes`;
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_004',
            message: `Account is locked due to too many failed login attempts. Please try again in ${timeMessage}.`
          }
        });
      }
      
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Invalid credentials'
        }
      });
    }
    
    // Clear failed login attempts on successful login
    clearFailedAttempts(email);
    
    // Get user roles
    const [roles] = await connection.query(
      `SELECT r.role_name 
       FROM user_roles ur 
       INNER JOIN roles r ON ur.role_id = r.role_id 
       WHERE ur.user_id = ? AND r.is_active = TRUE`,
      [userData.user_id]
    );
    
    const roleNames = roles.map(r => r.role_name);
    
    // Get user profile picture
    const [profileData] = await connection.query(
      `SELECT profile_picture FROM users WHERE user_id = ?`,
      [userData.user_id]
    );
    
    const profilePicture = profileData.length > 0 ? profileData[0].profile_picture : null;
    
    // Generate tokens
    const user = {
      userId: userData.user_id,
      email: email,
      userType: userData.user_type,
      roles: roleNames
    };
    
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Create session
    const sessionId = crypto.randomUUID();
    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    await connection.execute(
      `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, userData.user_id, tokenHash, ipAddress, userAgent, expiresAt]
    );
    
    logger.info('User logged in successfully', { 
      userId: userData.user_id, 
      email,
      sessionId 
    });
    
    // Return success response
    res.json({
      success: true,
      data: {
        user: {
          userId: userData.user_id,
          email: email,
          firstName: userData.first_name,
          lastName: userData.last_name,
          userType: userData.user_type,
          profilePicture: profilePicture,
          roles: roleNames
        },
        accessToken,
        refreshToken,
        sessionId
      },
      message: 'Login successful'
    });
    
  } catch (error) {
    logger.error('Login error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during login'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Logout function
 * Invalidates user session
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 4.5
 */
async function logout(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Session ID is required'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Call stored procedure to invalidate session
    await connection.query('CALL sp_user_logout(?)', [sessionId]);
    
    logger.info('User logged out successfully', { 
      userId: req.user.userId,
      sessionId 
    });
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
    
  } catch (error) {
    logger.error('Logout error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during logout'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Refresh token function
 * Generates new access token from valid refresh token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 4.2, 4.3
 */
async function refreshToken(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { refreshToken: token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Refresh token is required'
        }
      });
    }
    
    // Verify refresh token
    const decoded = verifyToken(token);
    
    if (!decoded || decoded.type !== 'refresh') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired refresh token'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get user data
    const [users] = await connection.query(
      `SELECT user_id, email, user_type, is_active 
       FROM users 
       WHERE user_id = ?`,
      [decoded.userId]
    );
    
    if (users.length === 0 || !users[0].is_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_003',
          message: 'User not found or inactive'
        }
      });
    }
    
    // Get user roles
    const [roles] = await connection.query(
      `SELECT r.role_name 
       FROM user_roles ur 
       INNER JOIN roles r ON ur.role_id = r.role_id 
       WHERE ur.user_id = ? AND r.is_active = TRUE`,
      [decoded.userId]
    );
    
    const roleNames = roles.map(r => r.role_name);
    
    // Generate new access token
    const user = {
      userId: decoded.userId,
      email: users[0].email,
      userType: users[0].user_type,
      roles: roleNames
    };
    
    const newAccessToken = generateAccessToken(user);
    
    logger.info('Token refreshed successfully', { userId: decoded.userId });
    
    res.json({
      success: true,
      data: {
        accessToken: newAccessToken
      },
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    logger.error('Token refresh error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred during token refresh'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get current user function
 * Returns current authenticated user information
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 4.9
 */
async function getCurrentUser(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const userId = req.user.userId;
    
    connection = await pool.getConnection();
    
    // Get user data
    const [users] = await connection.query(
      `SELECT user_id, email, first_name, last_name, phone, user_type, profile_picture, last_login, created_at 
       FROM users 
       WHERE user_id = ? AND is_active = TRUE`,
      [userId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }
    
    // Get user roles
    const [roles] = await connection.query(
      `SELECT r.role_id, r.role_name, r.description 
       FROM user_roles ur 
       INNER JOIN roles r ON ur.role_id = r.role_id 
       WHERE ur.user_id = ? AND r.is_active = TRUE`,
      [userId]
    );
    
    const user = users[0];
    
    res.json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        userType: user.user_type,
        profilePicture: user.profile_picture,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        roles: roles
      }
    });
    
  } catch (error) {
    logger.error('Get current user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching user data'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Find or create user by email
 * Checks if user exists by email, if not creates a new user
 * Used for doctor creation workflow
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function findOrCreateUser(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { email, password, firstName, lastName, phone, gender, profilePicture, userType } = req.body;
    
    // Validate required fields
    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Email, firstName, and lastName are required'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if user with this email already exists
    const [existingUsers] = await connection.query(
      'SELECT user_id, first_name, last_name, email, phone, gender, profile_picture FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
    
    if (existingUsers.length > 0) {
      // User exists, return existing user
      const user = existingUsers[0];
      return res.json({
        success: true,
        data: {
          userId: user.user_id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          gender: user.gender,
          profilePicture: user.profile_picture,
          isNew: false
        },
        message: 'User found'
      });
    }
    
    // User doesn't exist, create new user
    const defaultPassword = password || 'Doctor@123';
    const passwordHash = await hashPassword(defaultPassword);
    
    // Create user account
    const [userResult] = await connection.execute(
      `INSERT INTO users (
        email, password_hash, first_name, last_name, phone, gender, user_type, profile_picture, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
      [
        email,
        passwordHash,
        firstName,
        lastName,
        phone || null,
        gender || null,
        userType || 'doctor',
        profilePicture || null,
        req.user ? req.user.userId : null
      ]
    );
    
    const userId = userResult.insertId;
    
    logger.info('User created', { 
      userId,
      email,
      createdBy: req.user ? req.user.userId : null
    });
    
    res.status(201).json({
      success: true,
      data: {
        userId: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        phone: phone || null,
        gender: gender || null,
        profilePicture: profilePicture || null,
        isNew: true
      },
      message: 'User created successfully'
    });
    
  } catch (error) {
    logger.error('Find or create user error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'User with this email already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while finding or creating user'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  login,
  logout,
  refreshToken,
  getCurrentUser,
  findOrCreateUser,
  // Export for testing
  checkAccountLock,
  recordFailedAttempt,
  clearFailedAttempts,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS
};
