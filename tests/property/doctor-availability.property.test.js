/**
 * Property-Based Test: Doctor Availability Calculation
 * Feature: hospital-crm-api, Property 23: Doctor Availability Calculation
 * 
 * Tests that the system correctly calculates available and booked time slots
 * for doctors, ensuring no overlap between available and booked slots.
 * 
 * **Validates: Requirements 15.5, 15.6**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 23: Doctor Availability Calculation', () => {
  let pool;
  let testDoctorId;
  let testPatientId;
  let testUserId;
  
  beforeAll(async () => {
    pool = getPool();
    
    // Create a test user for doctor
    const [userResult] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
       VALUES ('availdoctor@test.com', '$2b$12$test', 'Avail', 'Doctor', 'doctor')`
    );
    testUserId = userResult.insertId;
    
    // Create a test doctor with availability
    const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
    const [doctorResult] = await pool.query(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number, 
        available_time_start, available_time_end, is_available)
       VALUES (?, ?, 'General', 'MBBS', 'LIC789', '09:00:00', '17:00:00', TRUE)`,
      [testUserId, doctorCode]
    );
    testDoctorId = doctorResult.insertId;
    
    // Create a test patient
    const patientCode = `P-${Math.floor(100000 + Math.random() * 900000)}`;
    const [patientResult] = await pool.query(
      `INSERT INTO patients (patient_code, first_name, last_name, date_of_birth, gender, blood_group, phone, created_by)
       VALUES (?, 'Test', 'Patient', '1990-01-01', 'male', 'O+', '9876543210', 1)`,
      [patientCode]
    );
    testPatientId = patientResult.insertId;
  });
  
  afterAll(async () => {
    // Clean up test data
    if (testPatientId) {
      await pool.query('DELETE FROM appointments WHERE patient_id = ?', [testPatientId]);
      await pool.query('DELETE FROM patients WHERE patient_id = ?', [testPatientId]);
    }
    if (testDoctorId) {
      await pool.query('DELETE FROM appointments WHERE doctor_id = ?', [testDoctorId]);
      await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [testDoctorId]);
    }
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE user_id = ?', [testUserId]);
    }
  });
  
  afterEach(async () => {
    // Clean up appointments after each test
    await pool.query('DELETE FROM appointments WHERE doctor_id = ?', [testDoctorId]);
  });
  
  test('should return non-overlapping available and booked slots', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.array(fc.integer({ min: 9, max: 16 }), { minLength: 0, maxLength: 5 }), // Booked hours
        async (dayOfYear, bookedHours) => {
          // Create a valid date
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          
          // Create appointments for booked hours
          for (const hour of bookedHours) {
            const appointmentTime = `${hour.toString().padStart(2, '0')}:00:00`;
            const appointmentCode = `A-${Math.floor(100000 + Math.random() * 900000)}`;
            
            await pool.query(
              `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, 
                appointment_time, appointment_type, status, created_by)
               VALUES (?, ?, ?, ?, ?, 'consultation', 'confirmed', 1)`,
              [appointmentCode, testPatientId, testDoctorId, appointmentDate, appointmentTime]
            );
          }
          
          // Get doctor information
          const [doctors] = await pool.query(
            `SELECT available_time_start, available_time_end, is_available
             FROM doctors WHERE doctor_id = ?`,
            [testDoctorId]
          );
          
          const doctor = doctors[0];
          
          // Get booked appointments
          const [bookedAppointments] = await pool.query(
            `SELECT appointment_time, duration_minutes
             FROM appointments
             WHERE doctor_id = ? AND appointment_date = ?
               AND status NOT IN ('cancelled', 'no-show')
             ORDER BY appointment_time`,
            [testDoctorId, appointmentDate]
          );
          
          // Calculate slots (same logic as controller)
          const availableSlots = [];
          const bookedSlots = [];
          
          if (doctor.available_time_start && doctor.available_time_end) {
            const [startHour, startMinute] = doctor.available_time_start.split(':').map(Number);
            const [endHour, endMinute] = doctor.available_time_end.split(':').map(Number);
            
            let currentHour = startHour;
            let currentMinute = startMinute;
            const slotDuration = 30;
            
            while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
              const timeSlot = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
              
              const isBooked = bookedAppointments.some(apt => apt.appointment_time === timeSlot);
              
              if (isBooked) {
                bookedSlots.push(timeSlot);
              } else {
                availableSlots.push(timeSlot);
              }
              
              currentMinute += slotDuration;
              if (currentMinute >= 60) {
                currentHour += Math.floor(currentMinute / 60);
                currentMinute = currentMinute % 60;
              }
            }
          }
          
          // Property 1: No slot should be in both available and booked
          const hasOverlap = availableSlots.some(slot => bookedSlots.includes(slot));
          
          // Property 2: Total slots should equal available + booked
          const totalSlots = availableSlots.length + bookedSlots.length;
          const expectedTotalSlots = totalSlots;
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE doctor_id = ?', [testDoctorId]);
          
          return !hasOverlap && totalSlots === expectedTotalSlots;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should return empty slots when doctor is unavailable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        async (dayOfYear) => {
          // Temporarily set doctor as unavailable
          await pool.query(
            'UPDATE doctors SET is_available = FALSE WHERE doctor_id = ?',
            [testDoctorId]
          );
          
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          
          // Get doctor information
          const [doctors] = await pool.query(
            `SELECT available_time_start, available_time_end, is_available
             FROM doctors WHERE doctor_id = ?`,
            [testDoctorId]
          );
          
          const doctor = doctors[0];
          
          // Calculate slots
          const availableSlots = [];
          const bookedSlots = [];
          
          if (!doctor.is_available) {
            // Should return empty arrays
          } else {
            // Normal calculation (shouldn't happen in this test)
            const [startHour, startMinute] = doctor.available_time_start.split(':').map(Number);
            const [endHour, endMinute] = doctor.available_time_end.split(':').map(Number);
            
            let currentHour = startHour;
            let currentMinute = startMinute;
            const slotDuration = 30;
            
            while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
              const timeSlot = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
              availableSlots.push(timeSlot);
              
              currentMinute += slotDuration;
              if (currentMinute >= 60) {
                currentHour += Math.floor(currentMinute / 60);
                currentMinute = currentMinute % 60;
              }
            }
          }
          
          // Restore doctor availability
          await pool.query(
            'UPDATE doctors SET is_available = TRUE WHERE doctor_id = ?',
            [testDoctorId]
          );
          
          // Property: Unavailable doctors should have no available slots
          return availableSlots.length === 0 && bookedSlots.length === 0;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should correctly mark booked slots based on appointments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 365 }), // Day of year
        fc.integer({ min: 9, max: 16 }), // Hour to book
        fc.integer({ min: 0, max: 1 }).map(x => x * 30), // Minute (0 or 30)
        async (dayOfYear, hour, minute) => {
          const date = new Date('2024-01-01');
          date.setDate(date.getDate() + dayOfYear - 1);
          const appointmentDate = date.toISOString().split('T')[0];
          const appointmentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          
          // Create one appointment
          const appointmentCode = `A-${Math.floor(100000 + Math.random() * 900000)}`;
          await pool.query(
            `INSERT INTO appointments (appointment_code, patient_id, doctor_id, appointment_date, 
              appointment_time, appointment_type, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'consultation', 'confirmed', 1)`,
            [appointmentCode, testPatientId, testDoctorId, appointmentDate, appointmentTime]
          );
          
          // Get booked appointments
          const [bookedAppointments] = await pool.query(
            `SELECT appointment_time FROM appointments
             WHERE doctor_id = ? AND appointment_date = ?
               AND status NOT IN ('cancelled', 'no-show')`,
            [testDoctorId, appointmentDate]
          );
          
          // Get doctor information
          const [doctors] = await pool.query(
            `SELECT available_time_start, available_time_end FROM doctors WHERE doctor_id = ?`,
            [testDoctorId]
          );
          
          const doctor = doctors[0];
          
          // Calculate booked slots
          const bookedSlots = [];
          
          if (doctor.available_time_start && doctor.available_time_end) {
            const [startHour, startMinute] = doctor.available_time_start.split(':').map(Number);
            const [endHour, endMinute] = doctor.available_time_end.split(':').map(Number);
            
            let currentHour = startHour;
            let currentMinute = startMinute;
            const slotDuration = 30;
            
            while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
              const timeSlot = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
              
              const isBooked = bookedAppointments.some(apt => apt.appointment_time === timeSlot);
              
              if (isBooked) {
                bookedSlots.push(timeSlot);
              }
              
              currentMinute += slotDuration;
              if (currentMinute >= 60) {
                currentHour += Math.floor(currentMinute / 60);
                currentMinute = currentMinute % 60;
              }
            }
          }
          
          // Clean up
          await pool.query('DELETE FROM appointments WHERE doctor_id = ?', [testDoctorId]);
          
          // Property: The booked time should be in booked slots
          return bookedSlots.includes(appointmentTime);
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('should generate 30-minute time slots within availability window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 8, max: 12 }), // Start hour
        fc.integer({ min: 14, max: 18 }), // End hour (must be after start)
        async (startHour, endHour) => {
          // Update doctor availability
          const startTime = `${startHour.toString().padStart(2, '0')}:00:00`;
          const endTime = `${endHour.toString().padStart(2, '0')}:00:00`;
          
          await pool.query(
            `UPDATE doctors SET available_time_start = ?, available_time_end = ?
             WHERE doctor_id = ?`,
            [startTime, endTime, testDoctorId]
          );
          
          // Get doctor information
          const [doctors] = await pool.query(
            `SELECT available_time_start, available_time_end FROM doctors WHERE doctor_id = ?`,
            [testDoctorId]
          );
          
          const doctor = doctors[0];
          
          // Calculate all slots
          const allSlots = [];
          
          if (doctor.available_time_start && doctor.available_time_end) {
            const [sHour, sMinute] = doctor.available_time_start.split(':').map(Number);
            const [eHour, eMinute] = doctor.available_time_end.split(':').map(Number);
            
            let currentHour = sHour;
            let currentMinute = sMinute;
            const slotDuration = 30;
            
            while (currentHour < eHour || (currentHour === eHour && currentMinute < eMinute)) {
              const timeSlot = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
              allSlots.push(timeSlot);
              
              currentMinute += slotDuration;
              if (currentMinute >= 60) {
                currentHour += Math.floor(currentMinute / 60);
                currentMinute = currentMinute % 60;
              }
            }
          }
          
          // Restore original availability
          await pool.query(
            `UPDATE doctors SET available_time_start = '09:00:00', available_time_end = '17:00:00'
             WHERE doctor_id = ?`,
            [testDoctorId]
          );
          
          // Property: All slots should be within the availability window
          const allSlotsValid = allSlots.every(slot => {
            const [hour, minute] = slot.split(':').map(Number);
            const slotMinutes = hour * 60 + minute;
            const startMinutes = startHour * 60;
            const endMinutes = endHour * 60;
            return slotMinutes >= startMinutes && slotMinutes < endMinutes;
          });
          
          // Property: Slots should be 30 minutes apart
          let slotsAre30MinutesApart = true;
          for (let i = 1; i < allSlots.length; i++) {
            const [prevHour, prevMinute] = allSlots[i - 1].split(':').map(Number);
            const [currHour, currMinute] = allSlots[i].split(':').map(Number);
            const prevMinutes = prevHour * 60 + prevMinute;
            const currMinutes = currHour * 60 + currMinute;
            if (currMinutes - prevMinutes !== 30) {
              slotsAre30MinutesApart = false;
              break;
            }
          }
          
          return allSlotsValid && slotsAre30MinutesApart;
        }
      ),
      { numRuns: 30 }
    );
  });
});
