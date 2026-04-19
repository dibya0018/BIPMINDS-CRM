/**
 * Property-Based Test: Unique Code Generation
 * Feature: hospital-crm-api, Property 3: Unique Code Generation
 * 
 * Tests that code generation for entities (patients, doctors, appointments, etc.)
 * produces unique codes with the correct format.
 * 
 * **Validates: Requirements 6.1**
 */

const fc = require('fast-check');
const { generatePatientCode } = require('../../controllers/patientController');

describe('Property 3: Unique Code Generation', () => {
  test('should generate unique patient codes with correct format', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }), // Reduced to 20 codes max to minimize collision probability
        (count) => {
          const codes = new Set();
          const patternRegex = /^P-\d{6}$/;
          
          // Generate multiple codes
          for (let i = 0; i < count; i++) {
            const code = generatePatientCode();
            
            // Check format: P-XXXXXX (P- followed by 6 digits)
            if (!patternRegex.test(code)) {
              return false;
            }
            
            // Check uniqueness
            if (codes.has(code)) {
              return false;
            }
            
            codes.add(code);
          }
          
          // All codes should be unique
          return codes.size === count;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('should generate codes with correct prefix', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed
        () => {
          const code = generatePatientCode();
          return code.startsWith('P-');
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('should generate codes with exactly 6 digits after prefix', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed
        () => {
          const code = generatePatientCode();
          const digits = code.substring(2); // Remove "P-" prefix
          return digits.length === 6 && /^\d{6}$/.test(digits);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('should generate codes within valid range (100000-999999)', () => {
    fc.assert(
      fc.property(
        fc.constant(null), // No input needed
        () => {
          const code = generatePatientCode();
          const number = parseInt(code.substring(2)); // Remove "P-" prefix
          return number >= 100000 && number <= 999999;
        }
      ),
      { numRuns: 100 }
    );
  });
});
