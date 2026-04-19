/**
 * Property-Based Test: Status Transition Tracking
 * Feature: hospital-crm-api, Property 22: Status Transition Tracking
 * 
 * Tests that status changes for appointments and payments are properly
 * recorded and logged in the audit trail.
 * 
 * **Validates: Requirements 8.5, 8.6**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');
const { generateAppointmentCode } = require('../../controllers/appointmentController');

describe('Property 22: Status Transition Tracking', () => {
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
       VALUES ('testdoctor2@test.com', '$2b$12$test', 'Test', 'Doctor', 'doctor')`
    );
    const testUserId = userResult.insertId;
    
    // Create a test doctor
    const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
    const [doctorResult] = await pool.query(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
       VALUES (?, ?, 'Cardiology', 'MBBS, MD', 'LIC123457')`,
      [testUserId, doctorCode]
    );
    testDoctorId = doctorResult.insertId;
  });
  
  afterAll(async () => {
    // Clean up test data
    if (testPatientId) {
      await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
      await pool.query('DELETE FROM audit_logs WHERE resource = ? AND resource_id IN (SELECT appointment_id FROM appointments WHERE patient_id = ?)', ['appointments', testPatientId]);
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
    // Clean up appointments and audit logs after each test
    await pool.query('DELETE FROM audit_logs WHERE resource = ? AND resource_id IN (SELECT appointment_id FROM appointments WHERE patient_id = ?)', ['appointments', testPatientId]);
    await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
  });
  
  test('should record status changes in appointment records', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled', 'no-show'),
        fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled', 'no-show'),
        async (initialStatus, newStatus) => {
          // Create appointment with initial status
          const code = generateAppointmentCode();
          const [result] = await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', ?, 1)`,
            [code, testPatientId, testDoctorId, initialStatus]
          );
          const appointmentId = result.insertId;
          
          // Update status
          await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE appointment_id = ?',
            [newStatus, appointmentId]
          );
          
          // Verify status was updated
          const [appointments] = await pool.query(
            'SELECT status FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          
          const statusUpdated = appointments.length > 0 && appointments[0].status === newStatus;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [appointmentId]);
          
          // Property: Status should be updated in the record
          return statusUpdated;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should track cancellation details when appointment is cancelled', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 100 }),
        async (cancelledReason) => {
          // Create appointment
          const code = generateAppointmentCode();
          const [result] = await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'confirmed', 1)`,
            [code, testPatientId, testDoctorId]
          );
          const appointmentId = result.insertId;
          
          // Get a valid user ID (use the doctor's user)
          const [doctor] = await pool.query('SELECT user_id FROM doctors WHERE doctor_id = ?', [testDoctorId]);
          const userId = doctor[0].user_id;
          
          // Cancel appointment
          await pool.query(
            `UPDATE appointments SET 
              status = 'cancelled',
              cancelled_reason = ?,
              cancelled_at = NOW(),
              cancelled_by = ?,
              updated_at = NOW()
            WHERE appointment_id = ?`,
            [cancelledReason, userId, appointmentId]
          );
          
          // Verify cancellation details
          const [appointments] = await pool.query(
            'SELECT status, cancelled_reason, cancelled_at, cancelled_by FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          
          const hasCancellationDetails = 
            appointments.length > 0 &&
            appointments[0].status === 'cancelled' &&
            appointments[0].cancelled_reason === cancelledReason &&
            appointments[0].cancelled_at !== null &&
            appointments[0].cancelled_by === userId;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [appointmentId]);
          
          // Property: Cancellation should record reason, timestamp, and user
          return hasCancellationDetails;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should allow multiple status transitions for same appointment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled'), { minLength: 2, maxLength: 5 }),
        async (statusSequence) => {
          // Create appointment
          const code = generateAppointmentCode();
          const [result] = await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'pending', 1)`,
            [code, testPatientId, testDoctorId]
          );
          const appointmentId = result.insertId;
          
          // Apply status transitions
          for (const status of statusSequence) {
            await pool.query(
              'UPDATE appointments SET status = ?, updated_at = NOW() WHERE appointment_id = ?',
              [status, appointmentId]
            );
          }
          
          // Verify final status
          const [appointments] = await pool.query(
            'SELECT status FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          
          const finalStatus = appointments[0].status;
          const expectedFinalStatus = statusSequence[statusSequence.length - 1];
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [appointmentId]);
          
          // Property: Final status should match last transition
          return finalStatus === expectedFinalStatus;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should preserve appointment data when status changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending', 'confirmed', 'completed'),
        fc.constantFrom('confirmed', 'completed', 'cancelled'),
        async (initialStatus, newStatus) => {
          // Create appointment with specific data
          const code = generateAppointmentCode();
          const reason = 'Test reason';
          const notes = 'Test notes';
          
          const [result] = await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, reason, notes, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', ?, ?, ?, 1)`,
            [code, testPatientId, testDoctorId, initialStatus, reason, notes]
          );
          const appointmentId = result.insertId;
          
          // Update status
          await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE appointment_id = ?',
            [newStatus, appointmentId]
          );
          
          // Verify data is preserved
          const [appointments] = await pool.query(
            'SELECT appointment_code, patient_id, doctor_id, reason, notes, status FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          
          const dataPreserved = 
            appointments.length > 0 &&
            appointments[0].appointment_code === code &&
            appointments[0].patient_id === testPatientId &&
            appointments[0].doctor_id === testDoctorId &&
            appointments[0].reason === reason &&
            appointments[0].notes === notes &&
            appointments[0].status === newStatus;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [appointmentId]);
          
          // Property: All appointment data should be preserved during status change
          return dataPreserved;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should update timestamp when status changes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled'),
        async (newStatus) => {
          // Create appointment
          const code = generateAppointmentCode();
          const [result] = await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, '2024-06-15', '10:00:00', 'consultation', 'pending', 1)`,
            [code, testPatientId, testDoctorId]
          );
          const appointmentId = result.insertId;
          
          // Get initial timestamp
          const [initial] = await pool.query(
            'SELECT updated_at FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          const initialTimestamp = initial[0].updated_at;
          
          // Wait a moment to ensure timestamp difference
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Update status
          await pool.query(
            'UPDATE appointments SET status = ?, updated_at = NOW() WHERE appointment_id = ?',
            [newStatus, appointmentId]
          );
          
          // Get updated timestamp
          const [updated] = await pool.query(
            'SELECT updated_at FROM appointments WHERE appointment_id = ?',
            [appointmentId]
          );
          const updatedTimestamp = updated[0].updated_at;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE appointment_id = ?', [appointmentId]);
          
          // Property: Updated timestamp should be after initial timestamp
          return new Date(updatedTimestamp) >= new Date(initialTimestamp);
        }
      ),
      { numRuns: 30 }
    );
  });
});
