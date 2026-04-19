/**
 * Property-Based Tests for Security Headers
 * 
 * Tests universal properties that should hold for all API responses.
 * Validates that security headers are present and correctly configured.
 * 
 * Feature: hospital-crm-api, Property 11: Security Headers Presence
 * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5
 */

const fc = require('fast-check');
const request = require('supertest');
const { createApp } = require('../../server');

describe('Security Headers - Property-Based Tests', () => {
  let app;

  beforeAll(() => {
    // Create app instance for testing
    app = createApp();
  });

  /**
   * Feature: hospital-crm-api, Property 11: Security Headers Presence
   * 
   * For any API response, security headers (CSP, HSTS, X-Frame-Options, 
   * X-Content-Type-Options, X-XSS-Protection) should be present.
   * 
   * Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5
   */
  describe('Property 11: Security Headers Presence', () => {
    
    test('all API responses should include required security headers', async () => {
      // Test various endpoints to ensure headers are present
      const endpoints = [
        { method: 'get', path: '/health' },
        { method: 'get', path: '/api/auth/me' },
        { method: 'get', path: '/api/patients' },
        { method: 'post', path: '/api/auth/login' },
        { method: 'get', path: '/nonexistent' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path);

        // Property 1: Content-Security-Policy header should be present
        expect(response.headers).toHaveProperty('content-security-policy');
        expect(response.headers['content-security-policy']).toBeTruthy();

        // Property 2: Strict-Transport-Security header should be present with max-age
        expect(response.headers).toHaveProperty('strict-transport-security');
        expect(response.headers['strict-transport-security']).toContain('max-age=31536000');

        // Property 3: X-Frame-Options header should be DENY
        expect(response.headers).toHaveProperty('x-frame-options');
        expect(response.headers['x-frame-options']).toBe('DENY');

        // Property 4: X-Content-Type-Options header should be nosniff
        expect(response.headers).toHaveProperty('x-content-type-options');
        expect(response.headers['x-content-type-options']).toBe('nosniff');

        // Property 5: X-XSS-Protection header should be present
        expect(response.headers).toHaveProperty('x-xss-protection');
        expect(response.headers['x-xss-protection']).toBeTruthy();
      }
    });

    test('security headers should be present for all HTTP methods', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('get', 'post', 'put', 'patch', 'delete'),
          async (method) => {
            // Test health endpoint with different methods
            const response = await request(app)[method]('/health');

            // All responses should have security headers regardless of method
            const hasCSP = !!response.headers['content-security-policy'];
            const hasHSTS = !!response.headers['strict-transport-security'];
            const hasFrameOptions = !!response.headers['x-frame-options'];
            const hasNoSniff = !!response.headers['x-content-type-options'];
            const hasXSSProtection = !!response.headers['x-xss-protection'];

            return hasCSP && hasHSTS && hasFrameOptions && hasNoSniff && hasXSSProtection;
          }
        ),
        { numRuns: 10 }
      );
    });

    test('HSTS header should include required directives', async () => {
      const response = await request(app).get('/health');
      const hstsHeader = response.headers['strict-transport-security'];

      // Property 1: HSTS should have max-age directive
      expect(hstsHeader).toContain('max-age=');

      // Property 2: max-age should be at least 1 year (31536000 seconds)
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
      expect(maxAgeMatch).toBeTruthy();
      const maxAge = parseInt(maxAgeMatch[1]);
      expect(maxAge).toBeGreaterThanOrEqual(31536000);

      // Property 3: HSTS should include includeSubDomains
      expect(hstsHeader).toContain('includeSubDomains');
    });

    test('CSP header should restrict resource loading', async () => {
      const response = await request(app).get('/health');
      const cspHeader = response.headers['content-security-policy'];

      // Property 1: CSP should have default-src directive
      expect(cspHeader).toContain('default-src');

      // Property 2: CSP should restrict default-src to self
      expect(cspHeader).toMatch(/default-src[^;]*'self'/);

      // Property 3: CSP should have script-src directive
      expect(cspHeader).toContain('script-src');

      // Property 4: CSP should have style-src directive
      expect(cspHeader).toContain('style-src');

      // Property 5: CSP should have img-src directive
      expect(cspHeader).toContain('img-src');
    });

    test('security headers should be consistent across multiple requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (requestCount) => {
            const responses = [];
            
            // Make multiple requests
            for (let i = 0; i < requestCount; i++) {
              const response = await request(app).get('/health');
              responses.push(response);
            }

            // Property: All responses should have identical security headers
            const firstResponse = responses[0];
            const firstCSP = firstResponse.headers['content-security-policy'];
            const firstHSTS = firstResponse.headers['strict-transport-security'];
            const firstFrameOptions = firstResponse.headers['x-frame-options'];
            const firstNoSniff = firstResponse.headers['x-content-type-options'];

            return responses.every(response => 
              response.headers['content-security-policy'] === firstCSP &&
              response.headers['strict-transport-security'] === firstHSTS &&
              response.headers['x-frame-options'] === firstFrameOptions &&
              response.headers['x-content-type-options'] === firstNoSniff
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    test('security headers should be present even for error responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(
            '/nonexistent',
            '/api/invalid',
            '/api/patients/999999',
            '/api/auth/invalid'
          ),
          async (path) => {
            const response = await request(app).get(path);

            // Even error responses should have security headers
            const hasCSP = !!response.headers['content-security-policy'];
            const hasHSTS = !!response.headers['strict-transport-security'];
            const hasFrameOptions = !!response.headers['x-frame-options'];
            const hasNoSniff = !!response.headers['x-content-type-options'];
            const hasXSSProtection = !!response.headers['x-xss-protection'];

            return hasCSP && hasHSTS && hasFrameOptions && hasNoSniff && hasXSSProtection;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
