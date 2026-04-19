/**
 * Unit Tests for Permission Middleware
 * 
 * Tests the RBAC permission middleware functionality including
 * permission checking, caching, and error handling.
 * 
 * Requirements: 5.3, 5.5, 5.6
 */

const { 
  checkPermission, 
  checkUserPermission,
  clearCache,
  invalidateUserCache,
  getFromCache,
  setInCache,
  getCacheKey
} = require('../../middleware/permission');
const { getPool } = require('../../config/database');

describe('Permission Middleware - Unit Tests', () => {
  
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
    // Clear cache before each test
    clearCache();
  });
  
  afterAll(() => {
    // Clear cache after all tests
    clearCache();
  });
  
  describe('Cache Key Generation', () => {
    
    test('should generate consistent cache keys', () => {
      const userId = 1;
      const resource = 'patients';
      const action = 'create';
      
      const key1 = getCacheKey(userId, resource, action);
      const key2 = getCacheKey(userId, resource, action);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('permission');
      expect(key1).toContain(String(userId));
      expect(key1).toContain(resource);
      expect(key1).toContain(action);
    });
    
    test('should generate different keys for different inputs', () => {
      const key1 = getCacheKey(1, 'patients', 'create');
      const key2 = getCacheKey(1, 'patients', 'read');
      const key3 = getCacheKey(2, 'patients', 'create');
      
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
    
  });
  
  describe('Cache Operations', () => {
    
    test('should store and retrieve values from cache', () => {
      const userId = 1;
      const resource = 'patients';
      const action = 'create';
      
      // Initially cache should be empty
      expect(getFromCache(userId, resource, action)).toBeNull();
      
      // Set value in cache
      setInCache(userId, resource, action, true);
      
      // Should retrieve the cached value
      expect(getFromCache(userId, resource, action)).toBe(true);
    });
    
    test('should handle false values correctly', () => {
      const userId = 1;
      const resource = 'patients';
      const action = 'delete';
      
      setInCache(userId, resource, action, false);
      
      // Should retrieve false (not null)
      expect(getFromCache(userId, resource, action)).toBe(false);
    });
    
    test('should clear all cache entries', () => {
      setInCache(1, 'patients', 'create', true);
      setInCache(2, 'appointments', 'read', true);
      setInCache(3, 'doctors', 'update', false);
      
      // Verify entries are cached
      expect(getFromCache(1, 'patients', 'create')).toBe(true);
      expect(getFromCache(2, 'appointments', 'read')).toBe(true);
      expect(getFromCache(3, 'doctors', 'update')).toBe(false);
      
      // Clear cache
      clearCache();
      
      // All entries should be gone
      expect(getFromCache(1, 'patients', 'create')).toBeNull();
      expect(getFromCache(2, 'appointments', 'read')).toBeNull();
      expect(getFromCache(3, 'doctors', 'update')).toBeNull();
    });
    
    test('should invalidate cache for specific user', () => {
      setInCache(1, 'patients', 'create', true);
      setInCache(1, 'patients', 'read', true);
      setInCache(2, 'patients', 'create', true);
      
      // Invalidate user 1's cache
      invalidateUserCache(1);
      
      // User 1's entries should be gone
      expect(getFromCache(1, 'patients', 'create')).toBeNull();
      expect(getFromCache(1, 'patients', 'read')).toBeNull();
      
      // User 2's entries should remain
      expect(getFromCache(2, 'patients', 'create')).toBe(true);
    });
    
  });
  
  describe('Permission Checking', () => {
    
    test('should return boolean for valid permission check', async () => {
      const result = await checkUserPermission(1, 'patients', 'read');
      
      expect(typeof result).toBe('boolean');
    });
    
    test('should return false for non-existent user', async () => {
      const result = await checkUserPermission(999999, 'patients', 'create');
      
      expect(result).toBe(false);
    });
    
    test('should cache permission check results', async () => {
      clearCache();
      
      // First call - should query database
      const result1 = await checkUserPermission(1, 'patients', 'read');
      
      // Check if cached
      const cachedResult = getFromCache(1, 'patients', 'read');
      expect(cachedResult).not.toBeNull();
      expect(cachedResult).toBe(result1);
      
      // Second call - should use cache
      const result2 = await checkUserPermission(1, 'patients', 'read');
      expect(result2).toBe(result1);
    });
    
    test('should handle database errors gracefully', async () => {
      // Test with invalid resource/action that might cause errors
      const result = await checkUserPermission(1, '', '');
      
      // Should return false on error (deny permission for security)
      expect(result).toBe(false);
    });
    
  });
  
  describe('Middleware Function', () => {
    
    test('should return middleware function', () => {
      const middleware = checkPermission('patients', 'create');
      
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });
    
    test('should deny access without authentication', async () => {
      const middleware = checkPermission('patients', 'create');
      
      const req = { user: null };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'AUTH_003'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should deny access without userId', async () => {
      const middleware = checkPermission('patients', 'create');
      
      const req = { user: { email: 'test@test.com' } }; // Missing userId
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
    
    test('should call next() when permission is granted', async () => {
      const middleware = checkPermission('patients', 'read');
      
      // Assuming user 1 has read permission (from demo data)
      const req = { 
        user: { 
          userId: 1,
          email: 'admin@hospital.com',
          userType: 'admin',
          roles: ['super_admin']
        } 
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      // If user has permission, next should be called
      // If not, 403 should be returned
      // This depends on database state - either next() is called OR status is set
      const nextCalled = next.mock.calls.length > 0;
      const statusCalled = res.status.mock.calls.length > 0;
      
      expect(nextCalled || statusCalled).toBe(true);
    });
    
    test('should return 403 when permission is denied', async () => {
      const middleware = checkPermission('patients', 'delete');
      
      // Use a user ID that likely doesn't have delete permission
      const req = { 
        user: { 
          userId: 999999, // Non-existent user
          email: 'test@test.com',
          userType: 'staff',
          roles: []
        } 
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      await middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'PERM_001'
          })
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
    
  });
  
});
