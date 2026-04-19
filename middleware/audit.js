/**
 * Audit Logging Middleware
 * 
 * Provides comprehensive audit logging for all security-sensitive operations.
 * Captures user ID, action, resource, resource ID, IP address, user agent,
 * and old/new values for update operations.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.7, 13.8
 */

const { getPool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Extract IP address from request
 * Handles both direct connections and proxied requests
 * 
 * @param {Object} req - Express request object
 * @returns {string} IP address
 */
function getIpAddress(req) {
  // Check for X-Forwarded-For header (proxy/load balancer)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  // Check for X-Real-IP header (nginx proxy)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp.trim();
  }
  
  // Fall back to direct connection IP
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Extract user agent from request
 * 
 * @param {Object} req - Express request object
 * @returns {string} User agent string
 */
function getUserAgent(req) {
  return req.headers['user-agent'] || 'unknown';
}

/**
 * Store audit log entry in database asynchronously
 * Does not block request processing
 * 
 * @param {Object} logEntry - Audit log entry
 * @param {number} logEntry.user_id - User ID
 * @param {string} logEntry.action - Action performed
 * @param {string} logEntry.resource - Resource type
 * @param {number} logEntry.resource_id - Resource ID
 * @param {Object} logEntry.old_values - Old values (for updates)
 * @param {Object} logEntry.new_values - New values (for creates/updates)
 * @param {string} logEntry.ip_address - IP address
 * @param {string} logEntry.user_agent - User agent
 */
async function storeAuditLog(logEntry) {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Insert audit log entry
    await connection.execute(
      `INSERT INTO audit_logs 
       (user_id, action, resource, resource_id, old_values, new_values, ip_address, user_agent, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        logEntry.user_id || null,
        logEntry.action,
        logEntry.resource,
        logEntry.resource_id || null,
        logEntry.old_values ? JSON.stringify(logEntry.old_values) : null,
        logEntry.new_values ? JSON.stringify(logEntry.new_values) : null,
        logEntry.ip_address,
        logEntry.user_agent
      ]
    );
    
    logger.info('Audit log stored', {
      userId: logEntry.user_id,
      action: logEntry.action,
      resource: logEntry.resource,
      resourceId: logEntry.resource_id
    });
    
  } catch (error) {
    // Log error but don't throw - audit logging should not break the application
    logger.error('Failed to store audit log', {
      error: error.message,
      logEntry
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Audit log middleware function
 * 
 * Captures audit information from the request and response.
 * Should be used AFTER authentication middleware to capture user ID.
 * 
 * This middleware captures the response body by intercepting res.json()
 * to extract resource IDs and new values for audit logging.
 * 
 * Usage:
 * - For CREATE operations: Captures new values from response
 * - For UPDATE operations: Captures old and new values (old values should be in req.auditOldValues)
 * - For DELETE operations: Captures resource ID
 * - For authentication events: Captures login/logout actions
 * 
 * @param {string} action - Action being performed (e.g., 'create_patient', 'update_appointment', 'login')
 * @param {string} resource - Resource type (e.g., 'patients', 'appointments', 'auth')
 * @returns {Function} Express middleware function
 * 
 * @example
 * // For CREATE operations
 * router.post('/patients', 
 *   authenticate, 
 *   auditLog('create_patient', 'patients'),
 *   createPatient
 * );
 * 
 * // For UPDATE operations (controller should set req.auditOldValues)
 * router.put('/patients/:id', 
 *   authenticate, 
 *   auditLog('update_patient', 'patients'),
 *   updatePatient
 * );
 * 
 * // For DELETE operations
 * router.delete('/patients/:id', 
 *   authenticate, 
 *   auditLog('delete_patient', 'patients'),
 *   deletePatient
 * );
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.5, 13.6, 13.7, 13.8
 */
function auditLog(action, resource) {
  return (req, res, next) => {
    // Extract audit information from request
    const userId = req.user ? req.user.userId : null;
    const ipAddress = getIpAddress(req);
    const userAgent = getUserAgent(req);
    
    // Store original res.json to intercept response
    const originalJson = res.json.bind(res);
    
    // Override res.json to capture response data
    res.json = function(data) {
      // Extract resource ID and new values from response
      let resourceId = null;
      let newValues = null;
      
      if (data && data.success && data.data) {
        // Try to extract resource ID from response data
        const responseData = data.data;
        
        // Common ID field patterns
        if (responseData.patient_id) resourceId = responseData.patient_id;
        else if (responseData.appointment_id) resourceId = responseData.appointment_id;
        else if (responseData.doctor_id) resourceId = responseData.doctor_id;
        else if (responseData.payment_id) resourceId = responseData.payment_id;
        else if (responseData.lead_id) resourceId = responseData.lead_id;
        else if (responseData.user_id) resourceId = responseData.user_id;
        else if (responseData.id) resourceId = responseData.id;
        
        // For CREATE and UPDATE operations, capture new values
        if (action.startsWith('create_') || action.startsWith('update_')) {
          newValues = responseData;
        }
      }
      
      // If resource ID is not in response, try to get it from request params
      if (!resourceId && req.params && req.params.id) {
        resourceId = parseInt(req.params.id);
      }
      
      // Get old values from request (should be set by controller for UPDATE operations)
      const oldValues = req.auditOldValues || null;
      
      // Create audit log entry
      const logEntry = {
        user_id: userId,
        action,
        resource,
        resource_id: resourceId,
        old_values: oldValues,
        new_values: newValues,
        ip_address: ipAddress,
        user_agent: userAgent
      };
      
      // Store audit log asynchronously (non-blocking)
      storeAuditLog(logEntry).catch(error => {
        logger.error('Async audit log storage failed', { error: error.message });
      });
      
      // Call original res.json with the data
      return originalJson(data);
    };
    
    // Continue to next middleware
    next();
  };
}

/**
 * Helper function to set old values for UPDATE operations
 * Controllers should call this before updating a resource
 * 
 * @param {Object} req - Express request object
 * @param {Object} oldValues - Old values before update
 * 
 * @example
 * // In controller
 * const oldPatient = await getPatientById(patientId);
 * setAuditOldValues(req, oldPatient);
 * // ... perform update ...
 */
function setAuditOldValues(req, oldValues) {
  req.auditOldValues = oldValues;
}

module.exports = {
  auditLog,
  setAuditOldValues,
  storeAuditLog,
  getIpAddress,
  getUserAgent
};
