/**
 * Property-Based Tests for Audit Logging
 * 
 * Tests universal properties that should hold for all audit logging operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 7: Audit Log Completeness
 */

const fc = require('fast-check');
const { 
  storeAuditLog, 
  getIpAddress, 
  getUserAgent 
} = require('../../middleware/audit');
const { getPool } = require('../../config/database');

describe('Audit Logging - Property-Based Tests', () => {
  
  let pool;
  
  beforeAll(async () => {
    pool = getPool();
    
    // Ensure database is initialized
    try {
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();
    } catch (error) {
      console.error('Database connection failed:', error.message);
      throw error;
    }
  });
  
  /**
   * Feature: hospital-crm-api, Property 7: Audit Log Completeness
   * 
   * For any create, update, or delete operation, an audit log entry should be created
   * with user ID, action, resource, resource ID, and timestamp.
   * 
   * Validates: Requirements 13.1, 13.2, 13.3, 13.6, 13.8
   */
  describe('Property 7: Audit Log Completeness', () => {
    
    test('audit log should store all required fields for any operation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4), // Use only existing user IDs
            action: fc.constantFrom(
              'create_patient', 'update_patient', 'delete_patient',
              'create_appointment', 'update_appointment', 'delete_appointment',
              'create_payment', 'update_payment', 'delete_payment',
              'login', 'logout', 'scan_qr'
            ),
            resource: fc.constantFrom('patients', 'appointments', 'doctors', 'payments', 'leads', 'auth', 'qr_codes'),
            resource_id: fc.integer({ min: 1, max: 1000000 }),
            ip_address: fc.oneof(
              fc.constant('127.0.0.1'),
              fc.constant('192.168.1.1'),
              fc.constant('10.0.0.1'),
              fc.ipV4(),
              fc.ipV6()
            ),
            user_agent: fc.oneof(
              fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
              fc.constant('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
              fc.constant('PostmanRuntime/7.29.2'),
              fc.string({ minLength: 10, maxLength: 200 })
            )
          }),
          async (logEntry) => {
            // Store audit log
            await storeAuditLog(logEntry);
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id = ?
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              // Property 1: Audit log should exist
              const logExists = rows.length > 0;
              
              if (!logExists) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Property 2: User ID should match
              const userIdMatches = storedLog.user_id === logEntry.user_id;
              
              // Property 3: Action should match
              const actionMatches = storedLog.action === logEntry.action;
              
              // Property 4: Resource should match
              const resourceMatches = storedLog.resource === logEntry.resource;
              
              // Property 5: Resource ID should match
              const resourceIdMatches = storedLog.resource_id === logEntry.resource_id;
              
              // Property 6: IP address should match
              const ipMatches = storedLog.ip_address === logEntry.ip_address;
              
              // Property 7: User agent should match
              const userAgentMatches = storedLog.user_agent === logEntry.user_agent;
              
              // Property 8: Timestamp should be present and recent (within last minute)
              const hasTimestamp = storedLog.timestamp !== null;
              const timestampIsRecent = hasTimestamp && 
                (new Date() - new Date(storedLog.timestamp)) < 60000;
              
              return logExists && 
                     userIdMatches && 
                     actionMatches && 
                     resourceMatches && 
                     resourceIdMatches && 
                     ipMatches && 
                     userAgentMatches && 
                     hasTimestamp && 
                     timestampIsRecent;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    }, 60000);
    
    test('audit log should handle null user_id for unauthenticated operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            action: fc.constantFrom('login', 'failed_login', 'scan_qr'),
            resource: fc.constantFrom('auth', 'qr_codes'),
            resource_id: fc.integer({ min: 1, max: 1000000 }),
            ip_address: fc.ipV4(),
            user_agent: fc.oneof(
              fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'),
              fc.constant('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'),
              fc.constant('PostmanRuntime/7.29.2'),
              fc.constant('curl/7.68.0'),
              fc.constant('axios/1.6.2'),
              // Generate realistic user agent strings with alphanumeric characters
              fc.stringMatching(/^[a-zA-Z0-9\/\.\-\(\) ]{10,100}$/)
            )
          }),
          async (logEntry) => {
            // Store audit log with null user_id
            const logEntryWithNullUser = {
              ...logEntry,
              user_id: null
            };
            
            await storeAuditLog(logEntryWithNullUser);
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id IS NULL AND action = ? AND resource = ? AND resource_id = ?
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              // Property 1: Audit log should exist even with null user_id
              const logExists = rows.length > 0;
              
              if (!logExists) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Property 2: User ID should be null
              const userIdIsNull = storedLog.user_id === null;
              
              // Property 3: Other fields should still be present
              const hasAction = storedLog.action === logEntry.action;
              const hasResource = storedLog.resource === logEntry.resource;
              const hasResourceId = storedLog.resource_id === logEntry.resource_id;
              const hasIpAddress = storedLog.ip_address === logEntry.ip_address;
              const hasUserAgent = storedLog.user_agent === logEntry.user_agent;
              const hasTimestamp = storedLog.timestamp !== null;
              
              return logExists && 
                     userIdIsNull && 
                     hasAction && 
                     hasResource && 
                     hasResourceId && 
                     hasIpAddress && 
                     hasUserAgent && 
                     hasTimestamp;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20, timeout: 30000 }
      );
    }, 60000);
    
    test('audit log should handle null resource_id for operations without specific resource', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4), // Use only existing user IDs
            action: fc.constantFrom('login', 'logout', 'list_patients', 'search_appointments'),
            resource: fc.constantFrom('auth', 'patients', 'appointments'),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 200 })
          }),
          async (logEntry) => {
            // Store audit log with null resource_id
            const logEntryWithNullResourceId = {
              ...logEntry,
              resource_id: null
            };
            
            await storeAuditLog(logEntryWithNullResourceId);
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id IS NULL
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource]
              );
              
              // Property: Audit log should exist even with null resource_id
              const logExists = rows.length > 0;
              
              if (!logExists) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Verify resource_id is null
              const resourceIdIsNull = storedLog.resource_id === null;
              
              // Verify other fields are present
              const hasUserId = storedLog.user_id === logEntry.user_id;
              const hasAction = storedLog.action === logEntry.action;
              const hasResource = storedLog.resource === logEntry.resource;
              
              return logExists && resourceIdIsNull && hasUserId && hasAction && hasResource;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20, timeout: 30000 }
      );
    }, 60000);
    
    test('IP address extraction should handle various request formats', () => {
      fc.assert(
        fc.property(
          fc.record({
            forwardedFor: fc.option(
              fc.ipV4().map(ip => ip), // Generate valid IP addresses only
              { nil: null }
            ),
            realIp: fc.option(fc.ipV4(), { nil: null }),
            directIp: fc.ipV4()
          }),
          (ipData) => {
            // Create mock request object
            const req = {
              headers: {},
              ip: ipData.directIp,
              connection: { remoteAddress: ipData.directIp }
            };
            
            // Add headers if present
            if (ipData.forwardedFor) {
              req.headers['x-forwarded-for'] = ipData.forwardedFor;
            }
            if (ipData.realIp) {
              req.headers['x-real-ip'] = ipData.realIp;
            }
            
            // Extract IP address
            const extractedIp = getIpAddress(req);
            
            // Property 1: Should return a non-empty string
            const isString = typeof extractedIp === 'string' && extractedIp.length > 0;
            
            // Property 2: Should prioritize X-Forwarded-For, then X-Real-IP, then direct IP
            let expectedIp;
            if (ipData.forwardedFor) {
              expectedIp = ipData.forwardedFor.split(',')[0].trim();
            } else if (ipData.realIp) {
              expectedIp = ipData.realIp;
            } else {
              expectedIp = ipData.directIp;
            }
            
            const ipMatches = extractedIp === expectedIp;
            
            return isString && ipMatches;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('user agent extraction should handle various request formats', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: null }),
          (userAgent) => {
            // Create mock request object
            const req = {
              headers: {}
            };
            
            if (userAgent) {
              req.headers['user-agent'] = userAgent;
            }
            
            // Extract user agent
            const extractedUserAgent = getUserAgent(req);
            
            // Property 1: Should return a non-empty string
            const isString = typeof extractedUserAgent === 'string' && extractedUserAgent.length > 0;
            
            // Property 2: Should return user agent if present, or 'unknown' if not
            const expectedUserAgent = userAgent || 'unknown';
            const userAgentMatches = extractedUserAgent === expectedUserAgent;
            
            return isString && userAgentMatches;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('audit log should store new_values as JSON for create operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4), // Use only existing user IDs
            action: fc.constantFrom('create_patient', 'create_appointment', 'create_payment'),
            resource: fc.constantFrom('patients', 'appointments', 'payments'),
            resource_id: fc.integer({ min: 1, max: 1000000 }),
            new_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              email: fc.emailAddress(),
              status: fc.constantFrom('active', 'pending', 'completed')
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (logEntry) => {
            // Store audit log with new_values
            await storeAuditLog(logEntry);
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id = ?
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              if (rows.length === 0) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Property 1: new_values should be stored
              const hasNewValues = storedLog.new_values !== null;
              
              if (!hasNewValues) {
                return false;
              }
              
              // Property 2: new_values should be valid JSON
              let parsedNewValues;
              try {
                parsedNewValues = JSON.parse(storedLog.new_values);
              } catch (e) {
                return false;
              }
              
              // Property 3: Parsed new_values should match original
              const newValuesMatch = JSON.stringify(parsedNewValues) === JSON.stringify(logEntry.new_values);
              
              return hasNewValues && newValuesMatch;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20, timeout: 30000 }
      );
    }, 60000);
    
    test('multiple audit logs for same user should all be stored', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4), // Use only existing user IDs
            operations: fc.array(
              fc.record({
                action: fc.constantFrom('create_patient', 'update_patient', 'delete_patient'),
                resource: fc.constant('patients'),
                resource_id: fc.integer({ min: 1, max: 1000000 })
              }),
              { minLength: 2, maxLength: 5 }
            ),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (testData) => {
            // Store multiple audit logs for the same user
            for (const operation of testData.operations) {
              await storeAuditLog({
                user_id: testData.user_id,
                action: operation.action,
                resource: operation.resource,
                resource_id: operation.resource_id,
                ip_address: testData.ip_address,
                user_agent: testData.user_agent
              });
            }
            
            // Query the database to verify all logs were stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT COUNT(*) as count FROM audit_logs 
                 WHERE user_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
                [testData.user_id]
              );
              
              // Property: Number of stored logs should be at least the number of operations
              // (may be more if there are other concurrent tests)
              const storedCount = rows[0].count;
              return storedCount >= testData.operations.length;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );
    }, 60000);
    
  });
  
});
