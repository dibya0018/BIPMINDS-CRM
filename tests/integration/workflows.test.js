/**
 * End-to-End Workflow Integration Tests
 * 
 * Tests complete workflows across multiple components:
 * - Patient registration flow
 * - Appointment booking flow
 * - Payment flow
 * - Lead conversion flow
 * 
 * Requirements: 6.1, 6.3, 8.1, 8.2, 9.1, 10.5
 */

const request = require('supertest');
const { getPool } = require('../../config/database');
const { generateQRData, decryptQRData } = require('../../utils/qrCode');
const { hashPassword } = require('../../utils/password');
const { generateAccessToken } = require('../../utils/jwt');

// Mock Express app for testing
const express = require('express');
const app = express();

// Import middleware
const helmet = require('helmet');
const cors = require('cors');
const { errorHandler } = require('../../middleware/errorHandler');

// Import routes
const authRoutes = require('../../routes/auth');
const patientRoutes = require('../../routes/patients');
const appointmentRoutes = require('../../routes/appointments');
const paymentRoutes = require('../../routes/payments');
const leadRoutes = require('../../routes/leads');

// Configure app
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/leads', leadRoutes);

// Error handler
app.use(errorHandler);

// Test data
let testUser;
let testToken;
let testPatient;
let testDoctor;
let testAppointment;
let testPayment;
let testLead;

describe('End-to-End Workflow Integration Tests', () => {
  let pool;

  beforeAll(async () => {
    pool = getPool();
    
    // Create test user for authentication
    const hashedPassword = await hashPassword('Test@1234');
    const [userResult] = await pool.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
      ['test.workflow@hospital.com', hashedPassword, 'Test', 'User', 'admin']
    );
    
    testUser = {
      userId: userResult.insertId,
      email: 'test.workflow@hospital.com',
      userType: 'admin',
      roles: ['admin']
    };
    
    // Get or create super_admin role
    let [roles] = await pool.execute('SELECT role_id FROM roles WHERE role_name = ?', ['super_admin']);
    let roleId;
    
    if (roles.length === 0) {
      const [roleResult] = await pool.execute(
        'INSERT INTO roles (role_name, description, is_active, created_at, updated_at) VALUES (?, ?, TRUE, NOW(), NOW())',
        ['super_admin', 'Super Administrator with all permissions']
      );
      roleId = roleResult.insertId;
    } else {
      roleId = roles[0].role_id;
    }
    
    // Assign super_admin role to test user
    await pool.execute(
      'INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())',
      [testUser.userId, roleId]
    );
    
    // Create all necessary permissions if they don't exist
    const permissions = [
      { name: 'patients:create', resource: 'patients', action: 'create' },
      { name: 'patients:read', resource: 'patients', action: 'read' },
      { name: 'patients:update', resource: 'patients', action: 'update' },
      { name: 'patients:delete', resource: 'patients', action: 'delete' },
      { name: 'appointments:create', resource: 'appointments', action: 'create' },
      { name: 'appointments:read', resource: 'appointments', action: 'read' },
      { name: 'appointments:update', resource: 'appointments', action: 'update' },
      { name: 'appointments:delete', resource: 'appointments', action: 'delete' },
      { name: 'payments:create', resource: 'payments', action: 'create' },
      { name: 'payments:read', resource: 'payments', action: 'read' },
      { name: 'payments:update', resource: 'payments', action: 'update' },
      { name: 'leads:create', resource: 'leads', action: 'create' },
      { name: 'leads:read', resource: 'leads', action: 'read' },
      { name: 'leads:update', resource: 'leads', action: 'update' }
    ];
    
    for (const perm of permissions) {
      let [existingPerm] = await pool.execute(
        'SELECT permission_id FROM permissions WHERE permission_name = ?',
        [perm.name]
      );
      
      let permId;
      if (existingPerm.length === 0) {
        const [permResult] = await pool.execute(
          'INSERT INTO permissions (permission_name, resource, action, created_at) VALUES (?, ?, ?, NOW())',
          [perm.name, perm.resource, perm.action]
        );
        permId = permResult.insertId;
      } else {
        permId = existingPerm[0].permission_id;
      }
      
      // Assign permission to super_admin role
      await pool.execute(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id, granted_at) VALUES (?, ?, NOW())',
        [roleId, permId]
      );
    }
    
    // Generate test token
    testToken = generateAccessToken(testUser);
    
    // Create test doctor
    const [doctorUserResult] = await pool.execute(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
      ['test.doctor@hospital.com', hashedPassword, 'Test', 'Doctor', 'doctor']
    );
    
    const [doctorResult] = await pool.execute(
      `INSERT INTO doctors (user_id, doctor_code, specialization, qualification, license_number, consultation_fee, is_available, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
      [doctorUserResult.insertId, 'D-TEST01', 'General Medicine', 'MBBS, MD', 'LIC-TEST-001', 500.00]
    );
    
    testDoctor = {
      doctorId: doctorResult.insertId,
      userId: doctorUserResult.insertId,
      doctorCode: 'D-TEST01'
    };
  });

  afterAll(async () => {
    // Clean up test data
    if (testPayment) {
      await pool.execute('DELETE FROM payments WHERE payment_id = ?', [testPayment.paymentId]);
    }
    if (testAppointment) {
      await pool.execute('DELETE FROM appointments WHERE appointment_id = ?', [testAppointment.appointmentId]);
    }
    if (testPatient) {
      await pool.execute('DELETE FROM qr_codes WHERE patient_id = ?', [testPatient.patientId]);
      await pool.execute('DELETE FROM patients WHERE patient_id = ?', [testPatient.patientId]);
    }
    if (testLead) {
      await pool.execute('DELETE FROM leads WHERE lead_id = ?', [testLead.leadId]);
    }
    if (testDoctor) {
      await pool.execute('DELETE FROM doctors WHERE doctor_id = ?', [testDoctor.doctorId]);
      await pool.execute('DELETE FROM users WHERE user_id = ?', [testDoctor.userId]);
    }
    if (testUser) {
      // Clean up user roles and permissions
      await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [testUser.userId]);
      await pool.execute('DELETE FROM users WHERE user_id = ?', [testUser.userId]);
    }
  });

  /**
   * Test 1: Complete Patient Registration Flow
   * Requirements: 6.1, 6.3
   * 
   * Flow:
   * 1. Create patient with valid data
   * 2. Verify patient code is generated (P-XXXXXX format)
   * 3. Verify QR code is automatically generated
   * 4. Scan QR code and verify patient data is returned
   * 5. Verify scan counter is incremented
   */
  describe('Complete Patient Registration Flow', () => {
    it('should complete full patient registration workflow', async () => {
      // Step 1: Create patient
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        gender: 'male',
        bloodGroup: 'O+',
        phone: '9876543210',
        email: 'john.doe.workflow@test.com',
        address: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        zipCode: '123456'
      };
      
      const createResponse = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .send(patientData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('patient_id');
      expect(createResponse.body.data).toHaveProperty('patient_code');
      expect(createResponse.body.data.patient_code).toMatch(/^P-\d{6}$/);
      expect(createResponse.body.data).toHaveProperty('qr_code_data');
      expect(createResponse.body.data).toHaveProperty('qr_code_image_url');
      
      testPatient = {
        patientId: createResponse.body.data.patient_id,
        patientCode: createResponse.body.data.patient_code,
        qrCodeData: createResponse.body.data.qr_code_data
      };
      
      // Step 2: Verify QR code can be decrypted
      const decryptedData = decryptQRData(testPatient.qrCodeData);
      expect(decryptedData.patientId).toBe(testPatient.patientId);
      expect(decryptedData.patientCode).toBe(testPatient.patientCode);
      
      // Step 3: Scan QR code
      const scanResponse = await request(app)
        .post('/api/patients/scan-qr')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ qrData: testPatient.qrCodeData })
        .expect(200);
      
      expect(scanResponse.body.success).toBe(true);
      expect(scanResponse.body.data.patient_id).toBe(testPatient.patientId);
      expect(scanResponse.body.data.scan_count).toBe(1);
      
      // Step 4: Scan again and verify counter increments
      const scanResponse2 = await request(app)
        .post('/api/patients/scan-qr')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ qrData: testPatient.qrCodeData })
        .expect(200);
      
      expect(scanResponse2.body.data.scan_count).toBe(2);
    });
  });

  /**
   * Test 2: Complete Appointment Booking Flow
   * Requirements: 8.1, 8.2
   * 
   * Flow:
   * 1. Check doctor availability
   * 2. Create appointment with valid time slot
   * 3. Verify appointment code is generated (A-XXXXXX format)
   * 4. Attempt to create conflicting appointment (should fail)
   * 5. Update appointment status
   * 6. Cancel appointment with reason
   */
  describe('Complete Appointment Booking Flow', () => {
    it('should complete full appointment booking workflow', async () => {
      // Ensure we have a test patient
      if (!testPatient) {
        const patientData = {
          firstName: 'Jane',
          lastName: 'Smith',
          dateOfBirth: '1985-05-20',
          gender: 'female',
          bloodGroup: 'A+',
          phone: '9876543211',
          email: 'jane.smith.workflow@test.com'
        };
        
        const createResponse = await request(app)
          .post('/api/patients')
          .set('Authorization', `Bearer ${testToken}`)
          .send(patientData)
          .expect(201);
        
        testPatient = {
          patientId: createResponse.body.data.patient_id,
          patientCode: createResponse.body.data.patient_code
        };
      }
      
      // Step 1: Create appointment
      const appointmentData = {
        patientId: testPatient.patientId,
        doctorId: testDoctor.doctorId,
        appointmentDate: '2026-02-15',
        appointmentTime: '10:00:00',
        appointmentType: 'consultation',
        reason: 'Regular checkup',
        durationMinutes: 30
      };
      
      const createResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(appointmentData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('appointment_id');
      expect(createResponse.body.data).toHaveProperty('appointment_code');
      expect(createResponse.body.data.appointment_code).toMatch(/^A-\d{6}$/);
      expect(createResponse.body.data.status).toBe('pending');
      
      testAppointment = {
        appointmentId: createResponse.body.data.appointment_id,
        appointmentCode: createResponse.body.data.appointment_code
      };
      
      // Step 2: Attempt to create conflicting appointment (same doctor, date, time)
      const conflictResponse = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(appointmentData)
        .expect(409);
      
      expect(conflictResponse.body.success).toBe(false);
      expect(conflictResponse.body.error.code).toBe('CONFLICT');
      
      // Step 3: Update appointment status to confirmed
      const statusResponse = await request(app)
        .patch(`/api/appointments/${testAppointment.appointmentId}/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ status: 'confirmed' })
        .expect(200);
      
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.status).toBe('confirmed');
      
      // Step 4: Cancel appointment
      const cancelResponse = await request(app)
        .delete(`/api/appointments/${testAppointment.appointmentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ cancelledReason: 'Patient requested cancellation' })
        .expect(200);
      
      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.data.status).toBe('cancelled');
      expect(cancelResponse.body.data.cancelled_reason).toBe('Patient requested cancellation');
      expect(cancelResponse.body.data.cancelled_at).toBeTruthy();
    });
  });

  /**
   * Test 3: Complete Payment Flow
   * Requirements: 9.1
   * 
   * Flow:
   * 1. Create payment with invoice generation
   * 2. Verify invoice number is generated (INV-XXXXXX format)
   * 3. Verify total amount calculation (amount + tax - discount)
   * 4. Update payment status to paid
   * 5. Verify payment_date is set when status is paid
   */
  describe('Complete Payment Flow', () => {
    it('should complete full payment workflow', async () => {
      // Ensure we have a test patient
      if (!testPatient) {
        const patientData = {
          firstName: 'Bob',
          lastName: 'Johnson',
          dateOfBirth: '1975-08-10',
          gender: 'male',
          bloodGroup: 'B+',
          phone: '9876543212',
          email: 'bob.johnson.workflow@test.com'
        };
        
        const createResponse = await request(app)
          .post('/api/patients')
          .set('Authorization', `Bearer ${testToken}`)
          .send(patientData)
          .expect(201);
        
        testPatient = {
          patientId: createResponse.body.data.patient_id,
          patientCode: createResponse.body.data.patient_code
        };
      }
      
      // Step 1: Create payment
      const paymentData = {
        patientId: testPatient.patientId,
        amount: 1000.00,
        taxAmount: 180.00,
        discountAmount: 100.00,
        paymentMethod: 'card',
        transactionId: 'TXN-TEST-001',
        description: 'Consultation fee'
      };
      
      const createResponse = await request(app)
        .post('/api/payments')
        .set('Authorization', `Bearer ${testToken}`)
        .send(paymentData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('payment_id');
      expect(createResponse.body.data).toHaveProperty('invoice_number');
      expect(createResponse.body.data.invoice_number).toMatch(/^INV-\d{6}$/);
      
      // Verify total amount calculation: 1000 + 180 - 100 = 1080
      expect(createResponse.body.data.total_amount).toBe('1080.00');
      expect(createResponse.body.data.payment_status).toBe('pending');
      
      testPayment = {
        paymentId: createResponse.body.data.payment_id,
        invoiceNumber: createResponse.body.data.invoice_number
      };
      
      // Step 2: Update payment status to paid
      const statusResponse = await request(app)
        .patch(`/api/payments/${testPayment.paymentId}/status`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ paymentStatus: 'paid' })
        .expect(200);
      
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.payment_status).toBe('paid');
      expect(statusResponse.body.data.payment_date).toBeTruthy();
      
      // Step 3: Verify payment can be retrieved
      const getResponse = await request(app)
        .get(`/api/payments/${testPayment.paymentId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .expect(200);
      
      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.payment_id).toBe(testPayment.paymentId);
      expect(getResponse.body.data.payment_status).toBe('paid');
    });
  });

  /**
   * Test 4: Complete Lead Conversion Flow
   * Requirements: 10.5
   * 
   * Flow:
   * 1. Create lead with basic information
   * 2. Verify lead code is generated (L-XXXXXX format)
   * 3. Update lead status to qualified
   * 4. Convert lead to patient
   * 5. Verify patient is created with lead data
   * 6. Verify lead is linked to patient
   * 7. Verify conversion timestamp is recorded
   * 8. Verify lead status is updated to converted
   */
  describe('Complete Lead Conversion Flow', () => {
    it('should complete full lead conversion workflow', async () => {
      // Step 1: Create lead
      const leadData = {
        firstName: 'Alice',
        lastName: 'Williams',
        phone: '9876543213',
        email: 'alice.williams.workflow@test.com',
        source: 'website',
        status: 'new',
        priority: 'high',
        interestedIn: 'General checkup',
        notes: 'Interested in health package'
      };
      
      const createResponse = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${testToken}`)
        .send(leadData)
        .expect(201);
      
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data).toHaveProperty('lead_id');
      expect(createResponse.body.data).toHaveProperty('lead_code');
      expect(createResponse.body.data.lead_code).toMatch(/^L-\d{6}$/);
      expect(createResponse.body.data.status).toBe('new');
      
      testLead = {
        leadId: createResponse.body.data.lead_id,
        leadCode: createResponse.body.data.lead_code
      };
      
      // Step 2: Update lead status to qualified
      const updateResponse = await request(app)
        .put(`/api/leads/${testLead.leadId}`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          ...leadData,
          status: 'qualified'
        })
        .expect(200);
      
      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.status).toBe('qualified');
      
      // Step 3: Convert lead to patient
      const conversionData = {
        dateOfBirth: '1992-03-25',
        gender: 'female',
        bloodGroup: 'AB+',
        address: '456 Lead Street',
        city: 'Lead City',
        state: 'Lead State',
        zipCode: '654321'
      };
      
      const convertResponse = await request(app)
        .patch(`/api/leads/${testLead.leadId}/convert`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(conversionData)
        .expect(201);
      
      expect(convertResponse.body.success).toBe(true);
      expect(convertResponse.body.data).toHaveProperty('patient');
      expect(convertResponse.body.data).toHaveProperty('lead');
      
      // Verify patient was created with lead data
      const patient = convertResponse.body.data.patient;
      expect(patient.first_name).toBe(leadData.firstName);
      expect(patient.last_name).toBe(leadData.lastName);
      expect(patient.phone).toBe(leadData.phone);
      expect(patient.email).toBe(leadData.email);
      expect(patient.patient_code).toMatch(/^P-\d{6}$/);
      
      // Verify lead is linked to patient
      const lead = convertResponse.body.data.lead;
      expect(lead.status).toBe('converted');
      expect(lead.converted_to_patient_id).toBe(patient.patient_id);
      expect(lead.converted_at).toBeTruthy();
      
      // Clean up converted patient
      await pool.execute('DELETE FROM qr_codes WHERE patient_id = ?', [patient.patient_id]);
      await pool.execute('DELETE FROM patients WHERE patient_id = ?', [patient.patient_id]);
      
      // Step 4: Verify lead cannot be converted again
      const duplicateConvertResponse = await request(app)
        .patch(`/api/leads/${testLead.leadId}/convert`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(conversionData)
        .expect(409);
      
      expect(duplicateConvertResponse.body.success).toBe(false);
      expect(duplicateConvertResponse.body.error.code).toBe('CONFLICT');
    });
  });
});
