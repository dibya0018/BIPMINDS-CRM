/**
 * Property-Based Tests for CORS Configuration
 * 
 * Tests universal properties that should hold for CORS origin validation.
 * Validates that CORS only allows configured frontend origins.
 * 
 * Feature: hospital-crm-api, Property 12: CORS Origin Validation
 * Validates: Requirements 17.6, 17.8
 */

const fc = require('fast-check');
const request = require('supertest');
const { createApp } = require('../../server');

describe('CORS Configuration - Property-Based Tests', () => {
  let app;

  beforeAll(() => {
    // Create app instance for testing
    app = createApp();
  });

  /**
   * Feature: hospital-crm-api, Property 12: CORS Origin Validation
   * 
   * For any request from an origin, CORS should only allow configured frontend origins
   * and reject others.
   * 
   * Validates: Requirements 17.6, 17.8
   */
  describe('Property 12: CORS Origin Validation', () => {
    
    test('allowed origins should receive CORS headers', async () => {
      // Get allowed origins from environment (default: http://localhost:3000)
      const allowedOrigins = process.env.CORS_ORIGIN 
        ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
        : ['http://localhost:3000'];

      for (const origin of allowedOrigins) {
        const response = await request(app)
          .get('/health')
          .set('Origin', origin);

        // Property 1: Response should include Access-Control-Allow-Origin header
        expect(response.headers).toHaveProperty('access-control-allow-origin');
        
        // Property 2: Access-Control-Allow-Origin should match the request origin or be *
        const allowOriginHeader = response.headers['access-control-allow-origin'];
        expect([origin, '*']).toContain(allowOriginHeader);

        // Property 3: Access-Control-Allow-Credentials should be true
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      }
    });

    test('disallowed origins should not receive CORS headers or get error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.webUrl({ validSchemes: ['http', 'https'] }),
          async (origin) => {
            // Get allowed origins
            const allowedOrigins = process.env.CORS_ORIGIN 
              ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
              : ['http://localhost:3000'];

            // Skip if this is an allowed origin or wildcard is allowed
            if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
              return true;
            }

            try {
              const response = await request(app)
                .get('/health')
                .set('Origin', origin);

              // Property: Disallowed origins should either:
              // 1. Not receive Access-Control-Allow-Origin header, OR
              // 2. Receive an error response
              const hasAllowOrigin = response.headers['access-control-allow-origin'];
              
              if (hasAllowOrigin) {
                // If header is present, it should not match the disallowed origin
                return hasAllowOrigin !== origin;
              }
              
              return true;
            } catch (error) {
              // CORS errors are expected for disallowed origins
              return true;
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('CORS credentials should be allowed for all origins', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      // Property 1: Access-Control-Allow-Credentials should be present
      expect(response.headers).toHaveProperty('access-control-allow-credentials');

      // Property 2: Access-Control-Allow-Credentials should be 'true'
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('CORS should allow specific HTTP methods', async () => {
      const response = await request(app)
        .options('/api/patients')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      // Property 1: Access-Control-Allow-Methods should be present
      expect(response.headers).toHaveProperty('access-control-allow-methods');

      const allowedMethods = response.headers['access-control-allow-methods'];

      // Property 2: Should allow GET, POST, PUT, PATCH, DELETE
      const requiredMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      requiredMethods.forEach(method => {
        expect(allowedMethods).toContain(method);
      });
    });

    test('CORS should allow specific headers', async () => {
      const response = await request(app)
        .options('/api/patients')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      // Property 1: Access-Control-Allow-Headers should be present
      expect(response.headers).toHaveProperty('access-control-allow-headers');

      const allowedHeaders = response.headers['access-control-allow-headers'];

      // Property 2: Should allow Content-Type and Authorization
      expect(allowedHeaders).toContain('Content-Type');
      expect(allowedHeaders).toContain('Authorization');
    });

    test('CORS should expose rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      // Property 1: Access-Control-Expose-Headers should be present
      expect(response.headers).toHaveProperty('access-control-expose-headers');

      const exposedHeaders = response.headers['access-control-expose-headers'];

      // Property 2: Should expose rate limit headers
      expect(exposedHeaders).toContain('RateLimit-Limit');
      expect(exposedHeaders).toContain('RateLimit-Remaining');
      expect(exposedHeaders).toContain('RateLimit-Reset');
    });

    test('requests without origin should be allowed', async () => {
      // Requests without Origin header (e.g., from mobile apps, curl) should be allowed
      const response = await request(app).get('/health');

      // Property: Request should succeed (not be blocked by CORS)
      expect(response.status).toBeLessThan(400);
      expect(response.body.success).toBe(true);
    });

    test('CORS headers should be consistent across multiple requests from same origin', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          async (requestCount) => {
            const origin = 'http://localhost:3000';
            const responses = [];

            // Make multiple requests from the same origin
            for (let i = 0; i < requestCount; i++) {
              const response = await request(app)
                .get('/health')
                .set('Origin', origin);
              responses.push(response);
            }

            // Property: All responses should have identical CORS headers
            const firstResponse = responses[0];
            const firstAllowOrigin = firstResponse.headers['access-control-allow-origin'];
            const firstAllowCredentials = firstResponse.headers['access-control-allow-credentials'];

            return responses.every(response => 
              response.headers['access-control-allow-origin'] === firstAllowOrigin &&
              response.headers['access-control-allow-credentials'] === firstAllowCredentials
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    test('CORS should work for all API endpoints', async () => {
      const endpoints = [
        '/health',
        '/api/auth/me',
        '/api/patients',
        '/api/appointments',
        '/api/doctors',
        '/api/payments',
        '/api/leads',
        '/api/analytics/dashboard'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Origin', 'http://localhost:3000');

        // Property: All endpoints should have CORS headers
        // (even if they return 401 due to missing authentication)
        expect(response.headers).toHaveProperty('access-control-allow-credentials');
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      }
    });

    test('preflight requests should be handled correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE'),
          async (method) => {
            const response = await request(app)
              .options('/api/patients')
              .set('Origin', 'http://localhost:3000')
              .set('Access-Control-Request-Method', method);

            // Property 1: Preflight should return 2xx status
            const isSuccessful = response.status >= 200 && response.status < 300;

            // Property 2: Should include Access-Control-Allow-Methods
            const hasAllowMethods = !!response.headers['access-control-allow-methods'];

            // Property 3: Allowed methods should include the requested method
            const allowedMethods = response.headers['access-control-allow-methods'] || '';
            const includesMethod = allowedMethods.includes(method);

            return isSuccessful && hasAllowMethods && includesMethod;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
