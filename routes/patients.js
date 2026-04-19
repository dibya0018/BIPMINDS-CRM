/**
 * Patient Routes
 * 
 * Defines routes for patient management operations.
 * Includes CRUD operations, QR code generation, and QR code scanning.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

const express = require('express');
const router = express.Router();
const {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  getPatientQRCode,
  scanQRCode,
  updatePatientStatus
} = require('../controllers/patientController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validatePatient, handleValidationErrors } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');
const { qrScanLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/patients
 * Get all patients with pagination and search
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - search: string (searches name, code, phone, email)
 * 
 * Response:
 * - data: array of patient objects
 * - pagination: { page, limit, total, totalPages }
 * 
 * Requirements: 6.4, 6.5, 6.8
 */
router.get(
  '/',
  authenticate,
  checkPermission('patients', 'read'),
  getPatients
);

/**
 * PATCH /api/patients/:id/status
 * Update patient visit status only
 * 
 * IMPORTANT: This route must come BEFORE /:id to avoid route matching conflicts
 * 
 * Parameters:
 * - id: number (patient ID)
 * 
 * Request body:
 * - visitStatus: string (required, arrived/waiting/in-room/completed)
 * 
 * Response:
 * - data: { patientId, visitStatus }
 */
router.patch(
  '/:id/status',
  authenticate,
  checkPermission('patients', 'update'),
  auditLog('update_patient_status', 'patients'),
  updatePatientStatus
);

/**
 * GET /api/patients/:id
 * Get patient by ID
 * 
 * Parameters:
 * - id: number (patient ID)
 * 
 * Response:
 * - data: patient object with appointment count and last visit date
 * 
 * Requirements: 6.8
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('patients', 'read'),
  getPatientById
);

/**
 * POST /api/patients
 * Create new patient
 * 
 * Request body:
 * - firstName: string (required)
 * - lastName: string (required)
 * - dateOfBirth: string (required, YYYY-MM-DD)
 * - gender: string (required, male/female/other)
 * - bloodGroup: string (required, A+/A-/B+/B-/AB+/AB-/O+/O-)
 * - phone: string (required, 10 digits)
 * - email: string (optional)
 * - address: string (optional)
 * - city: string (optional)
 * - state: string (optional)
 * - zipCode: string (optional)
 * - emergencyContactName: string (optional)
 * - emergencyContactPhone: string (optional)
 * - emergencyContactRelation: string (optional)
 * - medicalHistory: string (optional)
 * - allergies: string (optional)
 * - currentMedications: string (optional)
 * - insuranceProvider: string (optional)
 * - insuranceNumber: string (optional)
 * 
 * Response:
 * - data: created patient object with QR code data
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
router.post(
  '/',
  authenticate,
  checkPermission('patients', 'create'),
  validatePatient,
  handleValidationErrors,
  auditLog('create_patient', 'patients'),
  createPatient
);

/**
 * PUT /api/patients/:id
 * Update patient
 * 
 * Parameters:
 * - id: number (patient ID)
 * 
 * Request body: Same as POST /api/patients
 * 
 * Response:
 * - data: updated patient object
 * 
 * Requirements: 6.6
 */
router.put(
  '/:id',
  authenticate,
  checkPermission('patients', 'update'),
  validatePatient,
  handleValidationErrors,
  auditLog('update_patient', 'patients'),
  updatePatient
);

/**
 * DELETE /api/patients/:id
 * Delete patient (soft delete)
 * 
 * Parameters:
 * - id: number (patient ID)
 * 
 * Response:
 * - message: success message
 * 
 * Requirements: 6.7
 */
router.delete(
  '/:id',
  authenticate,
  checkPermission('patients', 'delete'),
  auditLog('delete_patient', 'patients'),
  deletePatient
);

/**
 * GET /api/patients/:id/qr-code
 * Get patient QR code
 * 
 * Parameters:
 * - id: number (patient ID)
 * 
 * Response:
 * - data: QR code object with image URL and scan statistics
 * 
 * Requirements: 7.3, 7.4
 */
router.get(
  '/:id/qr-code',
  authenticate,
  checkPermission('patients', 'read'),
  getPatientQRCode
);

/**
 * POST /api/patients/scan-qr
 * Scan patient QR code
 * 
 * Request body:
 * - qrData: string (encrypted QR code data)
 * 
 * Response:
 * - data: patient object with scan statistics
 * 
 * Requirements: 7.5, 7.7, 7.8, 7.10
 */
router.post(
  '/scan-qr',
  authenticate,
  qrScanLimiter,
  auditLog('scan_qr', 'patients'),
  scanQRCode
);

module.exports = router;
