/**
 * User Controller
 * 
 * Handles user management operations including:
 * - Getting all users with pagination and search
 * - Creating new users
 * - Updating user information
 * - Assigning roles to users
 * - Getting user roles
 * 
 * Requirements: User management, Role-based access control
 */

const { getPool } = require('../config/database');
const { hashPassword } = require('../utils/password');
const logger = require('../config/logger');

/**
 * Get all users with pagination and search
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getUsers(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { page = 1, limit = 20, search = '', userType = '', isActive = '' } = req.query;
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build WHERE clause
    let whereConditions = ['u.is_active = TRUE'];
    const queryParams = [];
    
    if (search) {
      whereConditions.push(`(
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        u.phone LIKE ?
      )`);
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    if (userType) {
      whereConditions.push('u.user_type = ?');
      queryParams.push(userType);
    }
    
    if (isActive !== '') {
      whereConditions.push('u.is_active = ?');
      queryParams.push(isActive === 'true' ? 1 : 0);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;
    
    // Get users with their roles
    const [users] = await connection.query(
      `SELECT 
        u.user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.user_type,
        u.profile_picture,
        u.is_active,
        u.last_login,
        u.created_at,
        u.updated_at,
        GROUP_CONCAT(DISTINCT r.role_name ORDER BY r.role_name SEPARATOR ',') as roles,
        GROUP_CONCAT(DISTINCT r.role_id ORDER BY r.role_id SEPARATOR ',') as role_ids
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id AND r.is_active = TRUE
      ${whereClause}
      GROUP BY u.user_id
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );
    
    // Format response
    const formattedUsers = users.map(user => ({
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`,
      phone: user.phone,
      userType: user.user_type,
      profilePicture: user.profile_picture,
      isActive: Boolean(user.is_active),
      lastLogin: user.last_login,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      roles: user.roles ? user.roles.split(',') : [],
      roleIds: user.role_ids ? user.role_ids.split(',').map(id => parseInt(id)) : []
    }));
    
    res.json({
      success: true,
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get users error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching users'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get all available roles
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getRoles(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const [roles] = await connection.query(
      `SELECT 
        role_id,
        role_name,
        description,
        is_active,
        created_at,
        updated_at
      FROM roles
      WHERE is_active = TRUE
      ORDER BY role_name ASC`
    );
    
    const formattedRoles = roles.map(role => ({
      roleId: role.role_id,
      roleName: role.role_name,
      description: role.description,
      isActive: Boolean(role.is_active),
      createdAt: role.created_at,
      updatedAt: role.updated_at
    }));
    
    res.json({
      success: true,
      data: formattedRoles
    });
    
  } catch (error) {
    logger.error('Get roles error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching roles'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create a new user
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createUser(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      phone, 
      userType, 
      profilePicture,
      roleIds = []
    } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !userType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Email, password, firstName, lastName, and userType are required'
        }
      });
    }
    
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check if user with this email already exists
      const [existingUsers] = await connection.query(
        'SELECT user_id FROM users WHERE email = ?',
        [email]
      );
      
      if (existingUsers.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'User with this email already exists'
          }
        });
      }
      
      // Hash password
      const passwordHash = await hashPassword(password);
      
      // Create user
      const [userResult] = await connection.execute(
        `INSERT INTO users (
          email, password_hash, first_name, last_name, phone, user_type, profile_picture, is_active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
        [
          email,
          passwordHash,
          firstName,
          lastName,
          phone || null,
          userType,
          profilePicture || null,
          req.user ? req.user.userId : null
        ]
      );
      
      const userId = userResult.insertId;
      
      // Assign roles if provided
      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          await connection.execute(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = user_id`,
            [userId, roleId, req.user ? req.user.userId : null]
          );
        }
      }
      
      await connection.commit();
      
      logger.info('User created', { 
        userId,
        email,
        createdBy: req.user ? req.user.userId : null
      });
      
      // Fetch the created user with roles
      const [newUser] = await connection.query(
        `SELECT 
          u.user_id,
          u.email,
          u.first_name,
          u.last_name,
          u.phone,
          u.user_type,
          u.profile_picture,
          u.is_active,
          u.created_at,
          GROUP_CONCAT(DISTINCT r.role_name ORDER BY r.role_name SEPARATOR ',') as roles,
          GROUP_CONCAT(DISTINCT r.role_id ORDER BY r.role_id SEPARATOR ',') as role_ids
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id AND r.is_active = TRUE
        WHERE u.user_id = ?
        GROUP BY u.user_id`,
        [userId]
      );
      
      const user = newUser[0];
      const formattedUser = {
        userId: user.user_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        phone: user.phone,
        userType: user.user_type,
        profilePicture: user.profile_picture,
        isActive: Boolean(user.is_active),
        createdAt: user.created_at,
        roles: user.roles ? user.roles.split(',') : [],
        roleIds: user.role_ids ? user.role_ids.split(',').map(id => parseInt(id)) : []
      };
      
      // Notify WebSocket clients about the change
      if (global.wsServer) {
        global.wsServer.notifyDataChange('users', 'create', { userId: formattedUser.userId });
      }
      
      res.status(201).json({
        success: true,
        data: formattedUser,
        message: 'User created successfully'
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    logger.error('Create user error', { error: error.message, stack: error.stack });
    
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
        message: 'An error occurred while creating user'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update user information
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updateUser(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { userId } = req.params;
    const { 
      firstName, 
      lastName, 
      phone, 
      userType, 
      profilePicture,
      isActive
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Build update query dynamically
    const updates = [];
    const updateValues = [];
    
    if (firstName !== undefined) {
      updates.push('first_name = ?');
      updateValues.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push('last_name = ?');
      updateValues.push(lastName);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      updateValues.push(phone);
    }
    if (userType !== undefined) {
      updates.push('user_type = ?');
      updateValues.push(userType);
    }
    if (profilePicture !== undefined) {
      updates.push('profile_picture = ?');
      updateValues.push(profilePicture);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      updateValues.push(isActive ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'No fields to update'
        }
      });
    }
    
    updateValues.push(userId);
    
    await connection.execute(
      `UPDATE users 
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      updateValues
    );
    
    logger.info('User updated', { 
      userId,
      updatedBy: req.user ? req.user.userId : null
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('users', 'update', { userId });
    }
    
    // Fetch updated user
    const [users] = await connection.query(
      `SELECT 
        u.user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.user_type,
        u.profile_picture,
        u.is_active,
        u.created_at,
        u.updated_at,
        GROUP_CONCAT(DISTINCT r.role_name ORDER BY r.role_name SEPARATOR ',') as roles,
        GROUP_CONCAT(DISTINCT r.role_id ORDER BY r.role_id SEPARATOR ',') as role_ids
      FROM users u
      LEFT JOIN user_roles ur ON u.user_id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.role_id AND r.is_active = TRUE
      WHERE u.user_id = ?
      GROUP BY u.user_id`,
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
    
    const user = users[0];
    const formattedUser = {
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: `${user.first_name} ${user.last_name}`,
      phone: user.phone,
      userType: user.user_type,
      profilePicture: user.profile_picture,
      isActive: Boolean(user.is_active),
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      roles: user.roles ? user.roles.split(',') : [],
      roleIds: user.role_ids ? user.role_ids.split(',').map(id => parseInt(id)) : []
    };
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('users', 'update', { userId });
    }
    
    res.json({
      success: true,
      data: formattedUser,
      message: 'User updated successfully'
    });
    
  } catch (error) {
    logger.error('Update user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating user'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Assign roles to a user
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function assignRoles(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { userId } = req.params;
    const { roleIds } = req.body;
    
    if (!Array.isArray(roleIds)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'roleIds must be an array'
        }
      });
    }
    
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check if user exists
      const [users] = await connection.query(
        'SELECT user_id FROM users WHERE user_id = ?',
        [userId]
      );
      
      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User not found'
          }
        });
      }
      
      // Remove all existing roles
      await connection.execute(
        'DELETE FROM user_roles WHERE user_id = ?',
        [userId]
      );
      
      // Assign new roles
      if (roleIds.length > 0) {
        for (const roleId of roleIds) {
          await connection.execute(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES (?, ?, ?)`,
            [userId, roleId, req.user ? req.user.userId : null]
          );
        }
      }
      
      await connection.commit();
      
      logger.info('Roles assigned to user', { 
        userId,
        roleIds,
        assignedBy: req.user ? req.user.userId : null
      });
      
      // Fetch updated user with roles
      const [updatedUsers] = await connection.query(
        `SELECT 
          u.user_id,
          u.email,
          u.first_name,
          u.last_name,
          u.phone,
          u.user_type,
          u.profile_picture,
          u.is_active,
          GROUP_CONCAT(DISTINCT r.role_name ORDER BY r.role_name SEPARATOR ',') as roles,
          GROUP_CONCAT(DISTINCT r.role_id ORDER BY r.role_id SEPARATOR ',') as role_ids
        FROM users u
        LEFT JOIN user_roles ur ON u.user_id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.role_id AND r.is_active = TRUE
        WHERE u.user_id = ?
        GROUP BY u.user_id`,
        [userId]
      );
      
      const user = updatedUsers[0];
      const formattedUser = {
        userId: user.user_id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        fullName: `${user.first_name} ${user.last_name}`,
        phone: user.phone,
        userType: user.user_type,
        profilePicture: user.profile_picture,
        isActive: Boolean(user.is_active),
        roles: user.roles ? user.roles.split(',') : [],
        roleIds: user.role_ids ? user.role_ids.split(',').map(id => parseInt(id)) : []
      };
      
      // Notify WebSocket clients about the change (role assignment is also an update)
      if (global.wsServer) {
        global.wsServer.notifyDataChange('users', 'update', { userId });
      }
      
      res.json({
        success: true,
        data: formattedUser,
        message: 'Roles assigned successfully'
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    logger.error('Assign roles error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while assigning roles'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Delete user (soft delete)
 * Sets is_active to false instead of deleting the record
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function deleteUser(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { userId } = req.params;
    
    connection = await pool.getConnection();
    
    // Check if user exists
    const [users] = await connection.query(
      'SELECT user_id, email FROM users WHERE user_id = ?',
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
    
    // Soft delete - set is_active to false
    await connection.execute(
      'UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [userId]
    );
    
    logger.info('User deleted (soft)', { 
      userId: req.user ? req.user.userId : null,
      deletedUserId: userId
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('users', 'delete', { userId });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete user error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting user'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getUsers,
  getRoles,
  createUser,
  updateUser,
  assignRoles,
  deleteUser
};
