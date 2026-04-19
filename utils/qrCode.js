/**
 * QR Code Utility Module
 * 
 * Provides functions for generating and decrypting QR codes for patient identification.
 * Uses AES-256-CBC encryption for secure QR code data.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */

const crypto = require('crypto');
const QRCode = require('qrcode');

// Encryption configuration
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.QR_ENCRYPTION_KEY;
const QR_VERSION = '1.0';

/**
 * Validate encryption key
 */
function validateEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('QR_ENCRYPTION_KEY environment variable is not set');
  }
  
  // AES-256 requires a 32-byte (256-bit) key
  if (ENCRYPTION_KEY.length !== 32) {
    throw new Error('QR_ENCRYPTION_KEY must be exactly 32 characters long');
  }
}

/**
 * Calculate checksum for data integrity
 * 
 * @param {string} data - Data to calculate checksum for
 * @returns {string} - SHA256 checksum (first 8 characters)
 */
function calculateChecksum(data) {
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 8);
}

/**
 * Generate encrypted QR code data
 * 
 * Encrypts patient ID and patient code using AES-256-CBC encryption.
 * Includes timestamp, version, and checksum for validation.
 * 
 * @param {number} patientId - Patient ID
 * @param {string} patientCode - Patient code (e.g., P-123456)
 * @returns {string} - Encrypted QR data in format: IV:EncryptedData (hex)
 * 
 * Requirements: 7.1, 7.2, 7.6
 */
function generateQRData(patientId, patientCode) {
  validateEncryptionKey();
  
  // Validate inputs
  if (!patientId || typeof patientId !== 'number' || patientId <= 0) {
    throw new Error('Patient ID must be a positive number');
  }
  
  if (!patientCode || typeof patientCode !== 'string' || patientCode.trim().length === 0) {
    throw new Error('Patient code must be a non-empty string');
  }
  
  // Trim patient code
  const trimmedPatientCode = patientCode.trim();
  
  // Create payload
  const timestamp = Date.now();
  const payload = {
    patientId,
    patientCode: trimmedPatientCode,
    timestamp,
    version: QR_VERSION
  };
  
  // Calculate checksum using trimmed patient code
  const dataString = `${patientId}|${trimmedPatientCode}|${timestamp}`;
  const checksum = calculateChecksum(dataString);
  payload.checksum = checksum;
  
  // Convert payload to JSON string
  const plaintext = JSON.stringify(payload);
  
  // Generate random IV (Initialization Vector)
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  
  // Encrypt data
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV:EncryptedData format
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt QR code data
 * 
 * Decrypts QR code data and validates checksum.
 * 
 * @param {string} qrData - Encrypted QR data in format: IV:EncryptedData (hex)
 * @returns {Object} - Decrypted data { patientId, patientCode, timestamp, version }
 * @throws {Error} - If decryption fails or checksum is invalid
 * 
 * Requirements: 7.2, 7.5, 7.6
 */
function decryptQRData(qrData) {
  validateEncryptionKey();
  
  // Validate input
  if (!qrData || typeof qrData !== 'string') {
    throw new Error('QR data must be a non-empty string');
  }
  
  // Split IV and encrypted data
  const parts = qrData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid QR data format');
  }
  
  const [ivHex, encryptedHex] = parts;
  
  try {
    // Convert hex strings to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    
    // Validate IV length (should be 16 bytes for AES)
    if (iv.length !== 16) {
      throw new Error('Invalid IV length');
    }
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    
    // Decrypt data
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse JSON
    const payload = JSON.parse(decrypted);
    
    // Validate payload structure
    if (!payload.patientId || !payload.patientCode || !payload.timestamp || !payload.checksum) {
      throw new Error('Invalid QR data structure');
    }
    
    // Verify checksum
    const dataString = `${payload.patientId}|${payload.patientCode}|${payload.timestamp}`;
    const expectedChecksum = calculateChecksum(dataString);
    
    if (payload.checksum !== expectedChecksum) {
      throw new Error('QR data checksum validation failed');
    }
    
    // Return decrypted data
    return {
      patientId: payload.patientId,
      patientCode: payload.patientCode,
      timestamp: payload.timestamp,
      version: payload.version || QR_VERSION
    };
    
  } catch (error) {
    // Re-throw with more context
    if (error.message.includes('checksum')) {
      throw error;
    }
    throw new Error(`Failed to decrypt QR data: ${error.message}`);
  }
}

/**
 * Generate QR code image as data URL
 * 
 * Generates a QR code image from encrypted data and returns it as a data URL.
 * 
 * @param {string} qrData - Encrypted QR data
 * @param {Object} options - QR code generation options
 * @param {number} options.width - QR code width in pixels (default: 300)
 * @param {string} options.errorCorrectionLevel - Error correction level: L, M, Q, H (default: M)
 * @param {string} options.color.dark - Dark color (default: #000000)
 * @param {string} options.color.light - Light color (default: #FFFFFF)
 * @returns {Promise<string>} - Data URL of QR code image
 * 
 * Requirements: 7.3
 */
async function generateQRImage(qrData, options = {}) {
  // Validate input
  if (!qrData || typeof qrData !== 'string') {
    throw new Error('QR data must be a non-empty string');
  }
  
  // Default options
  const qrOptions = {
    width: options.width || 300,
    errorCorrectionLevel: options.errorCorrectionLevel || 'M',
    color: {
      dark: options.color?.dark || '#000000',
      light: options.color?.light || '#FFFFFF'
    }
  };
  
  try {
    // Generate QR code as data URL
    const dataUrl = await QRCode.toDataURL(qrData, qrOptions);
    return dataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code image: ${error.message}`);
  }
}

/**
 * Generate QR code as buffer
 * 
 * Generates a QR code image from encrypted data and returns it as a buffer.
 * Useful for saving to file or sending as response.
 * 
 * @param {string} qrData - Encrypted QR data
 * @param {Object} options - QR code generation options
 * @param {number} options.width - QR code width in pixels (default: 300)
 * @param {string} options.errorCorrectionLevel - Error correction level: L, M, Q, H (default: M)
 * @param {string} options.color.dark - Dark color (default: #000000)
 * @param {string} options.color.light - Light color (default: #FFFFFF)
 * @returns {Promise<Buffer>} - Buffer containing PNG image data
 * 
 * Requirements: 7.3
 */
async function generateQRBuffer(qrData, options = {}) {
  // Validate input
  if (!qrData || typeof qrData !== 'string') {
    throw new Error('QR data must be a non-empty string');
  }
  
  // Default options
  const qrOptions = {
    width: options.width || 300,
    errorCorrectionLevel: options.errorCorrectionLevel || 'M',
    color: {
      dark: options.color?.dark || '#000000',
      light: options.color?.light || '#FFFFFF'
    }
  };
  
  try {
    // Generate QR code as buffer
    const buffer = await QRCode.toBuffer(qrData, qrOptions);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to generate QR code buffer: ${error.message}`);
  }
}

module.exports = {
  generateQRData,
  decryptQRData,
  generateQRImage,
  generateQRBuffer,
  calculateChecksum
};
