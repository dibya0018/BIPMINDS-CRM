/**
 * Property-Based Tests for Password Security
 * 
 * Tests universal properties that should hold for all password operations.
 * Uses fast-check for property-based testing with reduced iterations for faster execution.
 */

const fc = require('fast-check');
const { hashPassword, verifyPassword, isStrongPassword } = require('../../utils/password');

describe('Password Security - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 2: Password Hashing Security
   * 
   * For any valid password, the system should never store the plain text password,
   * and the hashed password should verify correctly using bcrypt.
   * 
   * Validates: Requirements 20.1, 20.2, 20.3
   */
  describe('Property 2: Password Hashing Security', () => {
    
    test('password hashing and verification properties', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 50 }),
          async (password) => {
            // Skip empty or whitespace-only passwords
            if (!password || password.trim().length === 0) {
              return true;
            }
            
            const hash = await hashPassword(password);
            
            // Property 1: Hash should never equal the original password
            const hashNotEqualPassword = hash !== password;
            
            // Property 2: Hash should be a non-empty string
            const hashIsString = typeof hash === 'string' && hash.length > 0;
            
            // Property 3: Hash should start with bcrypt identifier and salt rounds ($2b$12$)
            const hashHasCorrectFormat = hash.startsWith('$2b$12$');
            
            // Property 4: Original password should verify against its hash
            const passwordVerifies = await verifyPassword(password, hash);
            
            return hashNotEqualPassword && hashIsString && hashHasCorrectFormat && passwordVerifies;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('different passwords should not verify against same hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 50 }),
          fc.string({ minLength: 8, maxLength: 50 }),
          async (password1, password2) => {
            // Skip empty or whitespace-only passwords
            if (!password1 || password1.trim().length === 0) {
              return true;
            }
            if (!password2 || password2.trim().length === 0) {
              return true;
            }
            
            // Only test when passwords are different
            if (password1 === password2) {
              return true;
            }
            
            const hash = await hashPassword(password1);
            const isValid = await verifyPassword(password2, hash);
            
            // Property: Different password should not verify against hash
            return isValid === false;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('same password should produce different hashes with random salts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 8, maxLength: 50 }),
          async (password) => {
            // Skip empty or whitespace-only passwords
            if (!password || password.trim().length === 0) {
              return true;
            }
            
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);
            
            // Property 1: Same password should produce different hashes due to random salt
            const hashesAreDifferent = hash1 !== hash2;
            
            // Property 2: Both hashes should verify with the original password
            const hash1Verifies = await verifyPassword(password, hash1);
            const hash2Verifies = await verifyPassword(password, hash2);
            
            return hashesAreDifferent && hash1Verifies && hash2Verifies;
          }
        ),
        { numRuns: 10 }
      );
    }, 60000);

  });

});
