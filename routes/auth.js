/**
 * Authentication Routes
 * 
 * Defines routes for user authentication and session management.
 * Includes login, logout, token refresh, and current user retrieval.
 * 
 * Requirements: 4.1, 4.5
 */

const express = require('express');
const router = express.Router();
const { login, logout, refreshToken, getCurrentUser, findOrCreateUser } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/audit');

/**
 * POST /api/auth/login
 * Authenticate user and create session
 * 
 * Request body:
 * - email: string (required)
 * - password: string (required)
 * 
 * Response:
 * - user: object (userId, email, firstName, lastName, userType, roles)
 * - accessToken: string (JWT access token)
 * - refreshToken: string (JWT refresh token)
 * - sessionId: string (session identifier)
 * 
 * Requirements: 4.1
 */
router.post('/login', loginLimiter, auditLog('login', 'auth'), login);

/**
 * POST /api/auth/logout
 * Invalidate user session
 * 
 * Request body:
 * - sessionId: string (required)
 * 
 * Response:
 * - message: string (success message)
 * 
 * Requirements: 4.5
 */
router.post('/logout', authenticate, auditLog('logout', 'auth'), logout);

/**
 * POST /api/auth/refresh
 * Generate new access token from refresh token
 * 
 * Request body:
 * - refreshToken: string (required)
 * 
 * Response:
 * - accessToken: string (new JWT access token)
 * 
 * Requirements: 4.2, 4.3
 */
router.post('/refresh', refreshToken);

/**
 * GET /api/auth/me
 * Get current authenticated user information
 * 
 * Response:
 * - userId: number
 * - email: string
 * - firstName: string
 * - lastName: string
 * - phone: string
 * - userType: string
 * - profilePicture: string
 * - lastLogin: datetime
 * - createdAt: datetime
 * - roles: array of role objects
 * 
 * Requirements: 4.9
 */
router.get('/me', authenticate, getCurrentUser);

/**
 * POST /api/auth/find-or-create-user
 * Find user by email or create new user if not exists
 * Used for doctor creation workflow
 * 
 * Request body:
 * - email: string (required)
 * - password: string (optional, defaults to 'Doctor@123')
 * - firstName: string (required)
 * - lastName: string (required)
 * - phone: string (optional)
 * - gender: string (optional)
 * - profilePicture: string (optional, base64)
 * - userType: string (optional, defaults to 'doctor')
 * 
 * Response:
 * - userId: number
 * - email: string
 * - firstName: string
 * - lastName: string
 * - phone: string
 * - gender: string
 * - profilePicture: string
 * - isNew: boolean (true if user was created, false if existing)
 * 
 * Requirements: 4.1
 */
router.post('/find-or-create-user', authenticate, auditLog('find_or_create_user', 'auth'), findOrCreateUser);

module.exports = router;
