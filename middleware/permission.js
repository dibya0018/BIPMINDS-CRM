/**
 * Permission Middleware (RBAC)
 * 
 * Provides role-based access control (RBAC) for protected routes.
 * Checks user permissions using stored procedures and caches results for performance.
 * 
 * Requirements: 5.3, 5.5, 5.6
 */

const { getPool } = require('../config/database');

// In-memory cache for permission checks
// In production, this should be replaced with Redis for distributed caching
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {boolean} hasPermission - Whether user has the permission
 * @property {number} timestamp - When the entry was cached
 */

/**
 * Generate cache key for permission check
 * @param {number} userId - User ID
 * @param {string} resource - Resource name (e.g., 'patients', 'appointments')
 * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete')
 * @returns {string} Cache key
 */
function getCacheKey(userId, resource, action) {
  return `permission:${userId}:${resource}:${action}`;
}

/**
 * Get permission from cache
 * @param {number} userId - User ID
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {boolean|null} Permission result or null if not cached/expired
 */
function getFromCache(userId, resource, action) {
  const key = getCacheKey(userId, resource, action);
  const entry = permissionCache.get(key);
  
  if (!entry) {
    return null;
  }
  
  // Check if cache entry has expired
  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    permissionCache.delete(key);
    return null;
  }
  
  return entry.hasPermission;
}

/**
 * Store permission in cache
 * @param {number} userId - User ID
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @param {boolean} hasPermission - Permission result
 */
function setInCache(userId, resource, action, hasPermission) {
  const key = getCacheKey(userId, resource, action);
  permissionCache.set(key, {
    hasPermission,
    timestamp: Date.now()
  });
}

/**
 * Invalidate all cached permissions for a user
 * This should be called when user roles or permissions change
 * @param {number} userId - User ID
 */
function invalidateUserCache(userId) {
  const prefix = `permission:${userId}:`;
  for (const key of permissionCache.keys()) {
    if (key.startsWith(prefix)) {
      permissionCache.delete(key);
    }
  }
}

/**
 * Clear all permission cache
 * This should be called when roles or permissions are modified
 */
function clearCache() {
  permissionCache.clear();
}

/**
 * Check if user has permission using stored procedure
 * @param {number} userId - User ID
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @returns {Promise<boolean>} True if user has permission
 */
async function checkUserPermission(userId, resource, action) {
  // Check cache first
  const cachedResult = getFromCache(userId, resource, action);
  if (cachedResult !== null) {
    return cachedResult;
  }
  
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Call stored procedure to check permission
    // sp_check_permission(IN p_user_id, IN p_resource, IN p_action, OUT p_has_permission)
    const [rows] = await connection.query(
      'CALL sp_check_permission(?, ?, ?, @has_permission)',
      [userId, resource, action]
    );
    
    // Get the output parameter
    const [result] = await connection.query('SELECT @has_permission as hasPermission');
    const hasPermission = result[0].hasPermission === 1;
    
    // Cache the result
    setInCache(userId, resource, action, hasPermission);
    
    return hasPermission;
    
  } catch (error) {
    console.error('Error checking permission:', error.message);
    // On error, deny permission for security
    return false;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Permission middleware factory
 * 
 * Creates a middleware function that checks if the authenticated user
 * has permission to perform the specified action on the specified resource.
 * 
 * This middleware must be used AFTER the authenticate middleware, as it
 * requires req.user to be populated.
 * 
 * @param {string} resource - Resource name (e.g., 'patients', 'appointments', 'doctors')
 * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete')
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.post('/patients', 
 *   authenticate, 
 *   checkPermission('patients', 'create'), 
 *   createPatient
 * );
 * 
 * Requirements: 5.3, 5.5, 5.6
 */
function checkPermission(resource, action) {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated (req.user should be set by authenticate middleware)
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTH_003',
            message: 'User not authenticated'
          }
        });
      }
      
      const userId = req.user.userId;
      
      // Check if user has the required permission
      const hasPermission = await checkUserPermission(userId, resource, action);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'PERM_001',
            message: `Permission denied: You do not have permission to ${action} ${resource}`
          }
        });
      }
      
      // User has permission, continue to next middleware
      next();
      
    } catch (error) {
      console.error('Permission check error:', error.message);
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'An error occurred while checking permissions'
        }
      });
    }
  };
}

module.exports = {
  checkPermission,
  checkUserPermission,
  invalidateUserCache,
  clearCache,
  // Export for testing
  getFromCache,
  setInCache,
  getCacheKey
};
