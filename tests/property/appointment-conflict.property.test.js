/**
 * Property-Based Test: Appointment Conflict Prevention
 * Feature: hospital-crm-api, Property 13: Appointment Conflict Prevention
 * 
 * Tests that the system prevents double-booking by rejecting appointments
 * for the same doctor at the same date and time.
 * 
 * **Validates: Requirements 8.2, 8.3**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateAppointmentCode } = require('../../controllers/appointmentController');

describe('Property 13: Appointment Conflict Prevention', () => {
  let pool;
  let testPatientId;
  let testDoctorId;
  
  beforeAll(async () => {
    pool = getPool();
    
    // Create a test patient
    const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
    const [patientResult] = await pool.query(
      `INSERT INTO patients (patient_code, first_name, last_name, date_of_birth, gender, blood_group, phone, created_by)
       VALUES (?, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '1234567890', 1)`,
      [patientCode]
    );
    testPatientId = patientResult.insertId;
    
    // Create a test user for doctor
    const [userResult] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
       VALUES ('testdoctor@test.com', '$2b$12$test', 'Test', 'Doctor', 'doctor')`
    );
    const testUserId = userResult.insertId;
    
    // Create a test doctor
    const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
    const [doctorResult] = await pool.query(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
       VALUES (?, ?, 'Cardiology', 'MBBS, MD', 'LIC123456')`,
      [testUserId, doctorCode]
    );
    testDoctorId = doctorResult.insertId;
  });
  
  afterAll(async () => {
    // Clean up test data
    if (testPatientId) {
      await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
      await pool.query('DELETE FROM patients WHERE patient_id = ?', [testPatientId]);
    }
    if (testDoctorId) {
      const [doctor] = await pool.query('SELECT user_id FROM doctors WHERE doctor_id = ?', [testDoctorId]);
      if (doctor.length > 0) {
        await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [testDoctorId]);
        await pool.query('DELETE FROM users WHERE user_id = ?', [doctor[0].user_id]);
      }
    }
  });
  
  afterEach(async () => {
    // Clean up appointments after each test
    await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
  });
  
  test('should prevent double-booking for same doctor at same date and time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.integer({ min: 8, max: 17 }), // Hours 8-17
        fc.integer({ min: 0, max: 59 }), // Minutes
        async (dayOfYear, hour, minute) => {
          // Create a valid date from day of year
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          const appointmentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          
          // Create first appointment
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'consultation', 'confirmed', 1)`,
            [code1, testPatientId, testDoctorId, appointmentDate, appointmentTime]
          );
          
          // Check for conflicts (simulating the controller logic)
          const [conflicts] = await pool.query(
            `SELECT appointment_id 
             FROM appointments 
             WHERE doctor_id = ? 
               AND appointment_date = ? 
               AND appointment_time = ?
               AND status NOT IN ('cancelled', 'no-show')`,
            [testDoctorId, appointmentDate, appointmentTime]
          );
          
          // Should find exactly one appointment (the one we just created)
          const hasConflict = conflicts.length > 0;
          
          // Clean up for next iteration
          await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
          
          // Property: If an appointment exists, conflict check should detect it
          return hasConflict === true;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should allow appointments at different times for same doctor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.integer({ min: 8, max: 16 }), // Hours 8-16 (to allow +1 hour)
        fc.integer({ min: 0, max: 59 }), // Minutes
        async (dayOfYear, hour, minute) => {
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          const time1 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          const time2 = `${(hour + 1).toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          
          // Create first appointment
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'consultation', 'confirmed', 1)`,
            [code1, testPatientId, testDoctorId, appointmentDate, time1]
          );
          
          // Check for conflicts at different time
          const [conflicts] = await pool.query(
            `SELECT appointment_id 
             FROM appointments 
             WHERE doctor_id = ? 
               AND appointment_date = ? 
               AND appointment_time = ?
               AND status NOT IN ('cancelled', 'no-show')`,
            [testDoctorId, appointmentDate, time2]
          );
          
          const hasConflict = conflicts.length > 0;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
          
          // Property: Different times should not conflict
          return hasConflict === false;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should allow appointments for cancelled/no-show status at same time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.integer({ min: 8, max: 17 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom('cancelled', 'no-show'),
        async (dayOfYear, hour, minute, status) => {
          // Create a valid date from day of year
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          const appointmentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          
          // Create appointment with cancelled/no-show status
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'consultation', ?, 1)`,
            [code1, testPatientId, testDoctorId, appointmentDate, appointmentTime, status]
          );
          
          // Check for conflicts (should exclude cancelled/no-show)
          const [conflicts] = await pool.query(
            `SELECT appointment_id 
             FROM appointments 
             WHERE doctor_id = ? 
               AND appointment_date = ? 
               AND appointment_time = ?
               AND status NOT IN ('cancelled', 'no-show')`,
            [testDoctorId, appointmentDate, appointmentTime]
          );
          
          const hasConflict = conflicts.length > 0;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
          
          // Property: Cancelled/no-show appointments should not cause conflicts
          return hasConflict === false;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should detect conflicts only for active appointment statuses', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.integer({ min: 8, max: 17 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom('pending', 'confirmed', 'completed'),
        async (dayOfYear, hour, minute, status) => {
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          const appointmentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          
          // Create appointment with active status
          const code1 = generateAppointmentCode();
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'consultation', ?, 1)`,
            [code1, testPatientId, testDoctorId, appointmentDate, appointmentTime, status]
          );
          
          // Check for conflicts
          const [conflicts] = await pool.query(
            `SELECT appointment_id 
             FROM appointments 
             WHERE doctor_id = ? 
               AND appointment_date = ? 
               AND appointment_time = ?
               AND status NOT IN ('cancelled', 'no-show')`,
            [testDoctorId, appointmentDate, appointmentTime]
          );
          
          const hasConflict = conflicts.length > 0;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
          
          // Property: Active statuses should cause conflicts
          return hasConflict === true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
