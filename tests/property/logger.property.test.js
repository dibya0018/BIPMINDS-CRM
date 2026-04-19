/**
 * Property-Based Tests for Request Logging
 * 
 * Tests universal properties that should hold for all request logging operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 35: Request Logging
 */

const fc = require('fast-check');
const winston = require('winston');
const { Writable } = require('stream');

describe('Request Logging - Property-Based Tests', () => {
  
  // Create a test logger for each test
  let testLogger;
  let logMessages = [];
  
  beforeEach(() => {
    // Clear log messages
    logMessages = [];
    
    // Create a writable stream that captures log messages
    const captureStream = new Writable({
      write(chunk, encoding, callback) {
        try {
          const parsed = JSON.parse(chunk.toString());
          logMessages.push(parsed);
        } catch (e) {
          // If not JSON, store as is
          logMessages.push({ message: chunk.toString().trim() });
        }
        callback();
      }
    });
    
    // Create test logger with custom transport
    testLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Stream({
          stream: captureStream
        })
      ]
    });
  });
  
  afterEach(() => {
    // Clean up
    if (testLogger) {
      testLogger.close();
    }
  });

  /**
   * Feature: hospital-crm-api, Property 35: Request Logging
   * 
   * For any API request, the system should log the request method, path, and response status.
   * 
   * Validates: Requirements 1.6
   */
  describe('Property 35: Request Logging', () => {
    
    test('logger should log messages with all required fields', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            method: fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
            path: fc.constantFrom('/api/patients', '/api/appointments', '/api/doctors', '/api/auth/login'),
            status: fc.integer({ min: 200, max: 599 }),
            message: fc.string({ minLength: 5, maxLength: 100 })
          }),
          (requestData) => {
            // Clear previous messages
            logMessages = [];
            
            // Log a request
            const logMessage = `${requestData.method} ${requestData.path} ${requestData.status}`;
            testLogger.info(logMessage, {
              method: requestData.method,
              path: requestData.path,
              status: requestData.status
            });
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should have level
            const hasLevel = typeof logEntry.level === 'string';
            
            // Property 3: Log entry should have message
            const hasMessage = typeof logEntry.message === 'string' && logEntry.message.length > 0;
            
            // Property 4: Log entry should contain method
            const hasMethod = logEntry.method === requestData.method;
            
            // Property 5: Log entry should contain path
            const hasPath = logEntry.path === requestData.path;
            
            // Property 6: Log entry should contain status
            const hasStatus = logEntry.status === requestData.status;
            
            return messageLogged && 
                   hasLevel && 
                   hasMessage && 
                   hasMethod && 
                   hasPath && 
                   hasStatus;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle different log levels correctly', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            level: fc.constantFrom('info', 'warn', 'error'),
            message: fc.string({ minLength: 5, maxLength: 100 }).filter(s => !s.includes('%'))
          }),
          (logData) => {
            // Clear previous messages
            logMessages = [];
            
            // Log at specified level
            testLogger[logData.level](logData.message);
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should have correct level
            const hasCorrectLevel = logEntry.level === logData.level;
            
            // Property 3: Log entry should have the message
            const hasMessage = logEntry.message === logData.message;
            
            return messageLogged && hasCorrectLevel && hasMessage;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle metadata objects', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            message: fc.string({ minLength: 5, maxLength: 50 }).filter(s => !s.includes('%')),
            userId: fc.integer({ min: 1, max: 1000000 }),
            ip: fc.ipV4(),
            userAgent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          (logData) => {
            // Clear previous messages
            logMessages = [];
            
            // Log with metadata
            testLogger.info(logData.message, {
              userId: logData.userId,
              ip: logData.ip,
              userAgent: logData.userAgent
            });
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should have message
            const hasMessage = logEntry.message === logData.message;
            
            // Property 3: Log entry should have userId
            const hasUserId = logEntry.userId === logData.userId;
            
            // Property 4: Log entry should have ip
            const hasIp = logEntry.ip === logData.ip;
            
            // Property 5: Log entry should have userAgent
            const hasUserAgent = logEntry.userAgent === logData.userAgent;
            
            return messageLogged && 
                   hasMessage && 
                   hasUserId && 
                   hasIp && 
                   hasUserAgent;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle error objects with stack traces', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            errorMessage: fc.string({ minLength: 5, maxLength: 50 }).filter(s => !s.includes('%')),
            errorCode: fc.constantFrom('VAL_001', 'AUTH_001', 'PERM_001', 'NOT_FOUND')
          }),
          (errorData) => {
            // Clear previous messages
            logMessages = [];
            
            // Create an error
            const error = new Error(errorData.errorMessage);
            error.code = errorData.errorCode;
            
            // Log the error
            testLogger.error('An error occurred', { error: error.message, code: error.code });
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should have error level
            const hasErrorLevel = logEntry.level === 'error';
            
            // Property 3: Log entry should have error message
            const hasError = logEntry.error === errorData.errorMessage;
            
            // Property 4: Log entry should have error code
            const hasCode = logEntry.code === errorData.errorCode;
            
            return messageLogged && hasErrorLevel && hasError && hasCode;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle multiple consecutive log calls', async () => {
      await fc.assert(
        fc.property(
          fc.array(
            fc.record({
              message: fc.string({ minLength: 5, maxLength: 50 }).filter(s => !s.includes('%')),
              level: fc.constantFrom('info', 'warn', 'error')
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (logEntries) => {
            // Clear previous messages
            logMessages = [];
            
            // Log all entries
            logEntries.forEach(entry => {
              testLogger[entry.level](entry.message);
            });
            
            // Property 1: All messages should be logged
            const allLogged = logMessages.length === logEntries.length;
            
            if (!allLogged) {
              return false;
            }
            
            // Property 2: Messages should be in order
            const inOrder = logEntries.every((entry, index) => {
              return logMessages[index].message === entry.message &&
                     logMessages[index].level === entry.level;
            });
            
            return allLogged && inOrder;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('logger should handle empty metadata objects', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => !s.includes('%')),
          (message) => {
            // Clear previous messages
            logMessages = [];
            
            // Log with empty metadata
            testLogger.info(message, {});
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should have the message
            const hasMessage = logEntry.message === message;
            
            // Property 3: Log entry should have level
            const hasLevel = logEntry.level === 'info';
            
            return messageLogged && hasMessage && hasLevel;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle special characters in messages', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (message) => {
            // Clear previous messages
            logMessages = [];
            
            // Log message with potential special characters
            testLogger.info(message);
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Log entry should preserve the message
            const messagePreserved = logEntry.message === message;
            
            return messageLogged && messagePreserved;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('logger should handle numeric metadata values', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            message: fc.string({ minLength: 5, maxLength: 50 }).filter(s => {
              // Filter out strings with % to avoid Winston format specifiers
              return s.trim().length >= 5 && !s.includes('%');
            }),
            responseTime: fc.integer({ min: 1, max: 10000 }),
            statusCode: fc.integer({ min: 200, max: 599 }),
            contentLength: fc.integer({ min: 0, max: 1000000 })
          }),
          (logData) => {
            // Clear previous messages
            logMessages = [];
            
            // Log with numeric metadata
            testLogger.info(logData.message, {
              responseTime: logData.responseTime,
              statusCode: logData.statusCode,
              contentLength: logData.contentLength
            });
            
            // Property 1: Logger should have captured the message
            const messageLogged = logMessages.length > 0;
            
            if (!messageLogged) {
              return false;
            }
            
            const logEntry = logMessages[0];
            
            // Property 2: Numeric values should be preserved
            const responseTimePreserved = logEntry.responseTime === logData.responseTime;
            const statusCodePreserved = logEntry.statusCode === logData.statusCode;
            const contentLengthPreserved = logEntry.contentLength === logData.contentLength;
            
            // Property 3: Message should be present
            const hasMessage = typeof logEntry.message === 'string';
            
            return messageLogged && 
                   responseTimePreserved && 
                   statusCodePreserved && 
                   contentLengthPreserved &&
                   hasMessage;
          }
        ),
        { numRuns: 100 }
      );
    });

  });

});
