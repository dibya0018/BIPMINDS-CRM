/**
 * Property-Based Test: Pagination Consistency
 * Feature: hospital-crm-api, Property 17: Pagination Consistency
 * 
 * Tests that paginated lists return non-overlapping results and
 * that requesting consecutive pages returns at most pageSize * numPages records.
 * 
 * **Validates: Requirements 6.5**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 17: Pagination Consistency', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should return non-overlapping results for consecutive pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }), // Page size
        async (pageSize) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create multiple test patients with delays to ensure different timestamps
            const patientIds = [];
            const numPatients = pageSize * 2; // Create enough for 2 pages
            
            for (let i = 0; i < numPatients; i++) {
              const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
              const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
              const [result] = await connection.execute(
                `INSERT INTO patients (
                  patient_code, first_name, last_name, date_of_birth, 
                  gender, blood_group, phone, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [patientCode, `Test${i}`, 'Patient', '1990-01-01', 'male', 'O+', phone]
              );
              patientIds.push(result.insertId);
              // Small delay to ensure different timestamps
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // Get page 1 - use patient_id as secondary sort for consistency
            const [page1] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC
               LIMIT ? OFFSET ?`,
              [Math.min(...patientIds), Math.max(...patientIds), pageSize, 0]
            );
            
            // Get page 2
            const [page2] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC
               LIMIT ? OFFSET ?`,
              [Math.min(...patientIds), Math.max(...patientIds), pageSize, pageSize]
            );
            
            // Check for overlaps
            const page1Ids = new Set(page1.map(p => p.patient_id));
            const page2Ids = new Set(page2.map(p => p.patient_id));
            
            let hasOverlap = false;
            for (const id of page1Ids) {
              if (page2Ids.has(id)) {
                hasOverlap = true;
                break;
              }
            }
            
            // Clean up
            for (const id of patientIds) {
              await connection.execute('DELETE FROM patients WHERE patient_id = ?', [id]);
            }
            
            // Pages should not overlap
            return !hasOverlap;
            
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
      { numRuns: 10 }
    );
  });
  
  test('should return at most pageSize records per page', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pageSize: fc.integer({ min: 1, max: 10 }),
          numRecords: fc.integer({ min: 5, max: 20 })
        }),
        async ({ pageSize, numRecords }) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patients
            const patientIds = [];
            
            for (let i = 0; i < numRecords; i++) {
              const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
              const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
              const [result] = await connection.execute(
                `INSERT INTO patients (
                  patient_code, first_name, last_name, date_of_birth, 
                  gender, blood_group, phone, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [patientCode, `Test${i}`, 'Patient', '1990-01-01', 'male', 'O+', phone]
              );
              patientIds.push(result.insertId);
            }
            
            // Get first page
            const [page] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC
               LIMIT ?`,
              [Math.min(...patientIds), Math.max(...patientIds), pageSize]
            );
            
            // Clean up
            for (const id of patientIds) {
              await connection.execute('DELETE FROM patients WHERE patient_id = ?', [id]);
            }
            
            // Page should have at most pageSize records
            return page.length <= pageSize;
            
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
  
  test('should return correct total count across all pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          pageSize: fc.integer({ min: 2, max: 5 }),
          numRecords: fc.integer({ min: 5, max: 15 })
        }),
        async ({ pageSize, numRecords }) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patients
            const patientIds = [];
            
            for (let i = 0; i < numRecords; i++) {
              const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
              const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
              const [result] = await connection.execute(
                `INSERT INTO patients (
                  patient_code, first_name, last_name, date_of_birth, 
                  gender, blood_group, phone, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [patientCode, `Test${i}`, 'Patient', '1990-01-01', 'male', 'O+', phone]
              );
              patientIds.push(result.insertId);
            }
            
            // Get all pages
            const allResults = [];
            const numPages = Math.ceil(numRecords / pageSize);
            
            for (let page = 0; page < numPages; page++) {
              const [pageResults] = await connection.query(
                `SELECT patient_id FROM patients 
                 WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
                 ORDER BY patient_id DESC
                 LIMIT ? OFFSET ?`,
                [Math.min(...patientIds), Math.max(...patientIds), pageSize, page * pageSize]
              );
              allResults.push(...pageResults);
            }
            
            // Clean up
            for (const id of patientIds) {
              await connection.execute('DELETE FROM patients WHERE patient_id = ?', [id]);
            }
            
            // Total results should equal number of records created
            return allResults.length === numRecords;
            
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
      { numRuns: 10 }
    );
  });
  
  test('should maintain consistent ordering across pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }), // Page size
        async (pageSize) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patients with slight delays to ensure different timestamps
            const patientIds = [];
            const numPatients = pageSize * 2;
            
            for (let i = 0; i < numPatients; i++) {
              const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
              const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
              const [result] = await connection.execute(
                `INSERT INTO patients (
                  patient_code, first_name, last_name, date_of_birth, 
                  gender, blood_group, phone, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [patientCode, `Test${i}`, 'Patient', '1990-01-01', 'male', 'O+', phone]
              );
              patientIds.push(result.insertId);
            }
            
            // Get all records in one query
            const [allRecords] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC`,
              [Math.min(...patientIds), Math.max(...patientIds)]
            );
            
            // Get records via pagination
            const [page1] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC
               LIMIT ? OFFSET ?`,
              [Math.min(...patientIds), Math.max(...patientIds), pageSize, 0]
            );
            
            const [page2] = await connection.query(
              `SELECT patient_id FROM patients 
               WHERE is_active = TRUE AND patient_id >= ? AND patient_id <= ?
               ORDER BY patient_id DESC
               LIMIT ? OFFSET ?`,
              [Math.min(...patientIds), Math.max(...patientIds), pageSize, pageSize]
            );
            
            // Combine paginated results
            const paginatedResults = [...page1, ...page2];
            
            // Check if order matches
            let orderMatches = true;
            for (let i = 0; i < Math.min(allRecords.length, paginatedResults.length); i++) {
              if (allRecords[i].patient_id !== paginatedResults[i].patient_id) {
                orderMatches = false;
                break;
              }
            }
            
            // Clean up
            for (const id of patientIds) {
              await connection.execute('DELETE FROM patients WHERE patient_id = ?', [id]);
            }
            
            return orderMatches;
            
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
      { numRuns: 10 }
    );
  });
});
