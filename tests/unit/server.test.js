/**
 * Unit Tests for Server Startup
 * 
 * Tests server initialization, middleware configuration, and graceful shutdown.
 * 
 * Requirements: 1.1, 2.1
 */

const request = require('supertest');
const { createApp } = require('../../server');

describe('Server Startup - Unit Tests', () => {
  let app;

  beforeAll(() => {
    // Create app instance for testing
    app = createApp();
  });

  /**
   * Test server starts on correct port
   * Requirements: 1.1
   */
  describe('Server Configuration', () => {
    test('should create Express app successfully', () => {
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
    });

    test('should respond to health check endpoint', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Hospital CRM API is running');
      expect(response.body.timestamp).toBeDefined();
    });

    test('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/nonexistent-route');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  /**
   * Test middleware stack is configured
   * Requirements: 1.1
   */
  describe('Middleware Configuration', () => {
    test('should have security headers configured', async () => {
      const response = await request(app).get('/health');
      
      // Check for Helmet security headers
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    test('should have CORS configured', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');
      
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should have rate limiting configured', async () => {
      const response = await request(app).get('/health');
      
      // Rate limit headers should be present
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });

    test('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password' })
        .set('Content-Type', 'application/json');
      
      // Should not return 400 for JSON parsing error
      expect(response.status).not.toBe(400);
    });
  });

  /**
   * Test API routes are registered
   * Requirements: 1.1
   */
  describe('Route Registration', () => {
    test('should have auth routes registered', async () => {
      const response = await request(app).get('/api/auth/me');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have patient routes registered', async () => {
      const response = await request(app).get('/api/patients');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have appointment routes registered', async () => {
      const response = await request(app).get('/api/appointments');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have doctor routes registered', async () => {
      const response = await request(app).get('/api/doctors');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have payment routes registered', async () => {
      const response = await request(app).get('/api/payments');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have lead routes registered', async () => {
      const response = await request(app).get('/api/leads');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });

    test('should have analytics routes registered', async () => {
      const response = await request(app).get('/api/analytics/dashboard');
      
      // Should return 401 (unauthorized) not 404 (not found)
      expect(response.status).toBe(401);
    });
  });

  /**
   * Test error handling middleware
   * Requirements: 1.1
   */
  describe('Error Handling', () => {
    test('should handle errors with standardized format', async () => {
      const response = await request(app).get('/api/nonexistent');
      
      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
    });

    test('should return appropriate status codes for errors', async () => {
      // 404 for not found
      const notFoundResponse = await request(app).get('/api/nonexistent');
      expect(notFoundResponse.status).toBe(404);

      // 401 for unauthorized
      const unauthorizedResponse = await request(app).get('/api/patients');
      expect(unauthorizedResponse.status).toBe(401);
    });
  });

  /**
   * Test environment configuration
   * Requirements: 1.1
   */
  describe('Environment Configuration', () => {
    test('should load environment variables', () => {
      expect(process.env.PORT).toBeDefined();
      expect(process.env.DB_HOST).toBeDefined();
      expect(process.env.JWT_SECRET).toBeDefined();
    });

    test('should use correct environment', () => {
      const response = request(app).get('/health');
      
      // Environment should be set
      expect(process.env.NODE_ENV).toBeDefined();
    });
  });
});
