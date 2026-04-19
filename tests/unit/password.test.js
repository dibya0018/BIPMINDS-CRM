/**
 * Unit Tests for Password Security
 * 
 * Tests specific examples and edge cases for password validation.
 * Validates: Requirements 20.3
 */

const { hashPassword, verifyPassword, isStrongPassword } = require('../../utils/password');

describe('Password Security - Unit Tests', () => {

  describe('isStrongPassword - Password Complexity Requirements', () => {
    
    test('should accept valid strong password', () => {
      const validPasswords = [
        'Password123!',
        'MyP@ssw0rd',
        'Str0ng!Pass',
        'C0mpl3x@Pass',
        'Test123!@#',
        'Abcd1234!',
        'P@ssw0rd123',
        'MySecure1!'
      ];

      validPasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(true);
      });
    });

    test('should reject password shorter than 8 characters', () => {
      const shortPasswords = [
        'Pass1!',      // 6 chars
        'Ab1!',        // 4 chars
        'Test1!',      // 6 chars
        'Pw1!',        // 4 chars
        ''             // empty
      ];

      shortPasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });

    test('should reject password without uppercase letter', () => {
      const noUppercasePasswords = [
        'password123!',
        'myp@ssw0rd',
        'test1234!',
        'lowercase1!'
      ];

      noUppercasePasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });

    test('should reject password without lowercase letter', () => {
      const noLowercasePasswords = [
        'PASSWORD123!',
        'MYP@SSW0RD',
        'TEST1234!',
        'UPPERCASE1!'
      ];

      noLowercasePasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });

    test('should reject password without number', () => {
      const noNumberPasswords = [
        'Password!',
        'MyP@ssword',
        'Strong!Pass',
        'NoNumbers!'
      ];

      noNumberPasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });

    test('should reject password without special character', () => {
      const noSpecialCharPasswords = [
        'Password123',
        'MyPassw0rd',
        'Strong1Pass',
        'NoSpecial1'
      ];

      noSpecialCharPasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });

    test('should reject null or undefined password', () => {
      expect(isStrongPassword(null)).toBe(false);
      expect(isStrongPassword(undefined)).toBe(false);
    });

    test('should reject non-string password', () => {
      expect(isStrongPassword(12345678)).toBe(false);
      expect(isStrongPassword({})).toBe(false);
      expect(isStrongPassword([])).toBe(false);
      expect(isStrongPassword(true)).toBe(false);
    });

    test('should accept password with various special characters', () => {
      const specialCharPasswords = [
        'Password1!',
        'Password1@',
        'Password1#',
        'Password1$',
        'Password1%',
        'Password1^',
        'Password1&',
        'Password1*',
        'Password1(',
        'Password1)',
        'Password1_',
        'Password1+',
        'Password1-',
        'Password1=',
        'Password1[',
        'Password1]',
        'Password1{',
        'Password1}',
        'Password1;',
        'Password1:',
        'Password1\'',
        'Password1"',
        'Password1\\',
        'Password1|',
        'Password1,',
        'Password1.',
        'Password1<',
        'Password1>',
        'Password1/',
        'Password1?'
      ];

      specialCharPasswords.forEach(password => {
        expect(isStrongPassword(password)).toBe(true);
      });
    });

    test('should reject password with only whitespace', () => {
      expect(isStrongPassword('        ')).toBe(false);
      expect(isStrongPassword('\t\t\t\t')).toBe(false);
      expect(isStrongPassword('\n\n\n\n')).toBe(false);
    });

    test('should accept password exactly 8 characters (boundary)', () => {
      expect(isStrongPassword('Pass123!')).toBe(true);
    });

    test('should accept very long password', () => {
      const longPassword = 'P@ssw0rd' + '1234567890'.repeat(10);
      expect(isStrongPassword(longPassword)).toBe(true);
    });

  });

  describe('hashPassword - Error Handling', () => {
    
    test('should throw error for empty password', async () => {
      await expect(hashPassword('')).rejects.toThrow('Password must be a non-empty string');
    });

    test('should throw error for null password', async () => {
      await expect(hashPassword(null)).rejects.toThrow('Password must be a non-empty string');
    });

    test('should throw error for undefined password', async () => {
      await expect(hashPassword(undefined)).rejects.toThrow('Password must be a non-empty string');
    });

    test('should throw error for non-string password', async () => {
      await expect(hashPassword(12345)).rejects.toThrow('Password must be a non-empty string');
      await expect(hashPassword({})).rejects.toThrow('Password must be a non-empty string');
      await expect(hashPassword([])).rejects.toThrow('Password must be a non-empty string');
    });

  });

  describe('verifyPassword - Error Handling', () => {
    
    test('should throw error for empty password', async () => {
      const hash = await hashPassword('ValidPass123!');
      await expect(verifyPassword('', hash)).rejects.toThrow('Password must be a non-empty string');
    });

    test('should throw error for null password', async () => {
      const hash = await hashPassword('ValidPass123!');
      await expect(verifyPassword(null, hash)).rejects.toThrow('Password must be a non-empty string');
    });

    test('should throw error for empty hash', async () => {
      await expect(verifyPassword('ValidPass123!', '')).rejects.toThrow('Hash must be a non-empty string');
    });

    test('should throw error for null hash', async () => {
      await expect(verifyPassword('ValidPass123!', null)).rejects.toThrow('Hash must be a non-empty string');
    });

  });

  describe('Integration - Hash and Verify', () => {
    
    test('should successfully hash and verify a valid password', async () => {
      const password = 'MySecureP@ss123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });

    test('should fail verification with wrong password', async () => {
      const password = 'MySecureP@ss123';
      const wrongPassword = 'WrongP@ss123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(wrongPassword, hash);
      
      expect(isValid).toBe(false);
    });

    test('should produce different hashes for same password', async () => {
      const password = 'MySecureP@ss123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should verify password with special characters', async () => {
      const password = 'P@$$w0rd!#$%^&*()';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });

    test('should verify very long password', async () => {
      const password = 'P@ssw0rd' + '1234567890'.repeat(20);
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      
      expect(isValid).toBe(true);
    });

  });

});
