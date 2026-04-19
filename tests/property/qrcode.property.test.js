/**
 * Property-Based Tests for QR Code System
 * 
 * Tests universal properties that should hold for all QR code operations.
 * Uses fast-check for property-based testing with reduced iterations for faster execution.
 */

const fc = require('fast-check');
const { generateQRData, decryptQRData } = require('../../utils/qrCode');

describe('QR Code System - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 1: QR Code Round Trip
   * 
   * For any patient with a valid patient ID and patient code, encrypting then decrypting
   * the QR code data should produce the original patient ID and patient code.
   * 
   * Validates: Requirements 7.1, 7.2, 7.5
   */
  describe('Property 1: QR Code Round Trip', () => {
    
    test('encrypting and decrypting QR data should preserve patient information', () => {
      fc.assert(
        fc.property(
          fc.record({
            patientId: fc.integer({ min: 1, max: 1000000 }),
            patientCode: fc.string({ minLength: 1, maxLength: 12 }).map(s => `P-${s.trim() || 'X'}`)
          }),
          (data) => {
            // Generate encrypted QR data
            const encrypted = generateQRData(data.patientId, data.patientCode);
            
            // Property 1: Encrypted data should be a non-empty string
            const encryptedIsString = typeof encrypted === 'string' && encrypted.length > 0;
            
            // Property 2: Encrypted data should contain IV and encrypted parts (format: IV:EncryptedData)
            const hasCorrectFormat = encrypted.includes(':') && encrypted.split(':').length === 2;
            
            // Decrypt the QR data
            const decrypted = decryptQRData(encrypted);
            
            // Property 3: Decrypted patient ID should match original
            const patientIdMatches = decrypted.patientId === data.patientId;
            
            // Property 4: Decrypted patient code should match original
            const patientCodeMatches = decrypted.patientCode === data.patientCode;
            
            // Property 5: Decrypted data should include timestamp
            const hasTimestamp = typeof decrypted.timestamp === 'number' && decrypted.timestamp > 0;
            
            // Property 6: Decrypted data should include version
            const hasVersion = typeof decrypted.version === 'string' && decrypted.version.length > 0;
            
            return encryptedIsString && 
                   hasCorrectFormat && 
                   patientIdMatches && 
                   patientCodeMatches && 
                   hasTimestamp && 
                   hasVersion;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('same patient data should produce different encrypted values due to random IV', () => {
      fc.assert(
        fc.property(
          fc.record({
            patientId: fc.integer({ min: 1, max: 1000000 }),
            patientCode: fc.string({ minLength: 1, maxLength: 12 }).map(s => `P-${s.trim() || 'X'}`)
          }),
          (data) => {
            // Generate two encrypted QR codes for the same patient
            const encrypted1 = generateQRData(data.patientId, data.patientCode);
            const encrypted2 = generateQRData(data.patientId, data.patientCode);
            
            // Property 1: Encrypted values should be different due to random IV
            const encryptedAreDifferent = encrypted1 !== encrypted2;
            
            // Property 2: Both should decrypt to the same patient data
            const decrypted1 = decryptQRData(encrypted1);
            const decrypted2 = decryptQRData(encrypted2);
            
            const bothDecryptCorrectly = 
              decrypted1.patientId === data.patientId &&
              decrypted1.patientCode === data.patientCode &&
              decrypted2.patientId === data.patientId &&
              decrypted2.patientCode === data.patientCode;
            
            return encryptedAreDifferent && bothDecryptCorrectly;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('encrypted QR data should not contain plaintext patient information', () => {
      fc.assert(
        fc.property(
          fc.record({
            patientId: fc.integer({ min: 100, max: 1000000 }),
            patientCode: fc.string({ minLength: 5, maxLength: 12 }).map(s => `P-${s.trim() || 'XXXXX'}`)
          }),
          (data) => {
            // Generate encrypted QR data
            const encrypted = generateQRData(data.patientId, data.patientCode);
            
            // Property: Encrypted data should not contain plaintext patient code
            // Note: We can't check for patient ID as single digits might appear in hex encoding
            const doesNotContainPatientCode = !encrypted.includes(data.patientCode);
            
            return doesNotContainPatientCode;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('decryption should fail for tampered QR data', () => {
      fc.assert(
        fc.property(
          fc.record({
            patientId: fc.integer({ min: 1, max: 1000000 }),
            patientCode: fc.string({ minLength: 1, maxLength: 12 }).map(s => `P-${s.trim() || 'X'}`)
          }),
          (data) => {
            // Generate encrypted QR data
            const encrypted = generateQRData(data.patientId, data.patientCode);
            
            // Tamper with the encrypted data by changing a character
            const tamperedIndex = Math.floor(encrypted.length / 2);
            const tamperedChar = encrypted[tamperedIndex] === 'a' ? 'b' : 'a';
            const tampered = encrypted.substring(0, tamperedIndex) + 
                           tamperedChar + 
                           encrypted.substring(tamperedIndex + 1);
            
            // Property: Decrypting tampered data should throw an error
            let threwError = false;
            try {
              decryptQRData(tampered);
            } catch (error) {
              threwError = true;
            }
            
            return threwError;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('timestamp in decrypted data should be close to current time', () => {
      fc.assert(
        fc.property(
          fc.record({
            patientId: fc.integer({ min: 1, max: 1000000 }),
            patientCode: fc.string({ minLength: 1, maxLength: 12 }).map(s => `P-${s.trim() || 'X'}`)
          }),
          (data) => {
            const beforeTime = Date.now();
            
            // Generate and decrypt QR data
            const encrypted = generateQRData(data.patientId, data.patientCode);
            const decrypted = decryptQRData(encrypted);
            
            const afterTime = Date.now();
            
            // Property: Timestamp should be between before and after times (within reasonable margin)
            const timestampIsValid = 
              decrypted.timestamp >= beforeTime - 1000 && 
              decrypted.timestamp <= afterTime + 1000;
            
            return timestampIsValid;
          }
        ),
        { numRuns: 20 }
      );
    });

  });

});
