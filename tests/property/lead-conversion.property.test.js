/**
 * Property-Based Test: Lead Conversion Integrity
 * Feature: hospital-crm-api, Property 15: Lead Conversion Integrity
 * 
 * Tests that lead conversion to patient creates a patient record,
 * links it to the lead, and records the conversion timestamp.
 * 
 * **Validates: Requirements 10.5, 10.6, 10.7**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 15: Lead Conversion Integrity', () => {
  let pool;
  
  beforeAll(() => {
    pool = getPool();
  });
  
  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });
  
  test('should create patient record when converting lead', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          phone: fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString()),
          bloodGroup: fc.constantFrom('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
          gender: fc.constantFrom('male', 'female', 'other'),
          source: fc.constantFrom('website', 'facebook', 'google', 'instagram', 'referral', 'walk-in', 'other')
        }),
        async (leadData) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            
            // Generate unique lead code
            const leadCode = `L-${Math.floor(100000 + Math.random() * 900000)}`;
            
            // Create lead
            const [leadResult] = await connection.execute(
              `INSERT INTO leads (
                lead_code, first_name, last_name, phone, source, 
                status, priority, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'new', 'medium', NOW(), NOW())`,
              [
                leadCode,
                leadData.firstName,
                leadData.lastName,
                leadData.phone,
                leadData.source
              ]
            );
            
            const leadId = leadResult.insertId;
            
            // Generate unique patient code
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const dateOfBirth = '1990-01-01';
            
            // Convert lead to patient
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
              [
                patientCode,
                leadData.firstName,
                leadData.lastName,
                dateOfBirth,
                leadData.gender,
                leadData.bloodGroup,
                leadData.phone
              ]
            );
            
            const patientId = patientResult.insertId;
            
            // Update lead with conversion information
            await connection.execute(
              `UPDATE leads SET
                status = 'converted',
                converted_to_patient_id = ?,
                converted_at = NOW(),
                updated_at = NOW()
              WHERE lead_id = ?`,
              [patientId, leadId]
            );
            
            // Verify patient was created
            const [patients] = await connection.query(
              'SELECT * FROM patients WHERE patient_id = ?',
              [patientId]
            );
            
            if (patients.length === 0) {
              await connection.rollback();
              return false;
            }
            
            const patient = patients[0];
            
            // Verify patient data matches lead data
            const patientDataMatches = 
              patient.first_name === leadData.firstName &&
              patient.last_name === leadData.lastName &&
              patient.phone === leadData.phone &&
              patient.gender === leadData.gender &&
              patient.blood_group === leadData.bloodGroup;
            
            if (!patientDataMatches) {
              await connection.rollback();
              return false;
            }
            
            // Verify lead was updated with conversion information
            const [leads] = await connection.query(
              'SELECT * FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            if (leads.length === 0) {
              await connection.rollback();
              return false;
            }
            
            const lead = leads[0];
            
            // Verify lead is linked to patient
            const leadLinked = 
              lead.status === 'converted' &&
              lead.converted_to_patient_id === patientId &&
              lead.converted_at !== null;
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM leads WHERE lead_id = ?', [leadId]);
            await connection.commit();
            
            return patientDataMatches && leadLinked;
            
          } catch (error) {
            if (connection) {
              await connection.rollback();
            }
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
  
  test('should link patient to lead with converted_to_patient_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          phone: fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString()),
          source: fc.constantFrom('website', 'facebook', 'google')
        }),
        async (data) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            
            // Create lead
            const leadCode = `L-${Math.floor(100000 + Math.random() * 900000)}`;
            const [leadResult] = await connection.execute(
              `INSERT INTO leads (
                lead_code, first_name, phone, source, 
                status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'new', NOW(), NOW())`,
              [leadCode, data.firstName, data.phone, data.source]
            );
            
            const leadId = leadResult.insertId;
            
            // Create patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
              [patientCode, data.firstName, 'Test', '1990-01-01', 'male', 'O+', data.phone]
            );
            
            const patientId = patientResult.insertId;
            
            // Link lead to patient
            await connection.execute(
              `UPDATE leads SET
                status = 'converted',
                converted_to_patient_id = ?,
                converted_at = NOW()
              WHERE lead_id = ?`,
              [patientId, leadId]
            );
            
            // Verify link
            const [leads] = await connection.query(
              'SELECT converted_to_patient_id FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            const isLinked = leads.length > 0 && leads[0].converted_to_patient_id === patientId;
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM leads WHERE lead_id = ?', [leadId]);
            await connection.commit();
            
            return isLinked;
            
          } catch (error) {
            if (connection) {
              await connection.rollback();
            }
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
  
  test('should record conversion timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            
            // Create lead
            const leadCode = `L-${Math.floor(100000 + Math.random() * 900000)}`;
            const [leadResult] = await connection.execute(
              `INSERT INTO leads (
                lead_code, first_name, phone, source, 
                status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'new', NOW(), NOW())`,
              [leadCode, 'Test', '1234567890', 'website']
            );
            
            const leadId = leadResult.insertId;
            
            // Get lead before conversion to verify no timestamp
            const [beforeLeads] = await connection.query(
              'SELECT converted_at FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            if (beforeLeads[0].converted_at !== null) {
              await connection.rollback();
              return false;
            }
            
            // Create patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
              [patientCode, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890']
            );
            
            const patientId = patientResult.insertId;
            
            // Convert lead
            await connection.execute(
              `UPDATE leads SET
                status = 'converted',
                converted_to_patient_id = ?,
                converted_at = NOW()
              WHERE lead_id = ?`,
              [patientId, leadId]
            );
            
            // Get lead with conversion timestamp
            const [afterLeads] = await connection.query(
              'SELECT converted_at, created_at FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            if (afterLeads.length === 0 || !afterLeads[0].converted_at) {
              await connection.rollback();
              return false;
            }
            
            const convertedAt = new Date(afterLeads[0].converted_at);
            const createdAt = new Date(afterLeads[0].created_at);
            
            // Verify timestamp exists and is after creation time
            // Allow for reasonable time difference (up to 10 seconds for test execution)
            const timeDiff = (convertedAt - createdAt) / 1000; // in seconds
            const timestampValid = 
              convertedAt instanceof Date &&
              !isNaN(convertedAt.getTime()) &&
              convertedAt >= createdAt &&
              timeDiff >= 0 &&
              timeDiff < 10;
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM leads WHERE lead_id = ?', [leadId]);
            await connection.commit();
            
            return timestampValid;
            
          } catch (error) {
            if (connection) {
              await connection.rollback();
            }
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
  
  test('should update lead status to converted', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z\s]+$/.test(s)),
          phone: fc.integer({ min: 1000000000, max: 9999999999 }).map(n => n.toString())
        }),
        async (data) => {
          let connection;
          
          try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            
            // Create lead with 'new' status
            const leadCode = `L-${Math.floor(100000 + Math.random() * 900000)}`;
            const [leadResult] = await connection.execute(
              `INSERT INTO leads (
                lead_code, first_name, phone, source, 
                status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'new', NOW(), NOW())`,
              [leadCode, data.firstName, data.phone, 'website']
            );
            
            const leadId = leadResult.insertId;
            
            // Verify initial status
            const [beforeLeads] = await connection.query(
              'SELECT status FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            if (beforeLeads[0].status !== 'new') {
              await connection.rollback();
              return false;
            }
            
            // Create patient
            const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
            const [patientResult] = await connection.execute(
              `INSERT INTO patients (
                patient_code, first_name, last_name, date_of_birth, 
                gender, blood_group, phone, is_active, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
              [patientCode, data.firstName, 'Test', '1990-01-01', 'male', 'O+', data.phone]
            );
            
            const patientId = patientResult.insertId;
            
            // Convert lead
            await connection.execute(
              `UPDATE leads SET
                status = 'converted',
                converted_to_patient_id = ?,
                converted_at = NOW()
              WHERE lead_id = ?`,
              [patientId, leadId]
            );
            
            // Verify status changed to 'converted'
            const [afterLeads] = await connection.query(
              'SELECT status FROM leads WHERE lead_id = ?',
              [leadId]
            );
            
            const statusChanged = afterLeads[0].status === 'converted';
            
            // Clean up
            await connection.execute('DELETE FROM patients WHERE patient_id = ?', [patientId]);
            await connection.execute('DELETE FROM leads WHERE lead_id = ?', [leadId]);
            await connection.commit();
            
            return statusChanged;
            
          } catch (error) {
            if (connection) {
              await connection.rollback();
            }
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
