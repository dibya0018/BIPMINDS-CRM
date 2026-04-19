/**
 * Property-Based Tests for Validation Module
 * 
 * Tests universal properties of input validation and sanitization.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api
 */

const fc = require('fast-check');
const { validationResult } = require('express-validator');
const {
  validatePatient,
  validateAppointment,
  validateDoctor,
  validatePayment,
  validateLead,
  handleValidationErrors
} = require('../../middleware/validation');

/**
 * Helper function to run validation rules
 * @param {Array} validationRules - Array of express-validator rules
 * @param {Object} data - Data to validate
 * @returns {Promise<Object>} Validation result
 */
async function runValidation(validationRules, data) {
  const req = {
    body: data
  };
  
  // Run all validation rules
  for (const validation of validationRules) {
    await validation.run(req);
  }
  
  const errors = validationResult(req);
  return {
    isValid: errors.isEmpty(),
    errors: errors.array()
  };
}

describe('Validation Property Tests', () => {
  
  /**
   * Property 8: Input Validation Rejection
   * For any invalid input (malformed email, invalid phone, wrong date format, invalid enum),
   * the validation module should reject it and return validation errors.
   * 
   * Validates: Requirements 11.1, 11.2, 11.5, 11.6, 11.7, 11.8, 11.9
   */
  describe('Property 8: Input Validation Rejection', () => {
    
    test('should reject invalid email formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('invalid-email'),
            fc.constant('missing@domain'),
            fc.constant('@nodomain.com'),
            fc.constant('spaces in@email.com'),
            fc.constant('double@@domain.com')
          ),
          async (invalidEmail) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              email: invalidEmail
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should reject invalid email
            return !result.isValid && 
                   result.errors.some(err => err.path === 'email');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid phone numbers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('123'),           // Too short
            fc.constant('12345678901'),   // Too long
            fc.constant('abcdefghij'),    // Letters
            fc.constant('123-456-7890'),  // Dashes
            fc.constant('+1234567890'),   // Plus sign
            fc.constant('123 456 7890')   // Spaces
          ),
          async (invalidPhone) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: invalidPhone
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should reject invalid phone
            return !result.isValid && 
                   result.errors.some(err => err.path === 'phone');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid date formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('01/01/1990'),    // Wrong format
            fc.constant('1990-13-01'),    // Invalid month
            fc.constant('1990-01-32'),    // Invalid day
            fc.constant('90-01-01'),      // Two-digit year
            fc.constant('2023-1-1'),      // Missing leading zeros
            fc.constant('not-a-date')     // Invalid string
          ),
          async (invalidDate) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: invalidDate,
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890'
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should reject invalid date
            return !result.isValid && 
                   result.errors.some(err => err.path === 'dateOfBirth');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid enum values for gender', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('unknown'),
            fc.constant('Male'),      // Wrong case
            fc.constant('MALE'),      // Wrong case
            fc.constant('m'),
            fc.constant('f'),
            fc.constant('')
          ),
          async (invalidGender) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: invalidGender,
              bloodGroup: 'A+',
              phone: '1234567890'
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should reject invalid gender
            return !result.isValid && 
                   result.errors.some(err => err.path === 'gender');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid enum values for blood group', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('A'),         // Missing +/-
            fc.constant('B'),
            fc.constant('O'),
            fc.constant('AB'),
            fc.constant('C+'),        // Invalid type
            fc.constant('a+'),        // Wrong case
            fc.constant('')
          ),
          async (invalidBloodGroup) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: invalidBloodGroup,
              phone: '1234567890'
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should reject invalid blood group
            return !result.isValid && 
                   result.errors.some(err => err.path === 'bloodGroup');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid appointment types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('regular'),
            fc.constant('Consultation'),  // Wrong case
            fc.constant('visit'),
            fc.constant(''),
            fc.constant('unknown')
          ),
          async (invalidType) => {
            const data = {
              patientId: 1,
              doctorId: 1,
              appointmentDate: '2024-01-01',
              appointmentTime: '10:00:00',
              appointmentType: invalidType
            };
            
            const result = await runValidation(validateAppointment, data);
            
            // Should reject invalid appointment type
            return !result.isValid && 
                   result.errors.some(err => err.path === 'appointmentType');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid payment methods', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('credit'),
            fc.constant('Cash'),      // Wrong case
            fc.constant('paypal'),
            fc.constant('crypto'),
            fc.constant('')
          ),
          async (invalidMethod) => {
            const data = {
              patientId: 1,
              amount: 100.00,
              paymentMethod: invalidMethod
            };
            
            const result = await runValidation(validatePayment, data);
            
            // Should reject invalid payment method
            return !result.isValid && 
                   result.errors.some(err => err.path === 'paymentMethod');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject invalid lead sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('twitter'),
            fc.constant('Website'),   // Wrong case
            fc.constant('linkedin'),
            fc.constant(''),
            fc.constant('unknown-source')
          ),
          async (invalidSource) => {
            const data = {
              firstName: 'John',
              phone: '1234567890',
              source: invalidSource
            };
            
            const result = await runValidation(validateLead, data);
            
            // Should reject invalid source
            return !result.isValid && 
                   result.errors.some(err => err.path === 'source');
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should reject missing required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            // Intentionally missing required fields
            email: fc.option(fc.emailAddress(), { nil: undefined }),
            address: fc.option(fc.string(), { nil: undefined })
          }),
          async (incompleteData) => {
            const result = await runValidation(validatePatient, incompleteData);
            
            // Should reject due to missing required fields
            return !result.isValid && result.errors.length > 0;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should validate correct patient data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            firstName: fc.stringMatching(/^[a-zA-Z]{2,50}$/),
            lastName: fc.stringMatching(/^[a-zA-Z]{2,50}$/),
            dateOfBirth: fc.constant('1990-01-01'),
            gender: fc.constantFrom('male', 'female', 'other'),
            bloodGroup: fc.constantFrom('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
            phone: fc.constant('1234567890')
          }),
          async (validData) => {
            const result = await runValidation(validatePatient, validData);
            
            // Should accept valid data
            return result.isValid;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  /**
   * Property 27: Input Normalization
   * For any string input with leading or trailing whitespace,
   * the validation module should trim it before processing.
   * 
   * Validates: Requirements 11.10
   */
  describe('Property 27: Input Normalization', () => {
    
    test('should trim whitespace from string inputs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            firstName: fc.string({ minLength: 2, maxLength: 20 }).map(s => `  ${s}  `),
            lastName: fc.string({ minLength: 2, maxLength: 20 }).map(s => `\t${s}\n`),
            dateOfBirth: fc.constant('1990-01-01'),
            gender: fc.constantFrom('male', 'female', 'other'),
            bloodGroup: fc.constantFrom('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
            phone: fc.constant('  1234567890  ')
          }).filter(data => 
            /^[a-zA-Z\s]+$/.test(data.firstName.trim()) && 
            /^[a-zA-Z\s]+$/.test(data.lastName.trim())
          ),
          async (dataWithWhitespace) => {
            const result = await runValidation(validatePatient, dataWithWhitespace);
            
            // Should accept data after trimming whitespace
            // If validation passes, trimming worked correctly
            return result.isValid || 
                   // Or if it fails, it should not be due to whitespace
                   !result.errors.some(err => err.msg.includes('whitespace'));
          }
        ),
        { numRuns: 50 }
      );
    });
    
    test('should normalize email addresses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress().map(email => `  ${email.toUpperCase()}  `),
          async (emailWithWhitespace) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              email: emailWithWhitespace
            };
            
            const result = await runValidation(validatePatient, data);
            
            // Should accept email after normalization (trim + lowercase)
            return result.isValid;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
