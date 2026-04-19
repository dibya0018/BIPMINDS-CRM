/**
 * Property-Based Tests for Error Handler Middleware
 * 
 * Tests universal properties of error handling and response standardization.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 10: Error Response Standardization
 */

const fc = require('fast-check');
const {
  errorHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError
} = require('../../middleware/errorHandler');

/**
 * Helper function to create mock request object
 */
function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    user: null,
    ...overrides
  };
}

/**
 * Helper function to create mock response object
 */
function createMockResponse() {
  const res = {
    statusCode: null,
    jsonData: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

/**
 * Helper function to create mock next function
 */
function createMockNext() {
  return jest.fn();
}

describe('Error Handler - Property-Based Tests', () => {
  
  /**
   * Property 10: Error Response Standardization
   * 
   * For any error condition, the API should return a standardized response format
   * with success: false, error code, and message.
   * 
   * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8
   */
  describe('Property 10: Error Response Standardization', () => {
    
    test('all errors should return standardized response format', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            fc.record({
              type: fc.constant('validation'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('authentication'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('authorization'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('notfound'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('conflict'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('ratelimit'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            }),
            fc.record({
              type: fc.constant('generic'),
              message: fc.string({ minLength: 5, maxLength: 100 })
            })
          ),
          (errorSpec) => {
            // Create appropriate error based on type
            let error;
            switch (errorSpec.type) {
              case 'validation':
                error = new ValidationError(errorSpec.message);
                break;
              case 'authentication':
                error = new AuthenticationError(errorSpec.message);
                break;
              case 'authorization':
                error = new AuthorizationError(errorSpec.message);
                break;
              case 'notfound':
                error = new NotFoundError(errorSpec.message);
                break;
              case 'conflict':
                error = new ConflictError(errorSpec.message);
                break;
              case 'ratelimit':
                error = new RateLimitError(errorSpec.message);
                break;
              default:
                error = new Error(errorSpec.message);
            }
            
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            // Call error handler
            errorHandler(error, req, res, next);
            
            // Property 1: Response should have standardized format
            const hasStandardFormat = 
              res.jsonData !== null &&
              typeof res.jsonData === 'object' &&
              res.jsonData.success === false &&
              typeof res.jsonData.error === 'object';
            
            if (!hasStandardFormat) {
              return false;
            }
            
            // Property 2: Error object should have code
            const hasErrorCode = 
              typeof res.jsonData.error.code === 'string' &&
              res.jsonData.error.code.length > 0;
            
            // Property 3: Error object should have message
            const hasErrorMessage = 
              typeof res.jsonData.error.message === 'string' &&
              res.jsonData.error.message.length > 0;
            
            // Property 4: Status code should be set
            const hasStatusCode = 
              typeof res.statusCode === 'number' &&
              res.statusCode >= 400 &&
              res.statusCode < 600;
            
            return hasStandardFormat && 
                   hasErrorCode && 
                   hasErrorMessage && 
                   hasStatusCode;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('validation errors should map to 400 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new ValidationError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Validation errors should return 400
            return res.statusCode === 400 &&
                   res.jsonData.error.code === 'VAL_001';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('authentication errors should map to 401 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new AuthenticationError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Authentication errors should return 401
            return res.statusCode === 401 &&
                   res.jsonData.error.code === 'AUTH_001';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('authorization errors should map to 403 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new AuthorizationError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Authorization errors should return 403
            return res.statusCode === 403 &&
                   res.jsonData.error.code === 'PERM_001';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('not found errors should map to 404 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new NotFoundError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Not found errors should return 404
            return res.statusCode === 404 &&
                   res.jsonData.error.code === 'NOT_FOUND';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('conflict errors should map to 409 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new ConflictError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Conflict errors should return 409
            return res.statusCode === 409 &&
                   res.jsonData.error.code === 'CONFLICT';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('rate limit errors should map to 429 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new RateLimitError(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Rate limit errors should return 429
            return res.statusCode === 429 &&
                   res.jsonData.error.code === 'RATE_LIMIT';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('generic errors should map to 500 status code', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 100 }),
          (message) => {
            const error = new Error(message);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Generic errors should return 500
            return res.statusCode === 500 &&
                   res.jsonData.error.code === 'SERVER_ERROR';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('errors with custom status codes should preserve them', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 599 }),
          fc.string({ minLength: 5, maxLength: 100 }),
          (statusCode, message) => {
            const error = new Error(message);
            error.statusCode = statusCode;
            
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Custom status codes should be preserved
            return res.statusCode === statusCode;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('errors should not expose sensitive information', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            fc.constant('Database connection failed: password=secret123'),
            fc.constant('JWT secret key is invalid'),
            fc.constant('ECONNREFUSED to database'),
            fc.constant('ER_ACCESS_DENIED_ERROR'),
            fc.constant('File system error at /etc/passwd'),
            fc.constant('Connection string: mysql://user:pass@host')
          ),
          (sensitiveMessage) => {
            const error = new Error(sensitiveMessage);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Sensitive information should not be in response
            const responseMessage = res.jsonData.error.message.toLowerCase();
            const hasSensitiveInfo = 
              responseMessage.includes('password') ||
              responseMessage.includes('secret') ||
              responseMessage.includes('token') ||
              responseMessage.includes('key') ||
              responseMessage.includes('credential') ||
              responseMessage.includes('database') ||
              responseMessage.includes('connection') ||
              responseMessage.includes('econnrefused') ||
              responseMessage.includes('er_') ||
              responseMessage.includes('file system') ||
              responseMessage.includes('path');
            
            // Should NOT contain sensitive information
            return !hasSensitiveInfo;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('validation errors with details should include them', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              field: fc.constantFrom('firstName', 'lastName', 'email', 'phone'),
              message: fc.string({ minLength: 5, maxLength: 50 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (validationDetails) => {
            const error = new ValidationError('Validation failed', validationDetails);
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Validation errors should include details
            return res.statusCode === 400 &&
                   res.jsonData.error.details !== undefined &&
                   Array.isArray(res.jsonData.error.details) &&
                   res.jsonData.error.details.length === validationDetails.length;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('error responses should never have success: true', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(
            fc.record({ type: fc.constant('validation'), message: fc.string() }),
            fc.record({ type: fc.constant('authentication'), message: fc.string() }),
            fc.record({ type: fc.constant('generic'), message: fc.string() })
          ),
          (errorSpec) => {
            let error;
            switch (errorSpec.type) {
              case 'validation':
                error = new ValidationError(errorSpec.message);
                break;
              case 'authentication':
                error = new AuthenticationError(errorSpec.message);
                break;
              default:
                error = new Error(errorSpec.message);
            }
            
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Error responses should always have success: false
            return res.jsonData.success === false;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('error handler should work with different request contexts', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            method: fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
            url: fc.webUrl(),
            userId: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null })
          }),
          (requestContext) => {
            const error = new NotFoundError('Resource not found');
            const req = createMockRequest({
              method: requestContext.method,
              url: requestContext.url,
              originalUrl: requestContext.url,
              user: requestContext.userId ? { userId: requestContext.userId } : null
            });
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: Error handler should work regardless of request context
            return res.statusCode === 404 &&
                   res.jsonData.success === false &&
                   res.jsonData.error.code === 'NOT_FOUND';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('JWT errors should map to authentication errors', async () => {
      await fc.assert(
        fc.property(
          fc.constantFrom('JsonWebTokenError', 'TokenExpiredError'),
          (errorName) => {
            const error = new Error('JWT error');
            error.name = errorName;
            
            const req = createMockRequest();
            const res = createMockResponse();
            const next = createMockNext();
            
            errorHandler(error, req, res, next);
            
            // Property: JWT errors should map to 401 with AUTH_002 code
            return res.statusCode === 401 &&
                   res.jsonData.error.code === 'AUTH_002';
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('error responses should have consistent structure', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.record({ type: fc.constant('validation') }),
              fc.record({ type: fc.constant('authentication') }),
              fc.record({ type: fc.constant('notfound') })
            ),
            { minLength: 2, maxLength: 5 }
          ),
          (errorSpecs) => {
            const responses = errorSpecs.map(spec => {
              let error;
              switch (spec.type) {
                case 'validation':
                  error = new ValidationError('Validation error');
                  break;
                case 'authentication':
                  error = new AuthenticationError('Auth error');
                  break;
                case 'notfound':
                  error = new NotFoundError('Not found');
                  break;
              }
              
              const req = createMockRequest();
              const res = createMockResponse();
              const next = createMockNext();
              
              errorHandler(error, req, res, next);
              
              return res.jsonData;
            });
            
            // Property: All error responses should have same structure
            const allHaveSameStructure = responses.every(response => 
              response.success === false &&
              typeof response.error === 'object' &&
              typeof response.error.code === 'string' &&
              typeof response.error.message === 'string'
            );
            
            return allHaveSameStructure;
          }
        ),
        { numRuns: 50 }
      );
    });
    
  });
  
});
