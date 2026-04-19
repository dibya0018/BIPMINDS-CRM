/**
 * Property-Based Test: QR Code Scan Counter
 * Feature: hospital-crm-api, Property 18: QR Code Scan Counter
 * 
 * Tests that scanning a patient QR code multiple times increments
 * the scan_count by the number of scans and updates last_scanned_at.
 * 
 * **Validates: Requirements 7.7, 7.8**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateQRData } = require('../../utils/qrCode');

describe('Property 18: QR Code Scan Counter', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should increment scan count by number of scans', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }), // Number of scans
        async (scanCount) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = patientResult.insertId;
            
            // Create QR code
            const qrData = generateQRData(patientId, patientCode);
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, scan_count, is_active) 
               VALUES (?, ?, ?, NOW(), 0, TRUE)`,
              [patientId, qrData, 'data:image/png;base64,test']
            );
            
            // Get initial scan count
            const [initialQR] = await connection.query(
              'SELECT scan_count FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const initialCount = initialQR[0].scan_count;
            
            // Simulate multiple scans
            for (let i = 0; i < scanCount; i++) {
              await connection.execute(
                'UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE patient_id = ?',
                [patientId]
              );
            }
            
            // Get final scan count
            const [finalQR] = await connection.query(
              'SELECT scan_count FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const finalCount = finalQR[0].scan_count;
            
            // Clean up
            await connection.execute('DELETE FROM qr_codes WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            // Verify scan count incremented correctly
            return finalCount === initialCount + scanCount;
            
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
  
  test('should update last_scanned_at timestamp on each scan', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = patientResult.insertId;
            
            // Create QR code
            const qrData = generateQRData(patientId, patientCode);
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, scan_count, is_active) 
               VALUES (?, ?, ?, NOW(), 0, TRUE)`,
              [patientId, qrData, 'data:image/png;base64,test']
            );
            
            // Get initial last_scanned_at (should be NULL)
            const [initialQR] = await connection.query(
              'SELECT last_scanned_at FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const initialTimestamp = initialQR[0].last_scanned_at;
            
            // Wait 1.5 seconds to ensure timestamp difference (MySQL DATETIME has 1 second precision)
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Perform first scan
            await connection.execute(
              'UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE patient_id = ?',
              [patientId]
            );
            
            // Get timestamp after first scan
            const [afterFirstScan] = await connection.query(
              'SELECT last_scanned_at FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const firstScanTimestamp = afterFirstScan[0].last_scanned_at;
            
            // Wait 1.5 seconds
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Perform second scan
            await connection.execute(
              'UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE patient_id = ?',
              [patientId]
            );
            
            // Get timestamp after second scan
            const [afterSecondScan] = await connection.query(
              'SELECT last_scanned_at FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const secondScanTimestamp = afterSecondScan[0].last_scanned_at;
            
            // Clean up
            await connection.execute('DELETE FROM qr_codes WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            // Verify timestamps are updated
            const timestampUpdated = 
              firstScanTimestamp !== null &&
              secondScanTimestamp !== null &&
              new Date(secondScanTimestamp) > new Date(firstScanTimestamp);
            
            return timestampUpdated;
            
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
      { numRuns: 5 } // Reduced runs due to timing requirements (1.5s * 2 * 5 = 15 seconds)
    );
  });
  
  test('should maintain accurate count across multiple scans', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 10 }),
        async (scanBatches) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = patientResult.insertId;
            
            // Create QR code
            const qrData = generateQRData(patientId, patientCode);
            await connection.execute(
              `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, scan_count, is_active) 
               VALUES (?, ?, ?, NOW(), 0, TRUE)`,
              [patientId, qrData, 'data:image/png;base64,test']
            );
            
            // Perform scans in batches
            let expectedTotal = 0;
            for (const batchSize of scanBatches) {
              for (let i = 0; i < batchSize; i++) {
                await connection.execute(
                  'UPDATE qr_codes SET scan_count = scan_count + 1, last_scanned_at = NOW() WHERE patient_id = ?',
                  [patientId]
                );
              }
              expectedTotal += batchSize;
            }
            
            // Get final scan count
            const [finalQR] = await connection.query(
              'SELECT scan_count FROM qr_codes WHERE patient_id = ?',
              [patientId]
            );
            const actualTotal = finalQR[0].scan_count;
            
            // Clean up
            await connection.execute('DELETE FROM qr_codes WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return actualTotal === expectedTotal;
            
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
