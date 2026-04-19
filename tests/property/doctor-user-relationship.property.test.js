/**
 * Property-Based Test: Doctor-User Relationship
 * Feature: hospital-crm-api, Property 38: Doctor-User Relationship
 * 
 * Tests that each doctor is linked to exactly one user account and that
 * the relationship is properly maintained.
 * 
 * **Validates: Requirements 15.2**
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

describe('Property 38: Doctor-User Relationship', () => {
  let pool;
  let testUserIds = [];
  let testDoctorIds = [];
  
  beforeAll(async () => {
    pool = getPool();
  });
  
  afterAll(async () => {
    // Clean up all test data
    for (const doctorId of testDoctorIds) {
      await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [doctorId]);
    }
    for (const userId of testUserIds) {
      await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
    }
  });
  
  afterEach(async () => {
    // Clean up test data after each test
    for (const doctorId of testDoctorIds) {
      await pool.query('DELETE FROM doctors WHERE doctor_id = ?', [doctorId]);
    }
    for (const userId of testUserIds) {
      await pool.query('DELETE FROM users WHERE user_id = ?', [userId]);
    }
    testUserIds = [];
    testDoctorIds = [];
  });
  
  test('should link each doctor to exactly one user account', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            specialization: fc.constantFrom('Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'General'),
            licenseNumber: fc.string({ minLength: 6, maxLength: 10 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (doctors) => {
          const createdDoctors = [];
          
          // Create users and doctors
          for (const doctor of doctors) {
            // Create user with unique email
            const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
            const email = `${doctor.firstName.toLowerCase()}.${doctor.lastName.toLowerCase()}.${uniqueId}@test.com`;
            const [userResult] = await pool.query(
              `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
               VALUES (?, '$2b$12$test', ?, ?, 'doctor')`,
              [email, doctor.firstName, doctor.lastName]
            );
            const userId = userResult.insertId;
            testUserIds.push(userId);
            
            // Create doctor
            const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
            const licenseNumber = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
            const [doctorResult] = await pool.query(
              `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
               VALUES (?, ?, ?, 'MBBS', ?)`,
              [userId, doctorCode, doctor.specialization, licenseNumber]
            );
            const doctorId = doctorResult.insertId;
            testDoctorIds.push(doctorId);
            
            createdDoctors.push({ doctorId, userId });
          }
          
          // Verify each doctor has exactly one user
          let allDoctorsHaveOneUser = true;
          for (const { doctorId, userId } of createdDoctors) {
            const [doctorRows] = await pool.query(
              'SELECT user_id FROM doctors WHERE doctor_id = ?',
              [doctorId]
            );
            
            if (doctorRows.length !== 1 || doctorRows[0].user_id !== userId) {
              allDoctorsHaveOneUser = false;
              break;
            }
          }
          
          // Verify each user is linked to at most one doctor
          let allUsersHaveAtMostOneDoctor = true;
          for (const { userId } of createdDoctors) {
            const [doctorRows] = await pool.query(
              'SELECT doctor_id FROM doctors WHERE user_id = ?',
              [userId]
            );
            
            if (doctorRows.length > 1) {
              allUsersHaveAtMostOneDoctor = false;
              break;
            }
          }
          
          return allDoctorsHaveOneUser && allUsersHaveAtMostOneDoctor;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should prevent creating multiple doctors for the same user', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          specialization1: fc.constantFrom('Cardiology', 'Neurology', 'Orthopedics'),
          specialization2: fc.constantFrom('Pediatrics', 'General', 'Dermatology')
        }),
        async (data) => {
          // Create user with unique email
          const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
          const email = `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}.${uniqueId}@test.com`;
          const [userResult] = await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
             VALUES (?, '$2b$12$test', ?, ?, 'doctor')`,
            [email, data.firstName, data.lastName]
          );
          const userId = userResult.insertId;
          testUserIds.push(userId);
          
          // Create first doctor
          const doctorCode1 = `D-${Math.floor(100000 + Math.random() * 900000)}`;
          const licenseNumber1 = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
          const [doctorResult1] = await pool.query(
            `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
             VALUES (?, ?, ?, 'MBBS', ?)`,
            [userId, doctorCode1, data.specialization1, licenseNumber1]
          );
          const doctorId1 = doctorResult1.insertId;
          testDoctorIds.push(doctorId1);
          
          // Try to create second doctor with same user_id
          let secondDoctorCreated = false;
          try {
            const doctorCode2 = `D-${Math.floor(100000 + Math.random() * 900000)}`;
            const licenseNumber2 = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
            const [doctorResult2] = await pool.query(
              `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
               VALUES (?, ?, ?, 'MD', ?)`,
              [userId, doctorCode2, data.specialization2, licenseNumber2]
            );
            
            if (doctorResult2.insertId) {
              testDoctorIds.push(doctorResult2.insertId);
              secondDoctorCreated = true;
            }
          } catch (error) {
            // Expected to fail due to unique constraint on user_id
            secondDoctorCreated = false;
          }
          
          // Verify only one doctor exists for this user
          const [doctorRows] = await pool.query(
            'SELECT doctor_id FROM doctors WHERE user_id = ?',
            [userId]
          );
          
          // Property: Should have exactly one doctor and second creation should fail
          return doctorRows.length === 1 && !secondDoctorCreated;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should maintain referential integrity when querying doctor with user info', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
            email: fc.emailAddress(),
            specialization: fc.constantFrom('Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics')
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (doctors) => {
          const createdDoctors = [];
          
          // Create users and doctors
          for (const doctor of doctors) {
            // Create user
            const [userResult] = await pool.query(
              `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
               VALUES (?, '$2b$12$test', ?, ?, 'doctor')`,
              [doctor.email, doctor.firstName, doctor.lastName]
            );
            const userId = userResult.insertId;
            testUserIds.push(userId);
            
            // Create doctor
            const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
            const licenseNumber = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
            const [doctorResult] = await pool.query(
              `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
               VALUES (?, ?, ?, 'MBBS', ?)`,
              [userId, doctorCode, doctor.specialization, licenseNumber]
            );
            const doctorId = doctorResult.insertId;
            testDoctorIds.push(doctorId);
            
            createdDoctors.push({ 
              doctorId, 
              userId, 
              firstName: doctor.firstName, 
              lastName: doctor.lastName,
              email: doctor.email,
              specialization: doctor.specialization
            });
          }
          
          // Query doctors with user information (JOIN)
          let allJoinsValid = true;
          for (const doctor of createdDoctors) {
            const [rows] = await pool.query(
              `SELECT d.doctor_id, d.user_id, d.specialization,
                      u.user_id as user_user_id, u.first_name, u.last_name, u.email
               FROM doctors d
               INNER JOIN users u ON d.user_id = u.user_id
               WHERE d.doctor_id = ?`,
              [doctor.doctorId]
            );
            
            if (rows.length !== 1) {
              allJoinsValid = false;
              break;
            }
            
            const row = rows[0];
            
            // Verify referential integrity
            if (row.user_id !== doctor.userId ||
                row.user_user_id !== doctor.userId ||
                row.first_name !== doctor.firstName ||
                row.last_name !== doctor.lastName ||
                row.email !== doctor.email ||
                row.specialization !== doctor.specialization) {
              allJoinsValid = false;
              break;
            }
          }
          
          return allJoinsValid;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should ensure user exists before creating doctor', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 999999, max: 9999999 }), // Non-existent user ID
        fc.constantFrom('Cardiology', 'Neurology', 'Orthopedics'),
        async (nonExistentUserId, specialization) => {
          // Verify user doesn't exist
          const [userRows] = await pool.query(
            'SELECT user_id FROM users WHERE user_id = ?',
            [nonExistentUserId]
          );
          
          if (userRows.length > 0) {
            // Skip this test case if user happens to exist
            return true;
          }
          
          // Try to create doctor with non-existent user
          let doctorCreated = false;
          let doctorId = null;
          try {
            const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
            const licenseNumber = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
            const [doctorResult] = await pool.query(
              `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number)
               VALUES (?, ?, ?, 'MBBS', ?)`,
              [nonExistentUserId, doctorCode, specialization, licenseNumber]
            );
            
            if (doctorResult.insertId) {
              doctorId = doctorResult.insertId;
              testDoctorIds.push(doctorId);
              doctorCreated = true;
            }
          } catch (error) {
            // Expected to fail due to foreign key constraint
            doctorCreated = false;
          }
          
          // Property: Should not be able to create doctor without valid user
          return !doctorCreated;
        }
      ),
      { numRuns: 30 }
    );
  });
  
  test('should preserve user-doctor relationship after updates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          firstName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          lastName: fc.string({ minLength: 2, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          initialSpecialization: fc.constantFrom('Cardiology', 'Neurology'),
          updatedSpecialization: fc.constantFrom('Orthopedics', 'Pediatrics'),
          initialFee: fc.float({ min: 100, max: 500, noNaN: true }),
          updatedFee: fc.float({ min: 500, max: 1000, noNaN: true })
        }),
        async (data) => {
          // Create user with unique email
          const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
          const email = `${data.firstName.toLowerCase()}.${data.lastName.toLowerCase()}.${uniqueId}@test.com`;
          const [userResult] = await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
             VALUES (?, '$2b$12$test', ?, ?, 'doctor')`,
            [email, data.firstName, data.lastName]
          );
          const userId = userResult.insertId;
          testUserIds.push(userId);
          
          // Create doctor
          const doctorCode = `D-${Math.floor(100000 + Math.random() * 900000)}`;
          const licenseNumber = `LIC-${Math.floor(100000 + Math.random() * 900000)}`;
          const [doctorResult] = await pool.query(
            `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number, consultation_fee)
             VALUES (?, ?, ?, 'MBBS', ?, ?)`,
            [userId, doctorCode, data.initialSpecialization, licenseNumber, data.initialFee]
          );
          const doctorId = doctorResult.insertId;
          testDoctorIds.push(doctorId);
          
          // Update doctor information
          await pool.query(
            `UPDATE doctors SET specialization = ?, consultation_fee = ? WHERE doctor_id = ?`,
            [data.updatedSpecialization, data.updatedFee, doctorId]
          );
          
          // Verify user_id is still the same after update
          const [doctorRows] = await pool.query(
            'SELECT user_id, specialization, consultation_fee FROM doctors WHERE doctor_id = ?',
            [doctorId]
          );
          
          if (doctorRows.length !== 1) {
            return false;
          }
          
          const doctor = doctorRows[0];
          
          // Property: user_id should remain unchanged, but other fields should be updated
          return doctor.user_id === userId &&
                 doctor.specialization === data.updatedSpecialization &&
                 Math.abs(doctor.consultation_fee - data.updatedFee) < 0.01;
        }
      ),
      { numRuns: 30 }
    );
  });
});
