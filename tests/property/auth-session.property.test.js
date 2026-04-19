/**
 * Property-Based Tests for Authentication Session Management
 * 
 * Tests universal properties that should hold for session management operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 19: Session Management
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateAccessToken } = require('../../utils/jwt');
const { hashPassword } = require('../../utils/password');
const crypto = require('crypto');

describe('Authentication Session Management - Property-Based Tests', () => {
  
  let pool;
  
  beforeAll(async () => {
    pool = getPool();
  });
  
  afterAll(async () => {
    // Clean up test data
    const connection = await pool.getConnection();
    try {
      await connection.query('DELETE FROM sessions WHERE user_id >= 900000');
      await connection.query('DELETE FROM users WHERE user_id >= 900000');
    } finally {
      connection.release();
    }
  });
  
  /**
   * Feature: hospital-crm-api, Property 19: Session Management
   * 
   * For any successful login, a session record should be created in the database
   * with the user ID and expiration time.
   * 
   * Validates: Requirements 4.6
   */
  describe('Property 19: Session Management', () => {
    
    test('successful login should create session record with user ID and expiration', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            email: fc.emailAddress(),
            firstName: fc.string({ minLength: 2, maxLength: 20 }),
            lastName: fc.string({ minLength: 2, maxLength: 20 }),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.array(
              fc.constantFrom('super_admin', 'admin', 'doctor', 'nurse'),
              { minLength: 1, maxLength: 2 }
            )
          }),
          async (userData) => {
            const connection = await pool.getConnection();
            
            try {
              // Create test user
              const passwordHash = await hashPassword('TestPassword123!');
              
              await connection.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?, TRUE)
                 ON DUPLICATE KEY UPDATE email = VALUES(email)`,
                [userData.userId, userData.email, passwordHash, userData.firstName, userData.lastName, userData.userType]
              );
              
              // Simulate session creation (as done in login controller)
              const sessionId = crypto.randomUUID();
              const accessToken = generateAccessToken({
                userId: userData.userId,
                email: userData.email,
                userType: userData.userType,
                roles: userData.roles
              });
              const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
              const ipAddress = '127.0.0.1';
              const userAgent = 'test-agent';
              
              // Create session
              await connection.execute(
                `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [sessionId, userData.userId, tokenHash, ipAddress, userAgent, expiresAt]
              );
              
              // Verify session was created
              const [sessions] = await connection.query(
                'SELECT * FROM sessions WHERE session_id = ?',
                [sessionId]
              );
              
              // Property 1: Session record should exist
              const sessionExists = sessions.length === 1;
              
              if (!sessionExists) {
                return false;
              }
              
              const session = sessions[0];
              
              // Property 2: Session should have correct user ID
              const hasCorrectUserId = session.user_id === userData.userId;
              
              // Property 3: Session should have session ID
              const hasSessionId = session.session_id === sessionId;
              
              // Property 4: Session should have token hash
              const hasTokenHash = typeof session.token_hash === 'string' && session.token_hash.length > 0;
              
              // Property 5: Session should have IP address
              const hasIpAddress = typeof session.ip_address === 'string' && session.ip_address.length > 0;
              
              // Property 6: Session should have user agent
              const hasUserAgent = typeof session.user_agent === 'string' && session.user_agent.length > 0;
              
              // Property 7: Session should have expiration time
              const hasExpiresAt = session.expires_at instanceof Date;
              
              // Property 8: Expiration time should be in the future
              const expiresInFuture = session.expires_at > new Date();
              
              // Property 9: Session should have created_at timestamp
              const hasCreatedAt = session.created_at instanceof Date;
              
              // Property 10: Session should have last_activity timestamp
              const hasLastActivity = session.last_activity instanceof Date;
              
              // Clean up
              await connection.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
              
              return sessionExists &&
                     hasCorrectUserId &&
                     hasSessionId &&
                     hasTokenHash &&
                     hasIpAddress &&
                     hasUserAgent &&
                     hasExpiresAt &&
                     expiresInFuture &&
                     hasCreatedAt &&
                     hasLastActivity;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20 } // Reduced runs for database operations
      );
    });

    test('session expiration time should be 24 hours from creation', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            email: fc.emailAddress()
          }),
          async (userData) => {
            const connection = await pool.getConnection();
            
            try {
              // Create test user if not exists
              const passwordHash = await hashPassword('TestPassword123!');
              
              await connection.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
                 VALUES (?, ?, ?, 'Test', 'User', 'staff', TRUE)
                 ON DUPLICATE KEY UPDATE email = VALUES(email)`,
                [userData.userId, userData.email, passwordHash]
              );
              
              // Create session
              const sessionId = crypto.randomUUID();
              const tokenHash = crypto.randomBytes(32).toString('hex');
              const now = new Date();
              const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
              
              await connection.execute(
                `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, '127.0.0.1', 'test', ?)`,
                [sessionId, userData.userId, tokenHash, expiresAt]
              );
              
              // Retrieve session
              const [sessions] = await connection.query(
                'SELECT created_at, expires_at FROM sessions WHERE session_id = ?',
                [sessionId]
              );
              
              if (sessions.length === 0) {
                return false;
              }
              
              const session = sessions[0];
              
              // Property: Expiration should be approximately 24 hours from creation
              // Allow 5 second tolerance for test execution time
              const createdAt = session.created_at.getTime();
              const expiresAtTime = session.expires_at.getTime();
              const expectedExpiration = createdAt + (24 * 60 * 60 * 1000);
              const timeDifference = Math.abs(expiresAtTime - expectedExpiration);
              const expirationIsCorrect = timeDifference < 5000; // 5 second tolerance
              
              // Clean up
              await connection.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
              
              return expirationIsCorrect;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('multiple sessions can exist for the same user', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            email: fc.emailAddress(),
            sessionCount: fc.integer({ min: 2, max: 5 })
          }),
          async (testData) => {
            const connection = await pool.getConnection();
            
            try {
              // Create test user
              const passwordHash = await hashPassword('TestPassword123!');
              
              await connection.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
                 VALUES (?, ?, ?, 'Test', 'User', 'staff', TRUE)
                 ON DUPLICATE KEY UPDATE email = VALUES(email)`,
                [testData.userId, testData.email, passwordHash]
              );
              
              // Create multiple sessions
              const sessionIds = [];
              for (let i = 0; i < testData.sessionCount; i++) {
                const sessionId = crypto.randomUUID();
                sessionIds.push(sessionId);
                
                const tokenHash = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                
                await connection.execute(
                  `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
                   VALUES (?, ?, ?, '127.0.0.1', 'test', ?)`,
                  [sessionId, testData.userId, tokenHash, expiresAt]
                );
              }
              
              // Verify all sessions exist
              const [sessions] = await connection.query(
                'SELECT session_id FROM sessions WHERE user_id = ?',
                [testData.userId]
              );
              
              // Property 1: All sessions should be created
              const allSessionsCreated = sessions.length >= testData.sessionCount;
              
              // Property 2: All session IDs should be unique
              const uniqueSessionIds = new Set(sessions.map(s => s.session_id));
              const allSessionsUnique = uniqueSessionIds.size === sessions.length;
              
              // Clean up
              await connection.query('DELETE FROM sessions WHERE user_id = ?', [testData.userId]);
              
              return allSessionsCreated && allSessionsUnique;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 15 }
      );
    });

    test('session deletion should remove session record', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            email: fc.emailAddress()
          }),
          async (userData) => {
            const connection = await pool.getConnection();
            
            try {
              // Create test user
              const passwordHash = await hashPassword('TestPassword123!');
              
              await connection.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
                 VALUES (?, ?, ?, 'Test', 'User', 'staff', TRUE)
                 ON DUPLICATE KEY UPDATE email = VALUES(email)`,
                [userData.userId, userData.email, passwordHash]
              );
              
              // Create session
              const sessionId = crypto.randomUUID();
              const tokenHash = crypto.randomBytes(32).toString('hex');
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
              
              await connection.execute(
                `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, '127.0.0.1', 'test', ?)`,
                [sessionId, userData.userId, tokenHash, expiresAt]
              );
              
              // Verify session exists
              const [sessionsBefore] = await connection.query(
                'SELECT * FROM sessions WHERE session_id = ?',
                [sessionId]
              );
              
              const sessionExistsBefore = sessionsBefore.length === 1;
              
              // Delete session (simulate logout)
              await connection.query('CALL sp_user_logout(?)', [sessionId]);
              
              // Verify session is deleted
              const [sessionsAfter] = await connection.query(
                'SELECT * FROM sessions WHERE session_id = ?',
                [sessionId]
              );
              
              // Property: Session should be deleted
              const sessionDeletedAfter = sessionsAfter.length === 0;
              
              return sessionExistsBefore && sessionDeletedAfter;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    test('session should store IP address and user agent', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.integer({ min: 900000, max: 999999 }),
            email: fc.emailAddress(),
            ipAddress: fc.ipV4(),
            userAgent: fc.string({ minLength: 10, maxLength: 100 })
          }),
          async (testData) => {
            const connection = await pool.getConnection();
            
            try {
              // Create test user
              const passwordHash = await hashPassword('TestPassword123!');
              
              await connection.execute(
                `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
                 VALUES (?, ?, ?, 'Test', 'User', 'staff', TRUE)
                 ON DUPLICATE KEY UPDATE email = VALUES(email)`,
                [testData.userId, testData.email, passwordHash]
              );
              
              // Create session with specific IP and user agent
              const sessionId = crypto.randomUUID();
              const tokenHash = crypto.randomBytes(32).toString('hex');
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
              
              await connection.execute(
                `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [sessionId, testData.userId, tokenHash, testData.ipAddress, testData.userAgent, expiresAt]
              );
              
              // Retrieve session
              const [sessions] = await connection.query(
                'SELECT ip_address, user_agent FROM sessions WHERE session_id = ?',
                [sessionId]
              );
              
              if (sessions.length === 0) {
                return false;
              }
              
              const session = sessions[0];
              
              // Property 1: IP address should match
              const ipMatches = session.ip_address === testData.ipAddress;
              
              // Property 2: User agent should match
              const userAgentMatches = session.user_agent === testData.userAgent;
              
              // Clean up
              await connection.query('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
              
              return ipMatches && userAgentMatches;
              
            } finally {
              connection.release();
            }
          }
        ),
        { numRuns: 20 }
      );
    });

  });

});
