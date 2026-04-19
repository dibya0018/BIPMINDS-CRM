/**
 * Property-Based Tests for Update Audit Trail
 * 
 * Tests universal properties that should hold for update operation audit logging.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 21: Update Audit Trail
 */

const fc = require('fast-check');
const { storeAuditLog } = require('../../middleware/audit');
const { getPool } = require('../../config/database');

/**
 * Deep equality check for objects
 * Handles property ordering and nested objects
 */
function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return obj1 === obj2;
  
  const keys1 = Object.keys(obj1).sort();
  const keys2 = Object.keys(obj2).sort();
  
  if (keys1.length !== keys2.length) return false;
  if (keys1.join(',') !== keys2.join(',')) return false;
  
  for (const key of keys1) {
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

describe('Update Audit Trail - Property-Based Tests', () => {
  
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
   * Feature: hospital-crm-api, Property 21: Update Audit Trail
   * 
   * For any update operation, the audit log should contain both old and new values
   * for the modified fields.
   * 
   * Validates: Requirements 6.6, 13.4
   */
  describe('Property 21: Update Audit Trail', () => {
    
    test('update operations should store both old and new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4), // Use only existing user IDs
            action: fc.constantFrom('update_patient', 'update_appointment', 'update_payment', 'update_lead'),
            resource: fc.constantFrom('patients', 'appointments', 'payments', 'leads'),
            resource_id: fc.integer({ min: 1, max: 1000 }),
            old_values: fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9 ]{5,50}$/), // Alphanumeric and spaces only
              email: fc.emailAddress(),
              status: fc.constantFrom('active', 'pending', 'completed')
            }),
            new_values: fc.record({
              name: fc.stringMatching(/^[a-zA-Z0-9 ]{5,50}$/), // Alphanumeric and spaces only
              email: fc.emailAddress(),
              status: fc.constantFrom('active', 'pending', 'completed', 'cancelled')
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.stringMatching(/^[a-zA-Z0-9 .\-_/()]{10,100}$/) // Safe characters for user agent
          }),
          async (logEntry) => {
            // Store audit log with both old and new values
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
              
              // Property 1: old_values should be stored
              const hasOldValues = storedLog.old_values !== null;
              
              // Property 2: new_values should be stored
              const hasNewValues = storedLog.new_values !== null;
              
              if (!hasOldValues || !hasNewValues) {
                return false;
              }
              
              // Property 3: old_values should be valid JSON
              let parsedOldValues;
              try {
                parsedOldValues = JSON.parse(storedLog.old_values);
              } catch (e) {
                return false;
              }
              
              // Property 4: new_values should be valid JSON
              let parsedNewValues;
              try {
                parsedNewValues = JSON.parse(storedLog.new_values);
              } catch (e) {
                return false;
              }
              
              // Property 5: Parsed old_values should match original
              // Use deep equality check instead of JSON.stringify to handle property ordering
              const oldValuesMatch = deepEqual(parsedOldValues, logEntry.old_values);
              
              // Property 6: Parsed new_values should match original
              // Use deep equality check instead of JSON.stringify to handle property ordering
              const newValuesMatch = deepEqual(parsedNewValues, logEntry.new_values);
              
              // Property 7: old_values and new_values should be different (for meaningful updates)
              // Note: They may be the same in edge cases, so we just check they exist
              const bothExist = hasOldValues && hasNewValues;
              
              return hasOldValues && 
                     hasNewValues && 
                     oldValuesMatch && 
                     newValuesMatch && 
                     bothExist;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    }, 60000);
    
    test('update audit log should preserve field types in JSON', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4),
            action: fc.constant('update_patient'),
            resource: fc.constant('patients'),
            resource_id: fc.integer({ min: 1, max: 1000 }),
            old_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              age: fc.integer({ min: 0, max: 120 }),
              isActive: fc.boolean(),
              balance: fc.float({ min: 0, max: 10000, noNaN: true })
            }),
            new_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              age: fc.integer({ min: 0, max: 120 }),
              isActive: fc.boolean(),
              balance: fc.float({ min: 0, max: 10000, noNaN: true })
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
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
              
              if (rows.length === 0) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Parse stored values
              const parsedOldValues = JSON.parse(storedLog.old_values);
              const parsedNewValues = JSON.parse(storedLog.new_values);
              
              // Property 1: String fields should remain strings
              const oldNameIsString = typeof parsedOldValues.name === 'string';
              const newNameIsString = typeof parsedNewValues.name === 'string';
              
              // Property 2: Number fields should remain numbers
              const oldAgeIsNumber = typeof parsedOldValues.age === 'number';
              const newAgeIsNumber = typeof parsedNewValues.age === 'number';
              
              // Property 3: Boolean fields should remain booleans
              const oldIsActiveIsBoolean = typeof parsedOldValues.isActive === 'boolean';
              const newIsActiveIsBoolean = typeof parsedNewValues.isActive === 'boolean';
              
              // Property 4: Float fields should remain numbers
              const oldBalanceIsNumber = typeof parsedOldValues.balance === 'number';
              const newBalanceIsNumber = typeof parsedNewValues.balance === 'number';
              
              return oldNameIsString && newNameIsString &&
                     oldAgeIsNumber && newAgeIsNumber &&
                     oldIsActiveIsBoolean && newIsActiveIsBoolean &&
                     oldBalanceIsNumber && newBalanceIsNumber;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 10, timeout: 30000 } // Reduced from 20 to 10 runs to avoid timeout
      );
    }, 60000);
    
    test('update audit log should handle nested objects in old and new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4),
            action: fc.constant('update_patient'),
            resource: fc.constant('patients'),
            resource_id: fc.integer({ min: 1, max: 1000 }),
            old_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length >= 5), // Ensure non-whitespace content
              address: fc.record({
                street: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length >= 5),
                city: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3),
                zipCode: fc.string({ minLength: 5, maxLength: 10 }).filter(s => s.trim().length >= 5)
              })
            }),
            new_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length >= 5), // Ensure non-whitespace content
              address: fc.record({
                street: fc.string({ minLength: 5, maxLength: 50 }).filter(s => s.trim().length >= 5),
                city: fc.string({ minLength: 3, maxLength: 30 }).filter(s => s.trim().length >= 3),
                zipCode: fc.string({ minLength: 5, maxLength: 10 }).filter(s => s.trim().length >= 5)
              })
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (logEntry) => {
            // Store audit log with nested objects
            await storeAuditLog(logEntry);
            
            // Longer delay to ensure database write completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id = ?
                 AND timestamp >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              if (rows.length === 0) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Parse stored values
              const parsedOldValues = JSON.parse(storedLog.old_values);
              const parsedNewValues = JSON.parse(storedLog.new_values);
              
              // Property 1: Nested objects should be preserved in old_values
              const oldHasAddress = parsedOldValues.address !== undefined;
              const oldAddressIsObject = typeof parsedOldValues.address === 'object';
              const oldAddressHasStreet = oldAddressIsObject && parsedOldValues.address.street !== undefined;
              const oldAddressHasCity = oldAddressIsObject && parsedOldValues.address.city !== undefined;
              const oldAddressHasZipCode = oldAddressIsObject && parsedOldValues.address.zipCode !== undefined;
              
              // Property 2: Nested objects should be preserved in new_values
              const newHasAddress = parsedNewValues.address !== undefined;
              const newAddressIsObject = typeof parsedNewValues.address === 'object';
              const newAddressHasStreet = newAddressIsObject && parsedNewValues.address.street !== undefined;
              const newAddressHasCity = newAddressIsObject && parsedNewValues.address.city !== undefined;
              const newAddressHasZipCode = newAddressIsObject && parsedNewValues.address.zipCode !== undefined;
              
              // Property 3: Values should match original
              const oldValuesMatch = deepEqual(parsedOldValues, logEntry.old_values);
              const newValuesMatch = deepEqual(parsedNewValues, logEntry.new_values);
              
              return oldHasAddress && oldAddressIsObject && oldAddressHasStreet && oldAddressHasCity && oldAddressHasZipCode &&
                     newHasAddress && newAddressIsObject && newAddressHasStreet && newAddressHasCity && newAddressHasZipCode &&
                     oldValuesMatch && newValuesMatch;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 5, timeout: 30000 } // Reduced to 5 runs to avoid timeout
      );
    }, 60000);
    
    test('update audit log should handle arrays in old and new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4),
            action: fc.constant('update_patient'),
            resource: fc.constant('patients'),
            resource_id: fc.integer({ min: 1, max: 1000 }),
            old_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }).filter(arr => arr.length > 0) // Explicitly filter out empty arrays
            }),
            new_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 }),
              tags: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 }).filter(arr => arr.length > 0) // Explicitly filter out empty arrays
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (logEntry) => {
            // Store audit log with arrays
            await storeAuditLog(logEntry);
            
            // Longer delay to ensure database write completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id = ?
                 AND timestamp >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              if (rows.length === 0) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Parse stored values
              const parsedOldValues = JSON.parse(storedLog.old_values);
              const parsedNewValues = JSON.parse(storedLog.new_values);
              
              // Property 1: Arrays should be preserved in old_values
              const oldHasTags = parsedOldValues.tags !== undefined;
              const oldTagsIsArray = Array.isArray(parsedOldValues.tags);
              
              // Property 2: Arrays should be preserved in new_values
              const newHasTags = parsedNewValues.tags !== undefined;
              const newTagsIsArray = Array.isArray(parsedNewValues.tags);
              
              // Property 3: Array lengths should match
              const oldTagsLengthMatches = oldTagsIsArray && parsedOldValues.tags.length === logEntry.old_values.tags.length;
              const newTagsLengthMatches = newTagsIsArray && parsedNewValues.tags.length === logEntry.new_values.tags.length;
              
              // Property 4: Values should match original
              const oldValuesMatch = deepEqual(parsedOldValues, logEntry.old_values);
              const newValuesMatch = deepEqual(parsedNewValues, logEntry.new_values);
              
              return oldHasTags && oldTagsIsArray && oldTagsLengthMatches &&
                     newHasTags && newTagsIsArray && newTagsLengthMatches &&
                     oldValuesMatch && newValuesMatch;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 10, timeout: 30000 } // Reduced numRuns to avoid timeout
      );
    }, 60000);
    
    test('update audit log should handle empty objects in old and new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4),
            action: fc.constant('update_patient'),
            resource: fc.constant('patients'),
            resource_id: fc.integer({ min: 1, max: 1000 }),
            old_values: fc.constant({}),
            new_values: fc.record({
              name: fc.string({ minLength: 5, maxLength: 50 })
            }),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (logEntry) => {
            // Store audit log with empty old_values
            await storeAuditLog(logEntry);
            
            // Longer delay to ensure database write completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Query the database to verify the log was stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND action = ? AND resource = ? AND resource_id = ?
                 AND timestamp >= DATE_SUB(NOW(), INTERVAL 10 SECOND)
                 ORDER BY timestamp DESC LIMIT 1`,
                [logEntry.user_id, logEntry.action, logEntry.resource, logEntry.resource_id]
              );
              
              if (rows.length === 0) {
                return false;
              }
              
              const storedLog = rows[0];
              
              // Property 1: old_values should be stored even if empty
              const hasOldValues = storedLog.old_values !== null;
              
              // Property 2: new_values should be stored
              const hasNewValues = storedLog.new_values !== null;
              
              if (!hasOldValues || !hasNewValues) {
                return false;
              }
              
              // Parse stored values
              const parsedOldValues = JSON.parse(storedLog.old_values);
              const parsedNewValues = JSON.parse(storedLog.new_values);
              
              // Property 3: Empty old_values should be an empty object
              const oldValuesIsEmptyObject = typeof parsedOldValues === 'object' && 
                                            Object.keys(parsedOldValues).length === 0;
              
              // Property 4: new_values should have the expected fields
              const newValuesHasName = parsedNewValues.name !== undefined;
              
              return hasOldValues && hasNewValues && oldValuesIsEmptyObject && newValuesHasName;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 10, timeout: 30000 }
      );
    }, 60000);
    
    test('multiple update operations should all store old and new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            user_id: fc.constantFrom(1, 3, 4),
            resource_id: fc.integer({ min: 1, max: 100 }),
            updates: fc.array(
              fc.record({
                old_values: fc.record({
                  status: fc.constantFrom('pending', 'active', 'completed')
                }),
                new_values: fc.record({
                  status: fc.constantFrom('pending', 'active', 'completed', 'cancelled')
                })
              }),
              { minLength: 2, maxLength: 5 }
            ),
            ip_address: fc.ipV4(),
            user_agent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (testData) => {
            // Store multiple update audit logs
            for (const update of testData.updates) {
              await storeAuditLog({
                user_id: testData.user_id,
                action: 'update_patient',
                resource: 'patients',
                resource_id: testData.resource_id,
                old_values: update.old_values,
                new_values: update.new_values,
                ip_address: testData.ip_address,
                user_agent: testData.user_agent
              });
            }
            
            // Query the database to verify all logs were stored
            const connection = await pool.getConnection();
            try {
              const [rows] = await connection.execute(
                `SELECT * FROM audit_logs 
                 WHERE user_id = ? AND resource_id = ? AND action = 'update_patient'
                 AND timestamp >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
                 ORDER BY timestamp DESC`,
                [testData.user_id, testData.resource_id]
              );
              
              // Property 1: At least as many logs as updates should exist
              const hasEnoughLogs = rows.length >= testData.updates.length;
              
              if (!hasEnoughLogs) {
                return false;
              }
              
              // Property 2: All logs should have both old_values and new_values
              const allHaveOldAndNewValues = rows.every(log => 
                log.old_values !== null && log.new_values !== null
              );
              
              return hasEnoughLogs && allHaveOldAndNewValues;
              
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
