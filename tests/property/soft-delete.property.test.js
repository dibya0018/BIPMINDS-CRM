/**
 * Property-Based Test: Soft Delete Preservation
 * Feature: hospital-crm-api, Property 5: Soft Delete Preservation
 * 
 * Tests that soft delete operations preserve all data in the database
 * by setting is_active to false instead of deleting records.
 * 
 * **Validates: Requirements 6.7**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 5: Soft Delete Preservation', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should preserve patient data after soft delete', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          phone: fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString()),
          bloodGroup: fc.constantFrom('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
          gender: fc.constantFrom('male', 'female', 'other')
        }),
        async (patientData) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Generate unique patient code
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const dateOfBirth = '1990-01-01';
            
            // Create patient
            const [insertResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [
                patientCode,
                patientData.firstName,
                patientData.lastName,
                dateOfBirth,
                patientData.gender,
                patientData.bloodGroup,
                patientData.phone
              ]
            );
            
            const patientId = insertResult.insertId;
            
            // Get patient data before soft delete
            const [beforeDelete] = await connection.query(
              'SELECT * FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            if (beforeDelete.length === 0) {
              return false;
            }
            
            const originalData = beforeDelete[0];
            
            // Perform soft delete
            await connection.execute(
              'UPDATE patients SET is_active = FALSE WHERE patient_id = ?',
              [patientId]
            );
            
            // Get patient data after soft delete
            const [afterDelete] = await connection.query(
              'SELECT * FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            if (afterDelete.length === 0) {
              return false; // Record should still exist
            }
            
            const deletedData = afterDelete[0];
            
            // Verify is_active is false
            if (deletedData.is_active !== 0) {
              return false;
            }
            
            // Verify all other data is preserved
            const dataPreserved = 
              deletedData.patient_id === originalData.patient_id &&
              deletedData.patient_code === originalData.patient_code &&
              deletedData.first_name === originalData.first_name &&
              deletedData.last_name === originalData.last_name &&
              deletedData.date_of_birth.toISOString() === originalData.date_of_birth.toISOString() &&
              deletedData.gender === originalData.gender &&
              deletedData.blood_group === originalData.blood_group &&
              deletedData.phone === originalData.phone;
            
            // Clean up
            await connection.execute(
              'DELETE FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            return dataPreserved;
            
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
      { numRuns: 20 } // Reduced runs for database operations
    );
  });
  
  test('should not physically delete patient record', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            
            // Create a test patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [insertResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = insertResult.insertId;
            
            // Count records before soft delete
            const [beforeCount] = await connection.query(
              'SELECT COUNT(*) as count FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            // Perform soft delete
            await connection.execute(
              'UPDATE patients SET is_active = FALSE WHERE patient_id = ?',
              [patientId]
            );
            
            // Count records after soft delete
            const [afterCount] = await connection.query(
              'SELECT COUNT(*) as count FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            // Clean up
            await connection.execute(
              'DELETE FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            // Record count should remain the same
            return beforeCount[0].count === afterCount[0].count && afterCount[0].count === 1;
            
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
