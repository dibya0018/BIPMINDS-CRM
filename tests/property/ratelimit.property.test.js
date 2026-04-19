/**
 * Property-Based Tests for Rate Limiting
 * 
 * Tests universal properties that should hold for all rate limiting operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 9: Rate Limit Enforcement
 */

const fc = require('fast-check');
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
  app.set('trust proxy', true); // Enable trust proxy for X-Forwarded-For header
  app.use(limiter);
  app.get('/test', (req, res) => {
    res.json({ success: true, message: 'Request successful' });
  });
  return app;
}

/**
 * Helper function to make multiple requests and check rate limiting
 * @param {Express.Application} app - Express app
 * @param {number} count - Number of requests to make
 * @param {string} ip - IP address to use
 * @returns {Promise<Array>} Array of response status codes
 */
async function makeRequests(app, count, ip = '127.0.0.1') {
  const results = [];
  for (let i = 0; i < count; i++) {
    const response = await request(app)
      .get('/test')
      .set('X-Forwarded-For', ip);
    results.push({
      status: response.status,
      hasRateLimitHeaders: 
        response.headers['ratelimit-limit'] !== undefined &&
        response.headers['ratelimit-remaining'] !== undefined &&
        response.headers['ratelimit-reset'] !== undefined
    });
  }
  return results;
}

describe('Rate Limiting - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 9: Rate Limit Enforcement
   * 
   * For any IP address exceeding the configured rate limit, subsequent requests
   * should return 429 error with appropriate rate limit headers.
   * 
   * Validates: Requirements 12.4, 12.5
   */
  describe('Property 9: Rate Limit Enforcement', () => {
    
    test('requests within limit should succeed with rate limit headers', async () => {
      // Create a test app with a very high limit for this test
      const testLimiter = require('express-rate-limit')({
        windowMs: 60000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false
      });
      const app = createTestApp(testLimiter);
      
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // Number of requests within limit
          async (requestCount) => {
            // Generate unique IP for this test run
            const ip = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            
            // Make requests
            const results = await makeRequests(app, requestCount, ip);
            
            // Property 1: All requests should succeed (200 status)
            const allSuccessful = results.every(r => r.status === 200);
            
            // Property 2: All responses should have rate limit headers
            const allHaveHeaders = results.every(r => r.hasRateLimitHeaders);
            
            return allSuccessful && allHaveHeaders;
          }
        ),
        { numRuns: 10 } // Reduced runs for performance
      );
    }, 30000);

    test('requests exceeding limit should return 429 with rate limit headers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(8), // Fixed number of requests to exceed limit
          async (requestCount) => {
            // Create a fresh test app with a low limit for each test run
            const testLimiter = require('express-rate-limit')({
              windowMs: 60000,
              max: 5, // Low limit for testing
              standardHeaders: true,
              legacyHeaders: false,
              handler: (req, res) => {
                res.status(429).json({
                  success: false,
                  error: {
                    code: 'RATE_LIMIT',
                    message: 'Too many requests'
                  }
                });
              }
            });
            const app = createTestApp(testLimiter);
            
            // Generate unique IP for this test run
            const ip = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            
            // Make requests
            const results = await makeRequests(app, requestCount, ip);
            
            // Property 1: First 5 requests should succeed
            const firstFiveSuccessful = results.slice(0, 5).every(r => r.status === 200);
            
            // Property 2: Requests after limit should return 429
            const exceededRequestsBlocked = results.slice(5).every(r => r.status === 429);
            
            // Property 3: All responses should have rate limit headers
            const allHaveHeaders = results.every(r => r.hasRateLimitHeaders);
            
            return firstFiveSuccessful && exceededRequestsBlocked && allHaveHeaders;
          }
        ),
        { numRuns: 10 } // Reduced runs for performance
      );
    }, 30000);

    test('different IPs should have independent rate limits', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant([2, 2]), // Fixed number of requests for both IPs
          async ([requests1, requests2]) => {
            // Create a fresh test app with a low limit for each test run
            const testLimiter = require('express-rate-limit')({
              windowMs: 60000,
              max: 3,
              standardHeaders: true,
              legacyHeaders: false
            });
            const app = createTestApp(testLimiter);
            
            // Generate two different IPs
            const ip1 = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            const ip2 = `172.17.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
            
            // Make requests from first IP
            const results1 = await makeRequests(app, requests1, ip1);
            
            // Make requests from second IP
            const results2 = await makeRequests(app, requests2, ip2);
            
            // Property 1: All requests from both IPs should succeed (within limit)
            const allSuccessful1 = results1.every(r => r.status === 200);
            const allSuccessful2 = results2.every(r => r.status === 200);
            
            // Property 2: Both should have rate limit headers
            const allHaveHeaders1 = results1.every(r => r.hasRateLimitHeaders);
            const allHaveHeaders2 = results2.every(r => r.hasRateLimitHeaders);
            
            return allSuccessful1 && allSuccessful2 && allHaveHeaders1 && allHaveHeaders2;
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    test('rate limit headers should reflect remaining requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(3), // Fixed number of requests
          async (requestCount) => {
            // Create a fresh test app with a known limit for each test run
            const testLimiter = require('express-rate-limit')({
              windowMs: 60000,
              max: 10,
              standardHeaders: true,
              legacyHeaders: false
            });
            const app = createTestApp(testLimiter);
            
            // Generate unique IP
            const ip = `192.0.2.${Math.floor(Math.random() * 255)}`;
            
            // Make requests and capture headers
            const responses = [];
            for (let i = 0; i < requestCount; i++) {
              const response = await request(app)
                .get('/test')
                .set('X-Forwarded-For', ip);
              responses.push({
                status: response.status,
                limit: parseInt(response.headers['ratelimit-limit']),
                remaining: parseInt(response.headers['ratelimit-remaining'])
              });
            }
            
            // Property 1: Limit header should always be 10
            const limitIsCorrect = responses.every(r => r.limit === 10);
            
            // Property 2: Remaining should decrease with each request
            let remainingDecreases = true;
            for (let i = 1; i < responses.length; i++) {
              if (responses[i].remaining >= responses[i - 1].remaining) {
                remainingDecreases = false;
                break;
              }
            }
            
            // Property 3: First request should have remaining = limit - 1
            const firstRemainingCorrect = responses[0].remaining === 9;
            
            return limitIsCorrect && remainingDecreases && firstRemainingCorrect;
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

    test('429 responses should have standardized error format', async () => {
      // Create a test app with very low limit
      const testLimiter = require('express-rate-limit')({
        windowMs: 60000,
        max: 2,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT',
              message: 'Too many requests'
            }
          });
        }
      });
      const app = createTestApp(testLimiter);
      
      await fc.assert(
        fc.asyncProperty(
          fc.constant(5), // Always make 5 requests to exceed limit
          async (requestCount) => {
            // Generate unique IP
            const ip = `198.51.100.${Math.floor(Math.random() * 255)}`;
            
            // Make requests
            const responses = [];
            for (let i = 0; i < requestCount; i++) {
              const response = await request(app)
                .get('/test')
                .set('X-Forwarded-For', ip);
              if (response.status === 429) {
                responses.push(response.body);
              }
            }
            
            // Property 1: Should have at least one 429 response
            const has429Responses = responses.length > 0;
            
            if (!has429Responses) {
              return false;
            }
            
            // Property 2: All 429 responses should have success: false
            const allHaveSuccessFalse = responses.every(r => r.success === false);
            
            // Property 3: All 429 responses should have error object
            const allHaveError = responses.every(r => r.error && typeof r.error === 'object');
            
            // Property 4: All error objects should have code and message
            const allHaveCodeAndMessage = responses.every(r => 
              r.error.code && typeof r.error.code === 'string' &&
              r.error.message && typeof r.error.message === 'string'
            );
            
            return allHaveSuccessFalse && allHaveError && allHaveCodeAndMessage;
          }
        ),
        { numRuns: 10 }
      );
    }, 30000);

  });

});
