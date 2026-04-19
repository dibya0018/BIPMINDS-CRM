/**
 * Property-Based Tests for JWT Authentication
 * 
 * Tests universal properties that should hold for all JWT token operations.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 4: JWT Token Validity
 */

const fc = require('fast-check');
const { generateAccessToken, generateRefreshToken, verifyToken } = require('../../utils/jwt');

describe('JWT Authentication - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 4: JWT Token Validity
   * 
   * For any authenticated user, the generated JWT token should contain user ID, email,
   * user type, and roles, and should be verifiable until expiration.
   * 
   * Validates: Requirements 4.2, 4.3, 4.4, 4.7
   */
  describe('Property 4: JWT Token Validity', () => {
    
    test('access token should contain all required user data and be verifiable', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress(),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.array(
              fc.constantFrom('super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant'),
              { minLength: 0, maxLength: 3 }
            )
          }),
          (user) => {
            // Generate access token
            const token = generateAccessToken(user);
            
            // Property 1: Token should be a non-empty string
            const tokenIsString = typeof token === 'string' && token.length > 0;
            
            // Property 2: Token should have JWT format (three parts separated by dots)
            const tokenParts = token.split('.');
            const tokenHasCorrectFormat = tokenParts.length === 3;
            
            // Property 3: Token should be verifiable
            const decoded = verifyToken(token);
            const tokenIsVerifiable = decoded !== null;
            
            if (!tokenIsVerifiable) {
              return false;
            }
            
            // Property 4: Decoded token should contain user ID
            const hasUserId = decoded.userId === user.userId;
            
            // Property 5: Decoded token should contain email
            const hasEmail = decoded.email === user.email;
            
            // Property 6: Decoded token should contain user type
            const hasUserType = decoded.userType === user.userType;
            
            // Property 7: Decoded token should contain roles array
            const hasRoles = Array.isArray(decoded.roles);
            
            // Property 8: Roles should match original roles
            const rolesMatch = JSON.stringify(decoded.roles) === JSON.stringify(user.roles);
            
            // Property 9: Token should have expiration time (exp claim)
            const hasExpiration = typeof decoded.exp === 'number' && decoded.exp > 0;
            
            // Property 10: Token should have issued at time (iat claim)
            const hasIssuedAt = typeof decoded.iat === 'number' && decoded.iat > 0;
            
            // Property 11: Expiration should be after issued at
            const expirationAfterIssuedAt = decoded.exp > decoded.iat;
            
            return tokenIsString && 
                   tokenHasCorrectFormat && 
                   tokenIsVerifiable && 
                   hasUserId && 
                   hasEmail && 
                   hasUserType && 
                   hasRoles && 
                   rolesMatch && 
                   hasExpiration && 
                   hasIssuedAt && 
                   expirationAfterIssuedAt;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('refresh token should contain user ID and email and be verifiable', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress()
          }),
          (user) => {
            // Generate refresh token
            const token = generateRefreshToken(user);
            
            // Property 1: Token should be a non-empty string
            const tokenIsString = typeof token === 'string' && token.length > 0;
            
            // Property 2: Token should have JWT format
            const tokenParts = token.split('.');
            const tokenHasCorrectFormat = tokenParts.length === 3;
            
            // Property 3: Token should be verifiable
            const decoded = verifyToken(token);
            const tokenIsVerifiable = decoded !== null;
            
            if (!tokenIsVerifiable) {
              return false;
            }
            
            // Property 4: Decoded token should contain user ID
            const hasUserId = decoded.userId === user.userId;
            
            // Property 5: Decoded token should contain email
            const hasEmail = decoded.email === user.email;
            
            // Property 6: Decoded token should have type marker
            const hasTypeMarker = decoded.type === 'refresh';
            
            // Property 7: Token should have expiration time
            const hasExpiration = typeof decoded.exp === 'number' && decoded.exp > 0;
            
            // Property 8: Token should have issued at time
            const hasIssuedAt = typeof decoded.iat === 'number' && decoded.iat > 0;
            
            return tokenIsString && 
                   tokenHasCorrectFormat && 
                   tokenIsVerifiable && 
                   hasUserId && 
                   hasEmail && 
                   hasTypeMarker && 
                   hasExpiration && 
                   hasIssuedAt;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('invalid tokens should not verify', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 200 }),
          (invalidToken) => {
            // Skip if the string happens to be a valid JWT format
            const parts = invalidToken.split('.');
            if (parts.length === 3) {
              // This might be a valid JWT, skip it
              return true;
            }
            
            // Property: Invalid tokens should return null when verified
            const decoded = verifyToken(invalidToken);
            return decoded === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('tokens for same user should verify and contain same user data', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress(),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.array(
              fc.constantFrom('super_admin', 'admin', 'doctor', 'nurse'),
              { minLength: 1, maxLength: 2 }
            )
          }),
          (user) => {
            // Generate two tokens for the same user
            const token1 = generateAccessToken(user);
            const token2 = generateAccessToken(user);
            
            // Property 1: Both tokens should verify
            const decoded1 = verifyToken(token1);
            const decoded2 = verifyToken(token2);
            
            const token1Verifies = decoded1 !== null;
            const token2Verifies = decoded2 !== null;
            
            if (!decoded1 || !decoded2) {
              return false;
            }
            
            // Property 2: Both tokens should contain same user data
            const sameUserId = decoded1.userId === decoded2.userId;
            const sameEmail = decoded1.email === decoded2.email;
            const sameUserType = decoded1.userType === decoded2.userType;
            
            // Property 3: Roles should match
            const rolesMatch = JSON.stringify(decoded1.roles) === JSON.stringify(decoded2.roles);
            
            // Property 4: Tokens may be identical if generated in same second (JWT uses second precision)
            // OR they may be different if generated in different seconds
            // Both are valid behaviors
            const tokensValid = token1.length > 0 && token2.length > 0;
            
            return token1Verifies && 
                   token2Verifies && 
                   sameUserId && 
                   sameEmail && 
                   sameUserType && 
                   rolesMatch &&
                   tokensValid;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('token verification should be consistent for the same token', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress(),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.array(fc.string(), { minLength: 0, maxLength: 3 })
          }),
          (user) => {
            // Generate a token
            const token = generateAccessToken(user);
            
            // Verify the token multiple times
            const decoded1 = verifyToken(token);
            const decoded2 = verifyToken(token);
            const decoded3 = verifyToken(token);
            
            // Property 1: All verifications should succeed
            const allVerified = decoded1 !== null && decoded2 !== null && decoded3 !== null;
            
            if (!allVerified) {
              return false;
            }
            
            // Property 2: All decoded payloads should be identical
            const payload1 = JSON.stringify(decoded1);
            const payload2 = JSON.stringify(decoded2);
            const payload3 = JSON.stringify(decoded3);
            
            return payload1 === payload2 && payload2 === payload3;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('tokens should have issuer and audience claims', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress(),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.array(fc.string(), { minLength: 0, maxLength: 3 })
          }),
          (user) => {
            // Generate access token
            const token = generateAccessToken(user);
            const decoded = verifyToken(token);
            
            if (!decoded) {
              return false;
            }
            
            // Property 1: Token should have issuer claim
            const hasIssuer = typeof decoded.iss === 'string' && decoded.iss.length > 0;
            
            // Property 2: Token should have audience claim
            const hasAudience = typeof decoded.aud === 'string' && decoded.aud.length > 0;
            
            return hasIssuer && hasAudience;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('empty roles array should be handled correctly', async () => {
      await fc.assert(
        fc.property(
          fc.record({
            userId: fc.integer({ min: 1, max: 1000000 }),
            email: fc.emailAddress(),
            userType: fc.constantFrom('admin', 'doctor', 'staff', 'receptionist'),
            roles: fc.constant([])
          }),
          (user) => {
            // Generate token with empty roles
            const token = generateAccessToken(user);
            const decoded = verifyToken(token);
            
            if (!decoded) {
              return false;
            }
            
            // Property: Empty roles array should be preserved
            const rolesIsEmptyArray = Array.isArray(decoded.roles) && decoded.roles.length === 0;
            
            return rolesIsEmptyArray;
          }
        ),
        { numRuns: 50 }
      );
    });

  });

});
