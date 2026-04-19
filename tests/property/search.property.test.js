/**
 * Property-Based Test: Search Functionality
 * Feature: hospital-crm-api, Property 16: Search Functionality
 * 
 * Tests that searching patients by name, code, phone, or email
 * returns all matching records.
 * 
 * **Validates: Requirements 6.4**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 16: Search Functionality', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should find patient by first name', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 10 }).filter(s => /^[a-zA-Z]+$/.test(s)),
        async (searchName) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient with specific name
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [result] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, searchName, 'TestLast', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = result.insertId;
            
            // Search for patient by first name
            const searchPattern = `%${searchName}%`;
            const [patients] = await connection.query(
              `SELECT * FROM patients 
               WHERE is_active = TRUE 
               AND (first_name LIKE ? OR last_name LIKE ? OR patient_code LIKE ? OR phone LIKE ? OR email LIKE ?)`,
              [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
            );
            
            // Check if our patient is in results
            const found = patients.some(p => p.patient_id === patientId);
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return found;
            
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
  
  test('should find patient by patient code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [result] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = result.insertId;
            
            // Search for patient by code
            const searchPattern = `%${patientCode}%`;
            const [patients] = await connection.query(
              `SELECT * FROM patients 
               WHERE is_active = TRUE 
               AND (first_name LIKE ? OR last_name LIKE ? OR patient_code LIKE ? OR phone LIKE ? OR email LIKE ?)`,
              [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
            );
            
            // Check if our patient is in results
            const found = patients.some(p => p.patient_id === patientId && p.patient_code === patientCode);
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return found;
            
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
  
  test('should find patient by phone number', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString()),
        async (phone) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient with specific phone
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [result] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', phone]
            );
            
            const patientId = result.insertId;
            
            // Search for patient by phone
            const searchPattern = `%${phone}%`;
            const [patients] = await connection.query(
              `SELECT * FROM patients 
               WHERE is_active = TRUE 
               AND (first_name LIKE ? OR last_name LIKE ? OR patient_code LIKE ? OR phone LIKE ? OR email LIKE ?)`,
              [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
            );
            
            // Check if our patient is in results
            const found = patients.some(p => p.patient_id === patientId && p.phone === phone);
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return found;
            
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
  
  test('should find patient by email', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        async (email) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create test patient with specific email
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const [result] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, email, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', phone, email]
            );
            
            const patientId = result.insertId;
            
            // Search for patient by email
            const searchPattern = `%${email}%`;
            const [patients] = await connection.query(
              `SELECT * FROM patients 
               WHERE is_active = TRUE 
               AND (first_name LIKE ? OR last_name LIKE ? OR patient_code LIKE ? OR phone LIKE ? OR email LIKE ?)`,
              [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
            );
            
            // Check if our patient is in results
            const found = patients.some(p => p.patient_id === patientId && p.email === email);
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            
            return found;
            
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
  
  test('should return all matching records for partial search', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create multiple patients with similar names
            const commonPrefix = `Test${Math.floor(Math.random() * 10000)}`;
            const patientIds = [];
            
            for (let i = 0; i < 3; i++) {
              const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
              const phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
              const [result] = await connection.execute(
                `INSERT INTO patients (
                  patient_code, first_name, last_name, date_of_birth, 
                  gender, blood_group, phone, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                [patientCode, `${commonPrefix}Name${i}`, 'Patient', '1990-01-01', 'male', 'O+', phone]
              );
              patientIds.push(result.insertId);
            }
            
            // Search for patients with common prefix
            const searchPattern = `%${commonPrefix}%`;
            const [patients] = await connection.query(
              `SELECT * FROM patients 
               WHERE is_active = TRUE 
               AND (first_name LIKE ? OR last_name LIKE ? OR patient_code LIKE ? OR phone LIKE ? OR email LIKE ?)`,
              [searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
            );
            
            // Check if all our patients are in results
            const allFound = patientIds.every(id => 
              patients.some(p => p.patient_id === id)
            );
            
            // Clean up
            for (const id of patientIds) {
              await connection.execute('DELETE FROM patients WHERE patient_id = ?', [id]);
            }
            
            return allFound;
            
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
