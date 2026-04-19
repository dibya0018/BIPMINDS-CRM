/**
 * User Routes
 * 
 * Defines routes for user management operations.
 * Includes endpoints for getting users, creating users, updating users, and role assignment.
 * 
 * Requirements: User management, Role-based access control
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { auditLog } = require('../middleware/audit');
const { getUsers, getRoles, createUser, updateUser, assignRoles, deleteUser } = require('../controllers/userController');

/**
 * GET /api/users
 * Get all users with pagination and search
 * 
 * Query Parameters:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - search: string (optional)
 * - userType: string (optional)
 * - isActive: boolean (optional)
 * 
 * Response:
 * - success: boolean
 * - data: array of user objects
 * - pagination: object (page, limit, total, totalPages)
 */
router.get('/', authenticate, checkPermission('users', 'read'), getUsers);

/**
 * GET /api/users/roles
 * Get all available roles
 * 
 * Response:
 * - success: boolean
 * - data: array of role objects
 */
router.get('/roles', authenticate, checkPermission('users', 'read'), getRoles);

/**
 * POST /api/users
 * Create a new user
 * 
 * Request Body:
 * - email: string (required)
 * - password: string (required)
 * - firstName: string (required)
 * - lastName: string (required)
 * - phone: string (optional)
 * - userType: string (required) - 'admin', 'doctor', 'staff', 'receptionist'
 * - profilePicture: string (optional) - base64 encoded image
 * - roleIds: array of numbers (optional) - array of role IDs to assign
 * 
 * Response:
 * - success: boolean
 * - data: created user object
 * - message: string
 */
router.post('/', authenticate, checkPermission('users', 'create'), auditLog('create_user', 'users'), createUser);

/**
 * PUT /api/users/:userId
 * Update user information
 * 
 * Request Body (all optional):
 * - firstName: string
 * - lastName: string
 * - phone: string
 * - userType: string
 * - profilePicture: string
 * - isActive: boolean
 * 
 * Response:
 * - success: boolean
 * - data: updated user object
 * - message: string
 */
router.put('/:userId', authenticate, checkPermission('users', 'update'), auditLog('update_user', 'users'), updateUser);

/**
 * POST /api/users/:userId/roles
 * Assign roles to a user
 * 
 * Request Body:
 * - roleIds: array of numbers (required) - array of role IDs to assign
 * 
 * Response:
 * - success: boolean
 * - data: updated user object with roles
 * - message: string
 */
router.post('/:userId/roles', authenticate, checkPermission('users', 'update'), auditLog('assign_roles', 'users'), assignRoles);

/**
 * DELETE /api/users/:userId
 * Delete user (soft delete - sets is_active to false)
 * 
 * Response:
 * - success: boolean
 * - message: string
 */
router.delete('/:userId', authenticate, checkPermission('users', 'delete'), auditLog('delete_user', 'users'), deleteUser);

module.exports = router;
