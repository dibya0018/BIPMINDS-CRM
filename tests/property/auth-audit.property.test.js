/**
 * Property-Based Tests for Authentication Audit Trail
 * 
 * Tests universal properties that should hold for authentication audit logging.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 20: Authentication Audit Trail
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { storeAuditLog, getIpAddress, getUserAgent } = require('../../middleware/audit');

describe('Authentication Audit Trail - Property-Based Tests', () => {
  
  let pool;
  
  beforeAll(async () => {
    pool = getPool();
  });
  
  afterAll(async () => {
    // Clean up test audit logs and test users
    const connection = await pool.getConnection();
    try {
      await connection.query('DELETE FROM audit_logs WHERE user_id >= 900000');
      await connection.query('DELETE FROM users WHERE user_id >= 900000');
    } finally {
      connection.release();
    }
  });
  
  /**
   * Helper function to create a test user
   * @param {number} userId - User ID to create
   * @returns {Promise<void>}
   */
  async function createTestUser(userId) {
    const connection = await pool.getConnection();
    try {
      await connection.query(
        `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [
          userId,
          `test${userId}@test.com`,
          '$2b$12$dummyhashfortest',
          'Test',
          'User',
          'staff',
          true
        ]
      );
    } finally {
      connection.release();
    }
  }
  
  /**
   * Helper function to delete a test user
   * @param {number} userId - User ID to delete
   * @returns {Promise<void>}
   */
  async function deleteTestUser(userId) {
    const connection = await pool.getConnection();
    try {
      await connection.query('DELETE FROM audit_logs WHERE user_id = ?', [userId]);
      await connection.query('DELETE FROM users WHERE user_id = ?', [userId]);
    } finally {
      connection.release();
    }
  }
  
  /**
   * Feature: hospital-crm-api, Property 20: Authentication Audit Trail
   * 
   * For any login or logout event, an audit log entry should be created with
   * the action, user ID, IP address, and user agent.
   * 
   * Validates: Requirements 4.10
   */
  describe('Property 20: Authentication Audit Trail', () => {
    
    test('login events should create audit log with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            action: fc.constant('login'),
            resource: fc.constant('auth'),
            ipAddress: fc.ipV4(),
            userAgent: fc.string({ minLength: 10, maxLength: 200 })
          }),
          async (auditData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(auditData.userId);
            
            // Create audit log entry
            const logEntry = {
              user_id: auditData.userId,
              action: auditData.action,
              resource: auditData.resource,
              resource_id: null,
              old_values: null,
              new_values: null,
              ip_address: auditData.ipAddress,
              user_agent: auditData.userAgent
            };
            
            await storeAuditLog(logEntry);
            
            // Wait a bit for async operation to complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Retrieve audit log
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? 
                 ORDER BY timestamp DESC LIMIT 1`,
                [auditData.userId, auditData.action, auditData.resource]
              );
              
              if (logs.length === 0) {
                return false;
              }
              
              const log = logs[0];
              
              // Property 1: Audit log should have user ID
              const hasUserId = log.user_id === auditData.userId;
              
              // Property 2: Audit log should have action
              const hasAction = log.action === auditData.action;
              
              // Property 3: Audit log should have resource
              const hasResource = log.resource === auditData.resource;
              
              // Property 4: Audit log should have IP address
              const hasIpAddress = log.ip_address === auditData.ipAddress;
              
              // Property 5: Audit log should have user agent
              const hasUserAgent = log.user_agent === auditData.userAgent;
              
              // Property 6: Audit log should have timestamp
              const hasTimestamp = log.timestamp instanceof Date;
              
              // Property 7: Timestamp should be recent (within last minute)
              const now = new Date();
              const timeDiff = now - log.timestamp;
              const timestampIsRecent = timeDiff >= 0 && timeDiff < 60000; // 1 minute
              
              // Clean up
              await connection.query('DELETE FROM audit_logs WHERE audit_id = ?', [log.audit_id]);
              
              return hasUserId &&
                     hasAction &&
                     hasResource &&
                     hasIpAddress &&
                     hasUserAgent &&
                     hasTimestamp &&
                     timestampIsRecent;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(auditData.userId);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('logout events should create audit log with all required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            action: fc.constant('logout'),
            resource: fc.constant('auth'),
            ipAddress: fc.ipV4(),
            userAgent: fc.string({ minLength: 10, maxLength: 200 })
          }),
          async (auditData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(auditData.userId);
            
            // Create audit log entry
            const logEntry = {
              user_id: auditData.userId,
              action: auditData.action,
              resource: auditData.resource,
              resource_id: null,
              old_values: null,
              new_values: null,
              ip_address: auditData.ipAddress,
              user_agent: auditData.userAgent
            };
            
            await storeAuditLog(logEntry);
            
            // Wait for async operation
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Retrieve audit log
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? 
                 ORDER BY timestamp DESC LIMIT 1`,
                [auditData.userId, auditData.action, auditData.resource]
              );
              
              if (logs.length === 0) {
                return false;
              }
              
              const log = logs[0];
              
              // Property 1: Audit log should have correct user ID
              const hasCorrectUserId = log.user_id === auditData.userId;
              
              // Property 2: Audit log should have logout action
              const hasLogoutAction = log.action === 'logout';
              
              // Property 3: Audit log should have auth resource
              const hasAuthResource = log.resource === 'auth';
              
              // Property 4: Audit log should have IP address
              const hasIpAddress = log.ip_address === auditData.ipAddress;
              
              // Property 5: Audit log should have user agent
              const hasUserAgent = log.user_agent === auditData.userAgent;
              
              // Clean up
              await connection.query('DELETE FROM audit_logs WHERE audit_id = ?', [log.audit_id]);
              
              return hasCorrectUserId &&
                     hasLogoutAction &&
                     hasAuthResource &&
                     hasIpAddress &&
                     hasUserAgent;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(auditData.userId);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('multiple authentication events should create separate audit logs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            eventCount: fc.integer({ min: 2, max: 5 }),
            ipAddress: fc.ipV4(),
            userAgent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (testData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(testData.userId);
            
            const auditIds = [];
            
            // Create multiple audit log entries
            for (let i = 0; i < testData.eventCount; i++) {
              const action = i % 2 === 0 ? 'login' : 'logout';
              
              const logEntry = {
                user_id: testData.userId,
                action: action,
                resource: 'auth',
                resource_id: null,
                old_values: null,
                new_values: null,
                ip_address: testData.ipAddress,
                user_agent: testData.userAgent
              };
              
              await storeAuditLog(logEntry);
            }
            
            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Retrieve audit logs
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND resource = 'auth' 
                 ORDER BY timestamp DESC`,
                [testData.userId]
              );
              
              // Property 1: All events should be logged
              const allEventsLogged = logs.length >= testData.eventCount;
              
              // Property 2: Each log should have unique audit_id
              const auditIdSet = new Set(logs.map(l => l.audit_id));
              const allIdsUnique = auditIdSet.size === logs.length;
              
              // Property 3: All logs should have the same user ID
              const allHaveSameUserId = logs.every(l => l.user_id === testData.userId);
              
              // Property 4: All logs should have timestamps
              const allHaveTimestamps = logs.every(l => l.timestamp instanceof Date);
              
              // Clean up
              for (const log of logs) {
                await connection.query('DELETE FROM audit_logs WHERE audit_id = ?', [log.audit_id]);
              }
              
              return allEventsLogged &&
                     allIdsUnique &&
                     allHaveSameUserId &&
                     allHaveTimestamps;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(testData.userId);
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    test('audit logs should preserve IP address format', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            ipAddress: fc.oneof(
              fc.ipV4(),
              fc.ipV6(),
              fc.constant('127.0.0.1'),
              fc.constant('::1'),
              fc.constant('unknown')
            )
          }),
          async (testData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(testData.userId);
            
            const logEntry = {
              user_id: testData.userId,
              action: 'login',
              resource: 'auth',
              resource_id: null,
              old_values: null,
              new_values: null,
              ip_address: testData.ipAddress,
              user_agent: 'test-agent'
            };
            
            await storeAuditLog(logEntry);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT ip_address FROM audit_logs 
                 WHERE user_id = ? AND action = 'login' 
                 ORDER BY timestamp DESC LIMIT 1`,
                [testData.userId]
              );
              
              if (logs.length === 0) {
                return false;
              }
              
              // Property: IP address should be preserved exactly as stored
              const ipPreserved = logs[0].ip_address === testData.ipAddress;
              
              // Clean up
              await connection.query(
                'DELETE FROM audit_logs WHERE user_id = ? AND ip_address = ?',
                [testData.userId, testData.ipAddress]
              );
              
              return ipPreserved;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(testData.userId);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('audit logs should handle various user agent strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            userAgent: fc.oneof(
              fc.string({ minLength: 10, maxLength: 200 }),
              fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
              fc.constant('curl/7.68.0'),
              fc.constant('PostmanRuntime/7.26.8'),
              fc.constant('unknown')
            )
          }),
          async (testData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(testData.userId);
            
            const logEntry = {
              user_id: testData.userId,
              action: 'login',
              resource: 'auth',
              resource_id: null,
              old_values: null,
              new_values: null,
              ip_address: '127.0.0.1',
              user_agent: testData.userAgent
            };
            
            await storeAuditLog(logEntry);
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT user_agent FROM audit_logs 
                 WHERE user_id = ? AND action = 'login' 
                 ORDER BY timestamp DESC LIMIT 1`,
                [testData.userId]
              );
              
              if (logs.length === 0) {
                return false;
              }
              
              // Property: User agent should be preserved exactly as stored
              const userAgentPreserved = logs[0].user_agent === testData.userAgent;
              
              // Clean up
              await connection.query(
                'DELETE FROM audit_logs WHERE user_id = ? AND user_agent = ?',
                [testData.userId, testData.userAgent]
              );
              
              return userAgentPreserved;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(testData.userId);
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('audit logs should be created asynchronously without blocking', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            batchSize: fc.integer({ min: 5, max: 10 })
          }),
          async (testData) => {
            // Create test user first to satisfy foreign key constraint
            await createTestUser(testData.userId);
            
            const startTime = Date.now();
            
            // Create multiple audit logs in parallel
            const promises = [];
            for (let i = 0; i < testData.batchSize; i++) {
              const logEntry = {
                user_id: testData.userId,
                action: 'login',
                resource: 'auth',
                resource_id: null,
                old_values: null,
                new_values: null,
                ip_address: '127.0.0.1',
                user_agent: `test-agent-${i}`
              };
              
              promises.push(storeAuditLog(logEntry));
            }
            
            // Wait for all to complete
            await Promise.all(promises);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify logs were created
            const connection = await pool.getConnection();
            try {
              const [logs] = await connection.query(
                `SELECT COUNT(*) as count FROM audit_logs 
                 WHERE user_id = ? AND action = 'login'`,
                [testData.userId]
              );
              
              // Property 1: All logs should be created
              const allLogsCreated = logs[0].count >= testData.batchSize;
              
              // Property 2: Batch creation should be reasonably fast (< 5 seconds)
              const creationIsFast = duration < 5000;
              
              // Clean up
              await connection.query('DELETE FROM audit_logs WHERE user_id = ?', [testData.userId]);
              
              return allLogsCreated && creationIsFast;
              
            } finally {
              connection.release();
              // Clean up test user
              await deleteTestUser(testData.userId);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    test('getIpAddress helper should extract IP from request object', () => {
      fc.assert(
        fc.property(
          fc.record({
            ip: fc.ipV4(),
            forwardedFor: fc.option(fc.ipV4(), { nil: null }),
            realIp: fc.option(fc.ipV4(), { nil: null })
          }),
          (testData) => {
            // Mock request object
            const req = {
              ip: testData.ip,
              headers: {},
              connection: { remoteAddress: testData.ip }
            };
            
            if (testData.forwardedFor) {
              req.headers['x-forwarded-for'] = testData.forwardedFor;
            }
            
            if (testData.realIp) {
              req.headers['x-real-ip'] = testData.realIp;
            }
            
            const extractedIp = getIpAddress(req);
            
            // Property: Should extract IP address (priority: x-forwarded-for > x-real-ip > req.ip)
            let expectedIp = testData.ip;
            if (testData.realIp) {
              expectedIp = testData.realIp;
            }
            if (testData.forwardedFor) {
              expectedIp = testData.forwardedFor;
            }
            
            return extractedIp === expectedIp;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getUserAgent helper should extract user agent from request object', () => {
      fc.assert(
        fc.property(
          fc.record({
            userAgent: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: null })
          }),
          (testData) => {
            // Mock request object
            const req = {
              headers: {}
            };
            
            if (testData.userAgent) {
              req.headers['user-agent'] = testData.userAgent;
            }
            
            const extractedUserAgent = getUserAgent(req);
            
            // Property: Should extract user agent or return 'unknown'
            const expectedUserAgent = testData.userAgent || 'unknown';
            
            return extractedUserAgent === expectedUserAgent;
          }
        ),
        { numRuns: 100 }
      );
    });

  });

});
