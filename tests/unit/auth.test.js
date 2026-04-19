/**
 * Unit Tests for Authentication Middleware
 * 
 * Tests authentication middleware with various token scenarios.
 * Validates: Requirements 4.7, 4.8
 */

const { authenticate } = require('../../middleware/auth');
const { generateAccessToken } = require('../../utils/jwt');

describe('Authentication Middleware - Unit Tests', () => {

  // Mock request, response, and next function
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('Valid Token Authentication', () => {
    
    test('should authenticate with valid token and attach user data to request', () => {
      // Generate a valid token
      const user = {
        userId: 1,
        email: 'admin@hospital.com',
        userType: 'admin',
        roles: ['super_admin']
      };
      const token = generateAccessToken(user);
      
      // Set Authorization header
      req.headers.authorization = `Bearer ${token}`;
      
      // Call middleware
      authenticate(req, res, next);
      
      // Verify next() was called
      expect(next).toHaveBeenCalled();
      
      // Verify user data was attached to request
      expect(req.user).toBeDefined();
      expect(req.user.userId).toBe(1);
      expect(req.user.email).toBe('admin@hospital.com');
      expect(req.user.userType).toBe('admin');
      expect(req.user.roles).toEqual(['super_admin']);
      
      // Verify no error response
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('should authenticate with valid token containing multiple roles', () => {
      const user = {
        userId: 2,
        email: 'doctor@hospital.com',
        userType: 'doctor',
        roles: ['doctor', 'admin']
      };
      const token = generateAccessToken(user);
      
      req.headers.authorization = `Bearer ${token}`;
      
      authenticate(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user.roles).toEqual(['doctor', 'admin']);
    });

    test('should authenticate with valid token containing no roles', () => {
      const user = {
        userId: 3,
        email: 'staff@hospital.com',
        userType: 'staff',
        roles: []
      };
      const token = generateAccessToken(user);
      
      req.headers.authorization = `Bearer ${token}`;
      
      authenticate(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user.roles).toEqual([]);
    });

  });

  describe('Missing Token', () => {
    
    test('should return 401 when Authorization header is missing', () => {
      // No Authorization header set
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header is missing'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when Authorization header is empty string', () => {
      req.headers.authorization = '';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header is missing'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when Authorization header does not start with Bearer', () => {
      req.headers.authorization = 'Basic sometoken';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header must use Bearer token format'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token is missing after Bearer prefix', () => {
      req.headers.authorization = 'Bearer ';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Token is missing from Authorization header'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when token is only whitespace after Bearer prefix', () => {
      req.headers.authorization = 'Bearer    ';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Token is missing from Authorization header'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

  });

  describe('Invalid Token', () => {
    
    test('should return 401 with malformed token', () => {
      req.headers.authorization = 'Bearer invalid.token.here';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired token'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 with random string as token', () => {
      req.headers.authorization = 'Bearer randomstringnotavalidtoken';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired token'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 with token signed with different secret', () => {
      // This would be a token signed with a different secret
      // For testing purposes, we'll use a malformed token
      req.headers.authorization = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSJ9.invalid_signature';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired token'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 with empty JSON object as token', () => {
      req.headers.authorization = 'Bearer {}';
      
      authenticate(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Invalid or expired token'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

  });

  describe('Expired Token', () => {
    
    test('should return 401 with expired token', () => {
      // Create a token that's already expired
      // We'll use a manually crafted expired token for testing
      // In real scenario, this would be a token that was valid but has now expired
      const jwt = require('jsonwebtoken');
      const jwtConfig = require('../../config/jwt');
      
      const expiredToken = jwt.sign(
        {
          userId: 1,
          email: 'test@hospital.com',
          userType: 'admin',
          roles: ['admin']
        },
        jwtConfig.secret,
        {
          expiresIn: '0s', // Expires immediately
          issuer: jwtConfig.issuer,
          audience: jwtConfig.audience
        }
      );
      
      // Wait a moment to ensure token is expired
      setTimeout(() => {
        req.headers.authorization = `Bearer ${expiredToken}`;
        
        authenticate(req, res, next);
        
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: {
            code: 'AUTH_002',
            message: 'Invalid or expired token'
          }
        });
        expect(next).not.toHaveBeenCalled();
      }, 100);
    });

  });

  describe('Edge Cases', () => {
    
    test('should handle Authorization header with extra spaces', () => {
      const user = {
        userId: 1,
        email: 'admin@hospital.com',
        userType: 'admin',
        roles: ['super_admin']
      };
      const token = generateAccessToken(user);
      
      // Extra spaces after Bearer
      req.headers.authorization = `Bearer  ${token}`;
      
      authenticate(req, res, next);
      
      // Should fail because token extraction includes the extra space
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle lowercase bearer in Authorization header', () => {
      const user = {
        userId: 1,
        email: 'admin@hospital.com',
        userType: 'admin',
        roles: ['super_admin']
      };
      const token = generateAccessToken(user);
      
      req.headers.authorization = `bearer ${token}`;
      
      authenticate(req, res, next);
      
      // Should fail because we check for "Bearer " with capital B
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Authorization header must use Bearer token format'
        }
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should not modify request object when authentication fails', () => {
      req.headers.authorization = 'Bearer invalidtoken';
      
      authenticate(req, res, next);
      
      expect(req.user).toBeUndefined();
    });

  });

});
