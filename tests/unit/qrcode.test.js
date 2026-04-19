/**
 * Unit Tests for QR Code System
 * 
 * Tests specific examples and edge cases for QR code generation and decryption.
 * Validates: Requirements 7.6
 */

const { generateQRData, decryptQRData, generateQRImage, generateQRBuffer, calculateChecksum } = require('../../utils/qrCode');

describe('QR Code System - Unit Tests', () => {

  describe('generateQRData - Input Validation', () => {
    
    test('should throw error for invalid patient ID (zero)', () => {
      expect(() => generateQRData(0, 'P-123456')).toThrow('Patient ID must be a positive number');
    });

    test('should throw error for invalid patient ID (negative)', () => {
      expect(() => generateQRData(-1, 'P-123456')).toThrow('Patient ID must be a positive number');
    });

    test('should throw error for invalid patient ID (null)', () => {
      expect(() => generateQRData(null, 'P-123456')).toThrow('Patient ID must be a positive number');
    });

    test('should throw error for invalid patient ID (undefined)', () => {
      expect(() => generateQRData(undefined, 'P-123456')).toThrow('Patient ID must be a positive number');
    });

    test('should throw error for invalid patient ID (string)', () => {
      expect(() => generateQRData('123', 'P-123456')).toThrow('Patient ID must be a positive number');
    });

    test('should throw error for empty patient code', () => {
      expect(() => generateQRData(123, '')).toThrow('Patient code must be a non-empty string');
    });

    test('should throw error for whitespace-only patient code', () => {
      expect(() => generateQRData(123, '   ')).toThrow('Patient code must be a non-empty string');
    });

    test('should throw error for null patient code', () => {
      expect(() => generateQRData(123, null)).toThrow('Patient code must be a non-empty string');
    });

    test('should throw error for undefined patient code', () => {
      expect(() => generateQRData(123, undefined)).toThrow('Patient code must be a non-empty string');
    });

    test('should throw error for non-string patient code', () => {
      expect(() => generateQRData(123, 12345)).toThrow('Patient code must be a non-empty string');
    });

    test('should accept patient code with leading/trailing whitespace and trim it', () => {
      const encrypted1 = generateQRData(123, '  P-123456  ');
      const encrypted2 = generateQRData(123, 'P-123456');
      
      const decrypted1 = decryptQRData(encrypted1);
      const decrypted2 = decryptQRData(encrypted2);
      
      expect(decrypted1.patientCode).toBe('P-123456');
      expect(decrypted2.patientCode).toBe('P-123456');
    });

  });

  describe('decryptQRData - Input Validation', () => {
    
    test('should throw error for empty QR data', () => {
      expect(() => decryptQRData('')).toThrow('QR data must be a non-empty string');
    });

    test('should throw error for null QR data', () => {
      expect(() => decryptQRData(null)).toThrow('QR data must be a non-empty string');
    });

    test('should throw error for undefined QR data', () => {
      expect(() => decryptQRData(undefined)).toThrow('QR data must be a non-empty string');
    });

    test('should throw error for non-string QR data', () => {
      expect(() => decryptQRData(12345)).toThrow('QR data must be a non-empty string');
    });

    test('should throw error for invalid QR data format (missing colon)', () => {
      expect(() => decryptQRData('invaliddata')).toThrow('Invalid QR data format');
    });

    test('should throw error for invalid QR data format (too many parts)', () => {
      expect(() => decryptQRData('part1:part2:part3')).toThrow('Invalid QR data format');
    });

    test('should throw error for invalid IV length', () => {
      // IV should be 16 bytes (32 hex characters), this is only 8 bytes
      const invalidQR = 'abcdef1234567890:' + 'a'.repeat(64);
      expect(() => decryptQRData(invalidQR)).toThrow();
    });

    test('should throw error for non-hex IV', () => {
      const invalidQR = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ:' + 'a'.repeat(64);
      expect(() => decryptQRData(invalidQR)).toThrow();
    });

  });

  describe('decryptQRData - Checksum Validation', () => {
    
    test('should fail checksum validation for tampered data', () => {
      // Generate valid QR data
      const encrypted = generateQRData(123, 'P-123456');
      
      // Tamper with the encrypted data
      const parts = encrypted.split(':');
      const tamperedEncrypted = parts[0] + ':' + parts[1].substring(0, parts[1].length - 2) + 'FF';
      
      // Should throw checksum validation error
      expect(() => decryptQRData(tamperedEncrypted)).toThrow();
    });

    test('should pass checksum validation for valid data', () => {
      const encrypted = generateQRData(123, 'P-123456');
      const decrypted = decryptQRData(encrypted);
      
      expect(decrypted.patientId).toBe(123);
      expect(decrypted.patientCode).toBe('P-123456');
    });

  });

  describe('decryptQRData - Expired QR Codes', () => {
    
    test('should successfully decrypt QR code regardless of age', () => {
      // Note: The current implementation doesn't enforce expiration
      // This test documents the current behavior
      const encrypted = generateQRData(123, 'P-123456');
      
      // Decrypt immediately
      const decrypted = decryptQRData(encrypted);
      
      expect(decrypted.patientId).toBe(123);
      expect(decrypted.patientCode).toBe('P-123456');
      expect(decrypted.timestamp).toBeLessThanOrEqual(Date.now());
    });

    test('should include timestamp in decrypted data for expiration checking', () => {
      const beforeTime = Date.now();
      const encrypted = generateQRData(123, 'P-123456');
      const afterTime = Date.now();
      
      const decrypted = decryptQRData(encrypted);
      
      // Timestamp should be between before and after times
      expect(decrypted.timestamp).toBeGreaterThanOrEqual(beforeTime - 100);
      expect(decrypted.timestamp).toBeLessThanOrEqual(afterTime + 100);
    });

  });

  describe('generateQRImage - QR Code Image Generation', () => {
    
    test('should generate QR code image as data URL', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const dataUrl = await generateQRImage(encrypted);
      
      expect(dataUrl).toBeDefined();
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('should throw error for empty QR data', async () => {
      await expect(generateQRImage('')).rejects.toThrow('QR data must be a non-empty string');
    });

    test('should throw error for null QR data', async () => {
      await expect(generateQRImage(null)).rejects.toThrow('QR data must be a non-empty string');
    });

    test('should accept custom width option', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const dataUrl = await generateQRImage(encrypted, { width: 500 });
      
      expect(dataUrl).toBeDefined();
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('should accept custom error correction level', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const dataUrl = await generateQRImage(encrypted, { errorCorrectionLevel: 'H' });
      
      expect(dataUrl).toBeDefined();
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    test('should accept custom colors', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const dataUrl = await generateQRImage(encrypted, {
        color: {
          dark: '#FF0000',
          light: '#FFFFFF'
        }
      });
      
      expect(dataUrl).toBeDefined();
      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

  });

  describe('generateQRBuffer - QR Code Buffer Generation', () => {
    
    test('should generate QR code as buffer', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const buffer = await generateQRBuffer(encrypted);
      
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    test('should throw error for empty QR data', async () => {
      await expect(generateQRBuffer('')).rejects.toThrow('QR data must be a non-empty string');
    });

    test('should throw error for null QR data', async () => {
      await expect(generateQRBuffer(null)).rejects.toThrow('QR data must be a non-empty string');
    });

    test('should accept custom width option', async () => {
      const encrypted = generateQRData(123, 'P-123456');
      const buffer = await generateQRBuffer(encrypted, { width: 500 });
      
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

  });

  describe('calculateChecksum - Checksum Calculation', () => {
    
    test('should generate consistent checksum for same data', () => {
      const data = 'test data';
      const checksum1 = calculateChecksum(data);
      const checksum2 = calculateChecksum(data);
      
      expect(checksum1).toBe(checksum2);
    });

    test('should generate different checksums for different data', () => {
      const checksum1 = calculateChecksum('data1');
      const checksum2 = calculateChecksum('data2');
      
      expect(checksum1).not.toBe(checksum2);
    });

    test('should generate 8-character checksum', () => {
      const checksum = calculateChecksum('test data');
      
      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBe(8);
    });

    test('should generate hex checksum', () => {
      const checksum = calculateChecksum('test data');
      
      expect(checksum).toMatch(/^[0-9a-f]{8}$/);
    });

  });

  describe('Integration - Complete QR Code Workflow', () => {
    
    test('should complete full workflow: generate -> encrypt -> decrypt -> verify', () => {
      const patientId = 12345;
      const patientCode = 'P-987654';
      
      // Generate encrypted QR data
      const encrypted = generateQRData(patientId, patientCode);
      
      // Verify encrypted format
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
      
      // Decrypt QR data
      const decrypted = decryptQRData(encrypted);
      
      // Verify decrypted data
      expect(decrypted.patientId).toBe(patientId);
      expect(decrypted.patientCode).toBe(patientCode);
      expect(decrypted.timestamp).toBeLessThanOrEqual(Date.now());
      expect(decrypted.version).toBe('1.0');
    });

    test('should handle special characters in patient code', () => {
      const patientId = 999;
      const patientCode = 'P-ABC-123_XYZ';
      
      const encrypted = generateQRData(patientId, patientCode);
      const decrypted = decryptQRData(encrypted);
      
      expect(decrypted.patientId).toBe(patientId);
      expect(decrypted.patientCode).toBe(patientCode);
    });

    test('should handle very large patient IDs', () => {
      const patientId = 999999999;
      const patientCode = 'P-999999';
      
      const encrypted = generateQRData(patientId, patientCode);
      const decrypted = decryptQRData(encrypted);
      
      expect(decrypted.patientId).toBe(patientId);
      expect(decrypted.patientCode).toBe(patientCode);
    });

    test('should handle long patient codes', () => {
      const patientId = 123;
      const patientCode = 'P-' + 'A'.repeat(50);
      
      const encrypted = generateQRData(patientId, patientCode);
      const decrypted = decryptQRData(encrypted);
      
      expect(decrypted.patientId).toBe(patientId);
      expect(decrypted.patientCode).toBe(patientCode);
    });

  });

});
