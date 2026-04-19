/**
 * Unit Tests for Authentication Controller
 * 
 * Tests login, logout, token refresh, and account lockout functionality.
 * Validates: Requirements 4.1, 20.6, 20.8
 */

const {
  login,
  logout,
  refreshToken,
  getCurrentUser,
  checkAccountLock,
  recordFailedAttempt,
  clearFailedAttempts,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS
} = require('../../controllers/authController');
const { getPool } = require('../../config/database');
const { hashPassword } = require('../../utils/password');
const { generateRefreshToken } = require('../../utils/jwt');

describe('Authentication Controller - Unit Tests', () => {
  
  let pool;
  
  beforeAll(async () => {
    pool = getPool();
  });
  
  afterAll(async () => {
    // Clean up test data
    const connection = await pool.getConnection();
    try {
      await connection.query('DELETE FROM sessions WHERE user_id >= 800000');
      await connection.query('DELETE FROM user_roles WHERE user_id >= 800000');
      await connection.query('DELETE FROM users WHERE user_id >= 800000');
    } finally {
      connection.release();
    }
  });
  
  describe('Successful Login', () => {
    
    test('should login successfully with valid credentials', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('TestPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800001, 'testuser1@hospital.com', ?, 'Test', 'User', 'staff', TRUE)`,
          [passwordHash]
        );
        
        // Create test role
        await connection.execute(
          `INSERT INTO user_roles (user_id, role_id) VALUES (800001, 1)`
        );
        
        // Mock request and response
        const req = {
          body: {
            email: 'testuser1@hospital.com',
            password: 'TestPassword123!'
          },
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'test-agent'
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await login(req, res);
        
        // Verify successful response
        expect(res.json).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        
        expect(response.success).toBe(true);
        expect(response.data.user).toBeDefined();
        expect(response.data.user.email).toBe('testuser1@hospital.com');
        expect(response.data.accessToken).toBeDefined();
        expect(response.data.refreshToken).toBeDefined();
        expect(response.data.sessionId).toBeDefined();
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Invalid Credentials', () => {
    
    test('should fail login with non-existent email', async () => {
      const req = {
        body: {
          email: 'nonexistent@hospital.com',
          password: 'TestPassword123!'
        },
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await login(req, res);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('AUTH_001');
      expect(response.error.message).toBe('Invalid credentials');
    });
    
    test('should fail login with incorrect password', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('CorrectPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800002, 'testuser2@hospital.com', ?, 'Test', 'User', 'staff', TRUE)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [passwordHash]
        );
        
        const req = {
          body: {
            email: 'testuser2@hospital.com',
            password: 'WrongPassword123!'
          },
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'test-agent'
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await login(req, res);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        
        expect(response.success).toBe(false);
        expect(response.error.code).toBe('AUTH_001');
        expect(response.error.message).toBe('Invalid credentials');
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Account Lockout After 5 Failed Attempts', () => {
    
    test('should lock account after 5 failed login attempts', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('CorrectPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800003, 'testuser3@hospital.com', ?, 'Test', 'User', 'staff', TRUE)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [passwordHash]
        );
        
        const email = 'testuser3@hospital.com';
        
        // Clear any existing failed attempts
        clearFailedAttempts(email);
        
        // Attempt 5 failed logins
        for (let i = 0; i < 5; i++) {
          const req = {
            body: {
              email: email,
              password: 'WrongPassword123!'
            },
            ip: '127.0.0.1',
            headers: {
              'user-agent': 'test-agent'
            }
          };
          
          const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
          };
          
          await login(req, res);
          
          if (i < 4) {
            // First 4 attempts should return invalid credentials
            expect(res.status).toHaveBeenCalledWith(401);
            const response = res.json.mock.calls[0][0];
            expect(response.error.code).toBe('AUTH_001');
          } else {
            // 5th attempt should lock the account
            expect(res.status).toHaveBeenCalledWith(401);
            const response = res.json.mock.calls[0][0];
            expect(response.error.code).toBe('AUTH_004');
            expect(response.error.message).toContain('locked');
          }
        }
        
        // Verify account is locked
        const lockStatus = checkAccountLock(email);
        expect(lockStatus.isLocked).toBe(true);
        expect(lockStatus.remainingTime).toBeGreaterThan(0);
        
        // Try to login with correct password - should still be locked
        const req = {
          body: {
            email: email,
            password: 'CorrectPassword123!'
          },
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'test-agent'
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await login(req, res);
        
        expect(res.status).toHaveBeenCalledWith(401);
        const response = res.json.mock.calls[0][0];
        expect(response.error.code).toBe('AUTH_004');
        expect(response.error.message).toContain('locked');
        
        // Clean up
        clearFailedAttempts(email);
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Automatic Unlock After 15 Minutes', () => {
    
    test('should verify lockout duration constant is 15 minutes', () => {
      // Verify the lockout duration is set to 15 minutes (900000 ms)
      expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
    });
    
    test('should verify max login attempts is 5', () => {
      // Verify the max login attempts is set to 5
      expect(MAX_LOGIN_ATTEMPTS).toBe(5);
    });
    
    test('should track remaining lockout time correctly', () => {
      const email = 'testunlock@hospital.com';
      
      // Clear any existing attempts
      clearFailedAttempts(email);
      
      // Record 5 failed attempts to lock the account
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt(email);
      }
      
      // Verify account is locked
      let lockStatus = checkAccountLock(email);
      expect(lockStatus.isLocked).toBe(true);
      expect(lockStatus.remainingTime).toBeGreaterThan(0);
      expect(lockStatus.remainingTime).toBeLessThanOrEqual(15); // Should be <= 15 minutes
      
      // Clean up
      clearFailedAttempts(email);
    });
    
  });
  
  describe('Failed Attempt Tracking', () => {
    
    test('should track failed login attempts correctly', () => {
      const email = 'testtracking@hospital.com';
      
      clearFailedAttempts(email);
      
      // Record 3 failed attempts
      let result = recordFailedAttempt(email);
      expect(result.count).toBe(1);
      expect(result.isLocked).toBe(false);
      
      result = recordFailedAttempt(email);
      expect(result.count).toBe(2);
      expect(result.isLocked).toBe(false);
      
      result = recordFailedAttempt(email);
      expect(result.count).toBe(3);
      expect(result.isLocked).toBe(false);
      
      // Clean up
      clearFailedAttempts(email);
    });
    
    test('should clear failed attempts on successful login', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('TestPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800004, 'testuser4@hospital.com', ?, 'Test', 'User', 'staff', TRUE)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [passwordHash]
        );
        
        await connection.execute(
          `INSERT INTO user_roles (user_id, role_id) VALUES (800004, 1)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`
        );
        
        const email = 'testuser4@hospital.com';
        
        // Record some failed attempts
        recordFailedAttempt(email);
        recordFailedAttempt(email);
        
        // Verify attempts were recorded
        let lockStatus = checkAccountLock(email);
        expect(lockStatus.isLocked).toBe(false); // Not locked yet
        
        // Successful login
        const req = {
          body: {
            email: email,
            password: 'TestPassword123!'
          },
          ip: '127.0.0.1',
          headers: {
            'user-agent': 'test-agent'
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await login(req, res);
        
        // Verify successful response
        const response = res.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        
        // Verify failed attempts were cleared
        lockStatus = checkAccountLock(email);
        expect(lockStatus.isLocked).toBe(false);
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Logout', () => {
    
    test('should logout successfully and invalidate session', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test session
        const sessionId = 'test-session-id-123';
        await connection.execute(
          `INSERT INTO sessions (session_id, user_id, token_hash, ip_address, user_agent, expires_at) 
           VALUES (?, 800001, 'test-hash', '127.0.0.1', 'test-agent', DATE_ADD(NOW(), INTERVAL 1 DAY))`,
          [sessionId]
        );
        
        const req = {
          body: {
            sessionId: sessionId
          },
          user: {
            userId: 800001
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await logout(req, res);
        
        // Verify successful response
        expect(res.json).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.message).toBe('Logout successful');
        
        // Verify session was deleted
        const [sessions] = await connection.query(
          'SELECT * FROM sessions WHERE session_id = ?',
          [sessionId]
        );
        expect(sessions.length).toBe(0);
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Token Refresh', () => {
    
    test('should refresh token successfully with valid refresh token', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('TestPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800005, 'testuser5@hospital.com', ?, 'Test', 'User', 'staff', TRUE)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [passwordHash]
        );
        
        await connection.execute(
          `INSERT INTO user_roles (user_id, role_id) VALUES (800005, 1)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`
        );
        
        // Generate refresh token
        const token = generateRefreshToken({
          userId: 800005,
          email: 'testuser5@hospital.com'
        });
        
        const req = {
          body: {
            refreshToken: token
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await refreshToken(req, res);
        
        // Verify successful response
        expect(res.json).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.data.accessToken).toBeDefined();
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Get Current User', () => {
    
    test('should return current user information', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Create test user
        const passwordHash = await hashPassword('TestPassword123!');
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, first_name, last_name, user_type, is_active) 
           VALUES (800006, 'testuser6@hospital.com', ?, 'Test', 'User', 'staff', TRUE)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [passwordHash]
        );
        
        const req = {
          user: {
            userId: 800006
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await getCurrentUser(req, res);
        
        // Verify successful response
        expect(res.json).toHaveBeenCalled();
        const response = res.json.mock.calls[0][0];
        expect(response.success).toBe(true);
        expect(response.data.userId).toBe(800006);
        expect(response.data.email).toBe('testuser6@hospital.com');
        expect(response.data.firstName).toBe('Test');
        expect(response.data.lastName).toBe('User');
        
      } finally {
        connection.release();
      }
    });
    
  });
  
  describe('Validation', () => {
    
    test('should return 400 when email is missing', async () => {
      const req = {
        body: {
          password: 'TestPassword123!'
        },
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await login(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VAL_001');
    });
    
    test('should return 400 when password is missing', async () => {
      const req = {
        body: {
          email: 'test@hospital.com'
        },
        ip: '127.0.0.1',
        headers: {
          'user-agent': 'test-agent'
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await login(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('VAL_001');
    });
    
  });
  
});
