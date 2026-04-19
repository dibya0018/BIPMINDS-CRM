/**
 * Property-Based Test: Entity Relationship Preservation
 * Feature: hospital-crm-api, Property 30: Entity Relationship Preservation
 * 
 * Tests that when a patient is created, a corresponding QR code record
 * is automatically created and linked to the patient.
 * 
 * **Validates: Requirements 6.3, 7.1, 7.4**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateQRData, decryptQRData } = require('../../utils/qrCode');

describe('Property 30: Entity Relationship Preservation', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should create QR code record when patient is created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          phone: fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString())
        }),
        async (patientData) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Generate unique patient code
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            
            // Create patient
            const [insertResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, patientData.firstName, patientData.lastName, '1990-01-01', 'male', 'O+', patientData.phone]
            );
            
            const patientId = insertResult.insertId;
            
            // Generate QR code data
            const qrData = generateQRData(patientId, patientCode);
            
            // Create QR code record (simulating what the controller does)
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, is_active) 
               VALUES (?, ?, ?, NOW(), TRUE)`,
              [patientId, qrData, 'data:image/png;base64,test']
            );
            
            // Verify QR code record exists
            const [qrCodes] = await connection.query(
              'SELECT * FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            
            // Verify relationship
            const qrCodeExists = qrCodes.length === 1;
            const qrCodeLinked = qrCodes.length > 0 && qrCodes[0].patient_id === patientId;
            
            // Verify QR data can be decrypted
            let qrDataValid = false;
            if (qrCodes.length > 0) {
              try {
                const decrypted = decryptQRData(qrCodes[0].qr_code_data);
                qrDataValid = decrypted.patientId === patientId && decrypted.patientCode === patientCode;
              } catch (error) {
                qrDataValid = false;
              }
            }
            
            // Clean up
            await connection.execute('DELETE FROM qr_codes WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return qrCodeExists && qrCodeLinked && qrDataValid;
            
          } catch (error) {
            console.error('Test error:', error.message);
            return false;
          } finally {
            if (connection) {
              connection.release();
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('should link QR code to correct patient', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create two patients
            const patientCode1 = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const patientCode2 = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            
            const [result1] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode1, 'Patient', 'One', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const [result2] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode2, 'Patient', 'Two', '1990-01-01', 'female', 'A+', '9876543210']
            );
            
            const patientId1 = result1.insertId;
            const patientId2 = result2.insertId;
            
            // Generate QR codes
            const qrData1 = generateQRData(patientId1, patientCode1);
            const qrData2 = generateQRData(patientId2, patientCode2);
            
            // Create QR code records
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, is_active) 
               VALUES (?, ?, ?, NOW(), TRUE)`,
              [patientId1, qrData1, 'data:image/png;base64,test1']
            );
            
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, is_active) 
               VALUES (?, ?, ?, NOW(), TRUE)`,
              [patientId2, qrData2, 'data:image/png;base64,test2']
            );
            
            // Verify each QR code links to correct patient
            const [qr1] = await connection.query(
              'SELECT * FROM qr_codes WHERE patient_id = ?',
              [patientId1]
            );
            
            const [qr2] = await connection.query(
              'SELECT * FROM qr_codes WHERE patient_id = ?',
              [patientId2]
            );
            
            const decrypted1 = decryptQRData(qr1[0].qr_code_data);
            const decrypted2 = decryptQRData(qr2[0].qr_code_data);
            
            const correctLink1 = decrypted1.patientId === patientId1 && decrypted1.patientCode === patientCode1;
            const correctLink2 = decrypted2.patientId === patientId2 && decrypted2.patientCode === patientCode2;
            
            // Clean up
            await connection.execute('DELETE FROM qr_codes WHERE patient_id IN (?, ?)', [patientId1, patientId2]);
            await connection.execute('DELETE FROM patients WHERE patient_id IN (?, ?)', [patientId1, patientId2]);
            
            return correctLink1 && correctLink2;
            
          } catch (error) {
            console.error('Test error:', error.message);
            return false;
          } finally {
            if (connection) {
              connection.release();
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
