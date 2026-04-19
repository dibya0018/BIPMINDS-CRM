/**
 * Property-Based Tests for RBAC Permission System
 * 
 * Tests universal properties that should hold for all permission check operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 6: Permission Check Consistency
 */

const fc = require('fast-check');
const { 
  checkUserPermission, 
  clearCache, 
  getFromCache, 
  setInCache,
  getCacheKey 
} = require('../../middleware/permission');
const { getPool } = require('../../config/database');

describe('RBAC Permission System - Property-Based Tests', () => {
  
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
  
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    clearCache();
  });
  
  afterAll(async () => {
    // Clear cache after all tests
    clearCache();
  });
  
  /**
   * Feature: hospital-crm-api, Property 6: Permission Check Consistency
   * 
   * For any user with specific roles, checking the same permission multiple times
   * should return consistent results based on role-permission mappings.
   * 
   * Validates: Requirements 5.3, 5.5, 5.6
   */
  describe('Property 6: Permission Check Consistency', () => {
    
    test('checking same permission multiple times should return consistent results', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 1, max: 100 }),
            resource: fc.constantFrom('patients', 'appointments', 'doctors', 'payments', 'leads'),
            action: fc.constantFrom('create', 'read', 'update', 'delete')
          }),
          async (permissionCheck) => {
            // Clear cache to ensure fresh check
            clearCache();
            
            // Check permission multiple times
            const result1 = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            const result2 = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            const result3 = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Property 1: All results should be boolean
            const allBoolean = typeof result1 === 'boolean' && 
                              typeof result2 === 'boolean' && 
                              typeof result3 === 'boolean';
            
            // Property 2: All results should be identical (consistency)
            const allConsistent = result1 === result2 && result2 === result3;
            
            return allBoolean && allConsistent;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    }, 60000);
    
    test('permission check should use cache on subsequent calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 1, max: 100 }),
            resource: fc.constantFrom('patients', 'appointments', 'doctors'),
            action: fc.constantFrom('create', 'read', 'update', 'delete')
          }),
          async (permissionCheck) => {
            // Clear cache to ensure fresh start
            clearCache();
            
            // First call - should query database
            const result1 = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Check if result is now in cache
            const cachedResult = getFromCache(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Property 1: Result should be cached after first call
            const isCached = cachedResult !== null;
            
            // Property 2: Cached result should match first result
            const cacheMatches = cachedResult === result1;
            
            // Second call - should use cache
            const result2 = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Property 3: Second result should match first result
            const resultsMatch = result1 === result2;
            
            return isCached && cacheMatches && resultsMatch;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    }, 60000);
    
    test('cache key generation should be deterministic', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            resource: fc.string({ minLength: 1, maxLength: 50 }),
            action: fc.string({ minLength: 1, maxLength: 20 })
          }),
          (data) => {
            // Generate cache key multiple times
            const key1 = getCacheKey(data.userId, data.resource, data.action);
            const key2 = getCacheKey(data.userId, data.resource, data.action);
            const key3 = getCacheKey(data.userId, data.resource, data.action);
            
            // Property 1: All keys should be strings
            const allStrings = typeof key1 === 'string' && 
                              typeof key2 === 'string' && 
                              typeof key3 === 'string';
            
            // Property 2: All keys should be identical (deterministic)
            const allIdentical = key1 === key2 && key2 === key3;
            
            // Property 3: Key should contain user ID, resource, and action
            const containsUserId = key1.includes(String(data.userId));
            const containsResource = key1.includes(data.resource);
            const containsAction = key1.includes(data.action);
            
            return allStrings && allIdentical && containsUserId && containsResource && containsAction;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('different permission checks should have different cache keys', async () => {
      await fc.assert(
        fc.property(
          fc.tuple(
            fc.record({
              userId: fc.integer({ min: 1, max: 1000000 }),
              resource: fc.constantFrom('patients', 'appointments', 'doctors'),
              action: fc.constantFrom('create', 'read')
            }),
            fc.record({
              userId: fc.integer({ min: 1, max: 1000000 }),
              resource: fc.constantFrom('payments', 'leads', 'users'),
              action: fc.constantFrom('update', 'delete')
            })
          ),
          ([check1, check2]) => {
            // Generate cache keys for different permission checks
            const key1 = getCacheKey(check1.userId, check1.resource, check1.action);
            const key2 = getCacheKey(check2.userId, check2.resource, check2.action);
            
            // Property: Keys should be different (unless by chance they're identical)
            // We check that the keys are different OR the inputs are identical
            const keysAreDifferent = key1 !== key2;
            const inputsAreIdentical = check1.userId === check2.userId && 
                                      check1.resource === check2.resource && 
                                      check1.action === check2.action;
            
            return keysAreDifferent || inputsAreIdentical;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('cache set and get should be consistent', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            resource: fc.string({ minLength: 1, maxLength: 50 }),
            action: fc.string({ minLength: 1, maxLength: 20 }),
            hasPermission: fc.boolean()
          }),
          (data) => {
            // Clear cache first
            clearCache();
            
            // Set permission in cache
            setInCache(data.userId, data.resource, data.action, data.hasPermission);
            
            // Get permission from cache
            const cachedValue = getFromCache(data.userId, data.resource, data.action);
            
            // Property 1: Cached value should not be null
            const isNotNull = cachedValue !== null;
            
            // Property 2: Cached value should match what was set
            const valuesMatch = cachedValue === data.hasPermission;
            
            return isNotNull && valuesMatch;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('permission check should return boolean for any valid input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 1, max: 100 }),
            resource: fc.constantFrom('patients', 'appointments', 'doctors', 'payments', 'leads', 'users', 'settings'),
            action: fc.constantFrom('create', 'read', 'update', 'delete')
          }),
          async (permissionCheck) => {
            // Clear cache to ensure database query
            clearCache();
            
            // Check permission
            const result = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Property: Result should always be a boolean
            return typeof result === 'boolean';
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    }, 60000);
    
    test('permission check for same user and resource but different actions may differ', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 1, max: 50 }),
            resource: fc.constantFrom('patients', 'appointments', 'doctors')
          }),
          async (data) => {
            // Clear cache
            clearCache();
            
            // Check different actions for same user and resource
            const canCreate = await checkUserPermission(data.userId, data.resource, 'create');
            const canRead = await checkUserPermission(data.userId, data.resource, 'read');
            const canUpdate = await checkUserPermission(data.userId, data.resource, 'update');
            const canDelete = await checkUserPermission(data.userId, data.resource, 'delete');
            
            // Property 1: All results should be boolean
            const allBoolean = typeof canCreate === 'boolean' && 
                              typeof canRead === 'boolean' && 
                              typeof canUpdate === 'boolean' && 
                              typeof canDelete === 'boolean';
            
            // Property 2: Results may be different (different actions may have different permissions)
            // This is valid - we just check that they're all boolean
            
            return allBoolean;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    }, 60000);
    
    test('permission check should handle non-existent users gracefully', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 1000000, max: 9999999 }), // Very high IDs unlikely to exist
            resource: fc.constantFrom('patients', 'appointments'),
            action: fc.constantFrom('create', 'read')
          }),
          async (permissionCheck) => {
            // Clear cache
            clearCache();
            
            // Check permission for non-existent user
            const result = await checkUserPermission(
              permissionCheck.userId,
              permissionCheck.resource,
              permissionCheck.action
            );
            
            // Property 1: Result should be boolean
            const isBoolean = typeof result === 'boolean';
            
            // Property 2: Result should be false (non-existent users have no permissions)
            const isFalse = result === false;
            
            return isBoolean && isFalse;
          }
        ),
        { numRuns: 20, timeout: 30000 }
      );
    }, 60000);
    
  });
  
});
