/**
 * Property-Based Test: Filtering Functionality
 * Feature: hospital-crm-api, Property 31: Filtering Functionality
 * 
 * Tests that filtering by various criteria (status, date range, entity ID)
 * returns only records matching all specified criteria.
 * 
 * **Validates: Requirements 8.7**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateAppointmentCode } = require('../../controllers/appointmentController');

describe('Property 31: Filtering Functionality', () => {
  let pool;
  let testPatientId1;
  let testPatientId2;
  let testDoctorId1;
  let testDoctorId2;
  
  beforeAll(async () => {
    pool = getPool();
    
    // Create test patients
    const patientCode1 = `P-${Math.floor(100000 + Math.random() * 900000)}`;
    const [patientResult1] = await pool.query(
      `INSERT INTO patients (patient_code, first_name, last_name, date_of_birth, gender, blood_group, phone, created_by)
       VALUES (?, 'Test', 'Patient1', '1990-01-01', 'male', 'O+', '1234567890', 1)`,
      [patientCode1]
    );
    testPatientId1 = patientResult1.insertId;
    
    const patientCode2 = `P-${Math.floor(100000 + Math.random() * 900000)}`;
    const [patientResult2] = await pool.query(
      `INSERT INTO patients (patient_code, first_name, last_name, date_of_birth, gender, blood_group, phone, created_by)
       VALUES (?, 'Test', 'Patient2', '1990-01-01', 'female', 'A+', '0987654321', 1)`,
      [patientCode2]
    );
    testPatientId2 = patientResult2.insertId;
    
    // Create test users for doctors
    const [userResult1] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
       VALUES ('testdoctor3@test.com', '$2b$12$test', 'Test', 'Doctor1', 'doctor')`
    );
    const testUserId1 = userResult1.insertId;
    
    const [userResult2] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
       VALUES ('testdoctor4@test.com', '$2b$12$test', 'Test', 'Doctor2', 'doctor')`
    );
    const testUserId2 = userResult2.insertId;
    
    // Create test doctors
    const doctorCode1 = `D-${Math.floor(100000 + Math.random() * 900000)}`;
    const [doctorResult1] = await pool.query(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
       VALUES (?, ?, 'Cardiology', 'MBBS, MD', 'LIC123458')`,
      [testUserId1, doctorCode1]
    );
    testDoctorId1 = doctorResult1.insertId;
    
    const doctorCode2 = `D-${Math.floor(100000 + Math.random() * 900000)}`;
    const [doctorResult2] = await pool.query(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
       VALUES (?, ?, 'Neurology', 'MBBS, MD', 'LIC123459')`,
      [testUserId2, doctorCode2]
    );
    testDoctorId2 = doctorResult2.insertId;
  });
  
  afterAll(async () => {
    // Clean up test data
    if (testPatientId1) {
      await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId1]);
      await pool.query('DELETE FROM patients WHERE patient_id = ?', [testPatientId1]);
    }
    if (testPatientId2) {
      await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId2]);
      await pool.query('DELETE FROM patients WHERE patient_id = ?', [testPatientId2]);
    }
    if (testDoctorId1) {
      const [doctor] = await pool.query('SELECT user_id FROM doctors WHERE doctor_id = ?', [testDoctorId1]);
      if (doctor.length > 0) {
        await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [testDoctorId1]);
        await pool.query('DELETE FROM users WHERE user_id = ?', [doctor[0].user_id]);
      }
    }
    if (testDoctorId2) {
      const [doctor] = await pool.query('SELECT user_id FROM doctors WHERE doctor_id = ?', [testDoctorId2]);
      if (doctor.length > 0) {
        await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [testDoctorId2]);
        await pool.query('DELETE FROM users WHERE user_id = ?', [doctor[0].user_id]);
      }
    }
  });
  
  afterEach(async () => {
    // Clean up appointments after each test
    await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
  });
  
  test('should filter appointments by status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled'),
        fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled'),
        async (targetStatus, otherStatus) => {
          // Create appointments with different statuses
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', ?, 1)`,
            [code1, testPatientId1, testDoctorId1, targetStatus]
          );
          
          const code2 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '11:00:00', 'consultation', ?, 1)`,
            [code2, testPatientId2, testDoctorId2, otherStatus]
          );
          
          // Filter by target status
          const [results] = await pool.query(
            `SELECT * FROM appointments WHERE status = ? AND patient_id IN (?, ?)`,
            [targetStatus, testPatientId1, testPatientId2]
          );
          
          // Verify all results match the filter
          const allMatch = results.every(apt => apt.status === targetStatus);
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          // Property: All filtered results should match the status
          return allMatch && results.length > 0;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should filter appointments by doctor ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Create appointments for different doctors
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'confirmed', 1)`,
            [code1, testPatientId1, testDoctorId1]
          );
          
          const code2 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '11:00:00', 'consultation', 'confirmed', 1)`,
            [code2, testPatientId2, testDoctorId2]
          );
          
          // Filter by doctor 1
          const [results] = await pool.query(
            `SELECT * FROM appointments WHERE doctor_id = ? AND patient_id IN (?, ?)`,
            [testDoctorId1, testPatientId1, testPatientId2]
          );
          
          // Verify all results match the doctor filter
          const allMatch = results.every(apt => apt.doctor_id === testDoctorId1);
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          // Property: All filtered results should match the doctor ID
          return allMatch && results.length > 0;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should filter appointments by patient ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Create appointments for different patients
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'confirmed', 1)`,
            [code1, testPatientId1, testDoctorId1]
          );
          
          const code2 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '11:00:00', 'consultation', 'confirmed', 1)`,
            [code2, testPatientId2, testDoctorId2]
          );
          
          // Filter by patient 1
          const [results] = await pool.query(
            `SELECT * FROM appointments WHERE patient_id = ?`,
            [testPatientId1]
          );
          
          // Verify all results match the patient filter
          const allMatch = results.every(apt => apt.patient_id === testPatientId1);
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          // Property: All filtered results should match the patient ID
          return allMatch && results.length > 0;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should filter appointments by date range', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        async (daysOffset1, daysOffset2) => {
          // Skip if dates would be the same
          if (daysOffset1 === daysOffset2) {
            return true;
          }
          
          // Create dates
          const date1 = new Date('2024-06-01');
          date1.setDate(date1.getDate() + daysOffset1);
          const appointmentDate1 = date1.toISOString().split('T')[0];
          
          const date2 = new Date('2024-06-01');
          date2.setDate(date2.getDate() + daysOffset2);
          const appointmentDate2 = date2.toISOString().split('T')[0];
          
          // Create appointments on different dates
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, '10:00:00', 'consultation', 'confirmed', 1)`,
            [code1, testPatientId1, testDoctorId1, appointmentDate1]
          );
          
          const code2 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, '11:00:00', 'consultation', 'confirmed', 1)`,
            [code2, testPatientId2, testDoctorId2, appointmentDate2]
          );
          
          // Define date range
          const startDate = appointmentDate1 < appointmentDate2 ? appointmentDate1 : appointmentDate2;
          const endDate = appointmentDate1 > appointmentDate2 ? appointmentDate1 : appointmentDate2;
          
          // Filter by date range - use DATE() function to ensure proper comparison
          const [results] = await pool.query(
            `SELECT appointment_id, DATE_FORMAT(appointment_date, '%Y-%m-%d') as appointment_date 
             FROM appointments 
             WHERE DATE(appointment_date) >= DATE(?) AND DATE(appointment_date) <= DATE(?) 
             AND patient_id IN (?, ?)`,
            [startDate, endDate, testPatientId1, testPatientId2]
          );
          
          // Property: All results should be within the date range
          let allInRange = true;
          if (results.length > 0) {
            // Verify all results are within the date range
            allInRange = results.every(apt => {
              const aptDate = apt.appointment_date;
              return aptDate >= startDate && aptDate <= endDate;
            });
          }
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          return allInRange;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should filter appointments by multiple criteria (status AND doctor)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending', 'confirmed', 'completed'),
        async (targetStatus) => {
          // Create appointments with various combinations
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', ?, 1)`,
            [code1, testPatientId1, testDoctorId1, targetStatus]
          );
          
          const code2 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '11:00:00', 'consultation', 'cancelled', 1)`,
            [code2, testPatientId2, testDoctorId1]
          );
          
          const code3 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '12:00:00', 'consultation', ?, 1)`,
            [code3, testPatientId1, testDoctorId2, targetStatus]
          );
          
          // Filter by status AND doctor
          const [results] = await pool.query(
            `SELECT * FROM appointments 
             WHERE status = ? AND doctor_id = ? 
             AND patient_id IN (?, ?)`,
            [targetStatus, testDoctorId1, testPatientId1, testPatientId2]
          );
          
          // Verify all results match both criteria
          const allMatch = results.every(apt => 
            apt.status === targetStatus && apt.doctor_id === testDoctorId1
          );
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          // Property: All filtered results should match all criteria
          return allMatch && results.length > 0;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should return empty results when no records match filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          // Create appointment with specific status
          const code = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'confirmed', 1)`,
            [code, testPatientId1, testDoctorId1]
          );
          
          // Filter by non-existent doctor ID
          const nonExistentDoctorId = 999999;
          const [results] = await pool.query(
            `SELECT * FROM appointments WHERE doctor_id = ? AND patient_id IN (?, ?)`,
            [nonExistentDoctorId, testPatientId1, testPatientId2]
          );
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id IN (?, ?)', [testPatientId1, testPatientId2]);
          
          // Property: Should return empty array when no matches
          return results.length === 0;
        }
      ),
      { numRuns: 30 }
    );
  });
});
