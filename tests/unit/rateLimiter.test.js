/**
 * Unit Tests for Rate Limiting Middleware
 * 
 * Tests specific rate limit configurations for different endpoints.
 * 
 * Requirements: 12.1, 12.2, 12.3
 */

const express = require('express');
const request = require('supertest');
const { apiLimiter, loginLimiter, qrScanLimiter } = require('../../middleware/rateLimiter');

/**
 * Helper function to create a test Express app with rate limiter
 * @param {Function} limiter - Rate limiter middleware
 * @returns {Express.Application} Express app
 */
function createTestApp(limiter) {
  const app = express();
  app.set('trust proxy', 1); // Trust first proxy for testing
  app.use(limiter);
  app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Request successful' });
  });
  return app;
}

/**
 * Helper function to make multiple requests
 * @param {Express.Application} app - Express app
 * @param {number} count - Number of requests to make
 * @param {string} ip - IP address to use
 * @returns {Promise<Array>} Array of response objects
 */
async function makeRequests(app, count, ip = '127.0.0.1') {
  const results = [];
  for (let i = 0; i < count; i++) {
    const response = await request(app)
      .get('/test')
      .set('X-Forwarded-For', ip);
    results.push(response);
  }
  return results;
}

describe('Rate Limiter Middleware - Unit Tests', () => {
  
  /**
   * Test general API rate limiter (100 req/min)
   * Requirements: 12.1
   */
  describe('apiLimiter - General API Rate Limit (100 req/min)', () => {
    
    test('should allow up to 100 requests per minute', async () => {
      const app = createTestApp(apiLimiter);
      const ip = '192.168.1.100';
      
      // Make 100 requests
      const results = await makeRequests(app, 100, ip);
      
      // All 100 requests should succeed
      const allSuccessful = results.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
    }, 60000);
    
    test('should block requests exceeding 100 per minute', async () => {
      const app = createTestApp(apiLimiter);
      const ip = '192.168.1.101';
      
      // Make 105 requests (5 over limit)
      const results = await makeRequests(app, 105, ip);
      
      // First 100 should succeed
      const first100Successful = results.slice(0, 100).every(r => r.status === 200);
      expect(first100Successful).toBe(true);
      
      // Requests 101-105 should be blocked with 429
      const exceededBlocked = results.slice(100).every(r => r.status === 429);
      expect(exceededBlocked).toBe(true);
    }, 60000);
    
    test('should include rate limit headers in responses', async () => {
      const app = createTestApp(apiLimiter);
      const ip = '192.168.1.102';
      
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
      expect(parseInt(response.headers['ratelimit-limit'])).toBe(100);
    });
    
    test('should return standardized error format on rate limit', async () => {
      const app = createTestApp(apiLimiter);
      const ip = '192.168.1.103';
      
      // Exceed the limit
      await makeRequests(app, 100, ip);
      
      // Next request should be blocked
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      expect(response.status).toBe(429);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'RATE_LIMIT');
      expect(response.body.error).toHaveProperty('message');
    }, 60000);
    
  });
  
  /**
   * Test login rate limiter (5 req/min)
   * Requirements: 12.2
   */
  describe('loginLimiter - Login Rate Limit (5 req/min)', () => {
    
    test('should allow up to 5 requests per minute', async () => {
      const app = createTestApp(loginLimiter);
      const ip = '192.168.2.100';
      
      // Make 5 requests
      const results = await makeRequests(app, 5, ip);
      
      // All 5 requests should succeed
      const allSuccessful = results.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
    });
    
    test('should have skipSuccessfulRequests enabled', async () => {
      // Note: loginLimiter has skipSuccessfulRequests: true
      // This means successful requests (200 status) don't count toward the limit
      // This is intentional to prevent lockout of legitimate users
      const app = createTestApp(loginLimiter);
      const ip = '192.168.2.101';
      
      // Make 10 successful requests
      const results = await makeRequests(app, 10, ip);
      
      // All requests should succeed because skipSuccessfulRequests is true
      const allSuccessful = results.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
    });
    
    test('should include rate limit headers in responses', async () => {
      const app = createTestApp(loginLimiter);
      const ip = '192.168.2.102';
      
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
      expect(parseInt(response.headers['ratelimit-limit'])).toBe(5);
    });
    
    test('should have correct limit configuration', async () => {
      const app = createTestApp(loginLimiter);
      const ip = '192.168.2.103';
      
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      // Verify the limit is set to 5
      expect(parseInt(response.headers['ratelimit-limit'])).toBe(5);
      expect(response.status).toBe(200);
    });
    
  });
  
  /**
   * Test QR scan rate limiter (50 req/min)
   * Requirements: 12.3
   */
  describe('qrScanLimiter - QR Scan Rate Limit (50 req/min)', () => {
    
    test('should allow up to 50 requests per minute', async () => {
      const app = createTestApp(qrScanLimiter);
      const ip = '192.168.3.100';
      
      // Make 50 requests
      const results = await makeRequests(app, 50, ip);
      
      // All 50 requests should succeed
      const allSuccessful = results.every(r => r.status === 200);
      expect(allSuccessful).toBe(true);
    }, 60000);
    
    test('should block requests exceeding 50 per minute', async () => {
      const app = createTestApp(qrScanLimiter);
      const ip = '192.168.3.101';
      
      // Make 55 requests (5 over limit)
      const results = await makeRequests(app, 55, ip);
      
      // First 50 should succeed
      const first50Successful = results.slice(0, 50).every(r => r.status === 200);
      expect(first50Successful).toBe(true);
      
      // Requests 51-55 should be blocked with 429
      const exceededBlocked = results.slice(50).every(r => r.status === 429);
      expect(exceededBlocked).toBe(true);
    }, 60000);
    
    test('should include rate limit headers in responses', async () => {
      const app = createTestApp(qrScanLimiter);
      const ip = '192.168.3.102';
      
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
      expect(parseInt(response.headers['ratelimit-limit'])).toBe(50);
    });
    
    test('should return appropriate error message for QR scan limit', async () => {
      const app = createTestApp(qrScanLimiter);
      const ip = '192.168.3.103';
      
      // Exceed the limit
      await makeRequests(app, 50, ip);
      
      // Next request should be blocked
      const response = await request(app)
        .get('/test')
        .set('X-Forwarded-For', ip);
      
      expect(response.status).toBe(429);
      expect(response.body.error.message).toContain('QR scan');
    }, 60000);
    
  });
  
  /**
   * Test rate limiter isolation
   */
  describe('Rate Limiter Isolation', () => {
    
    test('different IPs should have independent rate limits', async () => {
      const app = createTestApp(apiLimiter);
      const ip1 = '192.168.4.100';
      const ip2 = '192.168.4.101';
      
      // Make 3 requests from IP1
      const results1 = await makeRequests(app, 3, ip1);
      expect(results1.every(r => r.status === 200)).toBe(true);
      
      // Make 3 requests from IP2 (should also succeed)
      const results2 = await makeRequests(app, 3, ip2);
      expect(results2.every(r => r.status === 200)).toBe(true);
      
      // Both IPs should still be able to make more requests (not at limit)
      const response1 = await request(app).get('/test').set('X-Forwarded-For', ip1);
      const response2 = await request(app).get('/test').set('X-Forwarded-For', ip2);
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
    
  });
  
});
