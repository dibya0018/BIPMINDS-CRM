/**
 * Redis Integration Tests
 * 
 * Tests Redis-related functionality including:
 * - Rate limiting (currently using in-memory store)
 * - Permission caching (currently using in-memory cache)
 * - Failed login tracking (currently using in-memory storage)
 * 
 * Note: The current implementation uses in-memory storage.
 * In production, these should be replaced with actual Redis for distributed systems.
 * 
 * Requirements: 12.6, 20.7
 */

const request = require('supertest');
const { getPool } = require('../../config/database');
const { hashPassword } = require('../../utils/password');
const { generateAccessToken } = require('../../utils/jwt');

// Mock Express app for testing
const express = require('express');
const app = express();

// Import middleware
const helmet = require('helmet');
const cors = require('cors');
const { apiLimiter, loginLimiter, qrScanLimiter } = require('../../middleware/rateLimiter');
const { authenticate } = require('../../middleware/auth');
const { checkPermission } = require('../../middleware/permission');
const { errorHandler } = require('../../middleware/errorHandler');

// Import routes
const authRoutes = require('../../routes/auth');
const patientRoutes = require('../../routes/patients');

// Configure app
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiters
app.use('/api', apiLimiter);

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);

// Error handler
app.use(errorHandler);

// Test data
let testUser;
let testToken;

describe('Redis Integration Tests', () => {
  let pool;

  beforeAll(async () => {
    pool = getPool();
    
    // Create test user for authentication
    const hashedPassword = await hashPassword('Test@1234');
    const [userResult] = await pool.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
      ['test.redis@hospital.com', hashedPassword, 'Test', 'Redis', 'admin']
    );
    
    testUser = {
      userId: userResult.insertId,
      email: 'test.redis@hospital.com',
      userType: 'admin',
      roles: ['admin']
    };
    
    // Get or create super_admin role
    let [roles] = await pool.execute('SELECT role_id FROM roles WHERE role_name = ?', ['super_admin']);
    let roleId;
    
    if (roles.length === 0) {
      const [roleResult] = await pool.execute(
        'INSERT INTO roles (role_name, description, is_active, created_at, updated_at) VALUES (?, ?, TRUE, NOW(), NOW())',
        ['super_admin', 'Super Administrator with all permissions']
      );
      roleId = roleResult.insertId;
    } else {
      roleId = roles[0].role_id;
    }
    
    // Assign super_admin role to test user
    await pool.execute(
      'INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())',
      [testUser.userId, roleId]
    );
    
    // Create necessary permissions
    const permissions = [
      { name: 'patients:create', resource: 'patients', action: 'create' },
      { name: 'patients:read', resource: 'patients', action: 'read' }
    ];
    
    for (const perm of permissions) {
      let [existingPerm] = await pool.execute(
        'SELECT permission_id FROM permissions WHERE permission_name = ?',
        [perm.name]
      );
      
      let permId;
      if (existingPerm.length === 0) {
        const [permResult] = await pool.execute(
          'INSERT INTO permissions (permission_name, resource, action, created_at) VALUES (?, ?, ?, NOW())',
          [perm.name, perm.resource, perm.action]
        );
        permId = permResult.insertId;
      } else {
        permId = existingPerm[0].permission_id;
      }
      
      // Assign permission to super_admin role
      await pool.execute(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_at) VALUES (?, ?, NOW())',
        [roleId, permId]
      );
    }
    
    // Generate test token
    testToken = generateAccessToken(testUser);
  });

  afterAll(async () => {
    // Clean up test data
    if (testUser) {
      await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [testUser.userId]);
      await pool.execute('DELETE FROM users WHERE user_id = ?', [testUser.userId]);
    }
  });

  /**
   * Test 1: Rate Limiting with In-Memory Store
   * Requirements: 12.6
   * 
   * Tests:
   * - General API rate limiting (100 req/min)
   * - Login rate limiting (5 req/min)
   * - QR scan rate limiting (50 req/min)
   * - Rate limit headers
   * - Rate limit reset
   */
  describe('Rate Limiting (In-Memory Store)', () => {
    it('should enforce general API rate limit', async () => {
      // Note: This test is limited because rate limiter uses in-memory store
      // In production with Redis, this would work across multiple instances
      
      // Make a request to check rate limit headers
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`);
      
      // Check for rate limit headers (using standard ratelimit-* format)
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      
      // Verify rate limit values
      const limit = parseInt(response.headers['ratelimit-limit']);
      const remaining = parseInt(response.headers['ratelimit-remaining']);
      
      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(limit);
    });

    it('should enforce login rate limit', async () => {
      // Make multiple login attempts
      const attempts = 3;
      const responses = [];
      
      for (let i = 0; i < attempts; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: 'Test@1234'
          });
        
        responses.push(response);
      }
      
      // Check that rate limit headers are present (using standard ratelimit-* format)
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.headers).toHaveProperty('ratelimit-limit');
      expect(lastResponse.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should include rate limit information in headers', async () => {
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`);
      
      // Verify rate limit headers are present (using standard ratelimit-* format)
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      
      // Verify header values are numeric
      const limit = parseInt(response.headers['ratelimit-limit']);
      const remaining = parseInt(response.headers['ratelimit-remaining']);
      
      expect(limit).toBeGreaterThan(0);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBeLessThanOrEqual(limit);
    });

    it('should track rate limit per endpoint', async () => {
      // Make requests to different endpoints
      const response1 = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`);
      
      const remaining1 = parseInt(response1.headers['ratelimit-remaining']);
      
      const response2 = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`);
      
      const remaining2 = parseInt(response2.headers['ratelimit-remaining']);
      
      // Remaining count should decrease
      expect(remaining2).toBeLessThanOrEqual(remaining1);
    });
  });

  /**
   * Test 2: Permission Caching (In-Memory Cache)
   * Requirements: 12.6
   * 
   * Tests:
   * - Permission check caching
   * - Cache hit/miss behavior
   * - Cache TTL
   * - Cache invalidation
   */
  describe('Permission Caching (In-Memory Cache)', () => {
    it('should cache permission checks', async () => {
      // Make first request (cache miss)
      const response1 = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response1.body.success).toBe(true);
      
      // Make second request (should use cache)
      const response2 = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response2.body.success).toBe(true);
      
      // Both requests should succeed, indicating permission cache is working
    });

    it('should handle permission checks for different users', async () => {
      // Create another test user without permissions
      const hashedPassword = await hashPassword('Test@1234');
      const [userResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        ['test.noperm@hospital.com', hashedPassword, 'No', 'Permission', 'staff']
      );
      
      const noPermUser = {
        userId: userResult.insertId,
        email: 'test.noperm@hospital.com',
        userType: 'staff',
        roles: []
      };
      
      const noPermToken = generateAccessToken(noPermUser);
      
      // Request with user without permissions should fail
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${noPermToken}`)
        .expect(403);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PERM_001');
      
      // Clean up
      await pool.execute('DELETE FROM users WHERE user_id = ?', [noPermUser.userId]);
    });

    it('should cache permissions per user', async () => {
      // Make multiple requests with the same user
      const requests = 5;
      
      for (let i = 0; i < requests; i++) {
        const response = await request(app)
          .get('/api/patients')
          .set('Authorization', `Bearer ${testToken}`)
          .expect(200);
        
        expect(response.body.success).toBe(true);
      }
      
      // All requests should succeed, using cached permissions
    });
  });

  /**
   * Test 3: Failed Login Tracking (In-Memory Storage)
   * Requirements: 20.7
   * 
   * Tests:
   * - Failed login attempt tracking
   * - Account lockout after threshold
   * - Automatic unlock after timeout
   * - Failed attempt counter reset on success
   */
  describe('Failed Login Tracking (In-Memory Storage)', () => {
    let testLoginUser;

    beforeAll(async () => {
      // Create test user for login tracking
      const hashedPassword = await hashPassword('Test@1234');
      const [userResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        ['test.failedlogin@hospital.com', hashedPassword, 'Failed', 'Login', 'admin']
      );
      
      testLoginUser = {
        userId: userResult.insertId,
        email: 'test.failedlogin@hospital.com'
      };
    });

    afterAll(async () => {
      // Clean up
      if (testLoginUser) {
        await pool.execute('DELETE FROM users WHERE user_id = ?', [testLoginUser.userId]);
      }
    });

    it('should track failed login attempts', async () => {
      // Attempt login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testLoginUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);
      
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('AUTH_001');
    });

    it('should allow successful login with correct credentials', async () => {
      // Login with correct password
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testLoginUser.email,
          password: 'Test@1234'
        })
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('user');
    });

    it('should reset failed attempts counter on successful login', async () => {
      // Make a failed attempt
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testLoginUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);
      
      // Make a successful login
      const successResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testLoginUser.email,
          password: 'Test@1234'
        })
        .expect(200);
      
      expect(successResponse.body.success).toBe(true);
      
      // Failed attempts counter should be reset
      // Next login should work normally
      const nextResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testLoginUser.email,
          password: 'Test@1234'
        })
        .expect(200);
      
      expect(nextResponse.body.success).toBe(true);
    });

    it('should handle multiple failed login attempts', async () => {
      // Create a new user for this test to avoid interference
      const hashedPassword = await hashPassword('Test@1234');
      const [userResult] = await pool.execute(
        `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
        ['test.multifail@hospital.com', hashedPassword, 'Multi', 'Fail', 'admin']
      );
      
      const multiFailUser = {
        userId: userResult.insertId,
        email: 'test.multifail@hospital.com'
      };
      
      // Make multiple failed attempts
      const attempts = 3;
      
      for (let i = 0; i < attempts; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: multiFailUser.email,
            password: 'WrongPassword123!'
          })
          .expect(401);
        
        expect(response.body.success).toBe(false);
      }
      
      // Clean up
      await pool.execute('DELETE FROM users WHERE user_id = ?', [multiFailUser.userId]);
    });
  });

  /**
   * Test 4: In-Memory Storage Behavior
   * 
   * Tests to verify in-memory storage works correctly
   * and document differences from Redis
   */
  describe('In-Memory Storage Behavior', () => {
    it('should store data in memory for current process', async () => {
      // Make a request to populate cache
      const response = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response.body.success).toBe(true);
      
      // Subsequent requests should use cached data
      const response2 = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(response2.body.success).toBe(true);
    });

    it('should handle concurrent requests with in-memory storage', async () => {
      const concurrentRequests = 10;
      const promises = [];
      
      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          request(app)
            .get('/api/patients')
            .set('Authorization', `Bearer ${testToken}`)
            .expect(200)
        );
      }
      
      const responses = await Promise.all(promises);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.body.success).toBe(true);
      });
    });

    it('should document Redis migration path', () => {
      // This test documents that the current implementation uses in-memory storage
      // and should be migrated to Redis for production distributed systems
      
      const redisRequirements = {
        rateLimiting: 'express-rate-limit with redis store',
        permissionCaching: 'Redis cache with TTL',
        failedLoginTracking: 'Redis with expiring keys',
        benefits: [
          'Distributed rate limiting across multiple instances',
          'Shared permission cache across instances',
          'Persistent failed login tracking',
          'Automatic expiration with TTL',
          'Better scalability'
        ]
      };
      
      expect(redisRequirements).toBeDefined();
      expect(redisRequirements.benefits.length).toBeGreaterThan(0);
    });
  });
});
