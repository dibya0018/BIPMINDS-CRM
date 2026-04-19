/**
 * Appointment Routes
 * 
 * Defines routes for appointment management operations.
 * Includes CRUD operations, status updates, and cancellation.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8
 */

const express = require('express');
const router = express.Router();
const {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment
} = require('../controllers/appointmentController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validateAppointment, handleValidationErrors } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/appointments
 * Get all appointments with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by status)
 * - doctorId: number (filter by doctor)
 * - patientId: number (filter by patient)
 * - startDate: string (filter by date range start, YYYY-MM-DD)
 * - endDate: string (filter by date range end, YYYY-MM-DD)
 * 
 * Response:
 * - data: array of appointment objects with patient and doctor information
 * - pagination: { page, limit, total, totalPages }
 * 
 * Requirements: 8.7, 8.8
 */
router.get(
  '/',
  authenticate,
  checkPermission('appointments', 'read'),
  getAppointments
);

/**
 * GET /api/appointments/:id
 * Get appointment by ID
 * 
 * Parameters:
 * - id: number (appointment ID)
 * 
 * Response:
 * - data: appointment object with patient and doctor details
 * 
 * Requirements: 8.8
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('appointments', 'read'),
  getAppointmentById
);

/**
 * POST /api/appointments
 * Create new appointment
 * 
 * Request body:
 * - patientId: number (required)
 * - doctorId: number (required)
 * - appointmentDate: string (required, YYYY-MM-DD)
 * - appointmentTime: string (required, HH:MM:SS)
 * - appointmentType: string (required, consultation/follow-up/emergency/surgery/checkup)
 * - reason: string (optional)
 * - notes: string (optional)
 * - durationMinutes: number (optional, default: 30)
 * 
 * Response:
 * - data: created appointment object
 * 
 * Requirements: 8.1, 8.2, 8.3
 */
router.post(
  '/',
  authenticate,
  checkPermission('appointments', 'create'),
  validateAppointment,
  handleValidationErrors,
  auditLog('create_appointment', 'appointments'),
  createAppointment
);

/**
 * PUT /api/appointments/:id
 * Update appointment
 * 
 * Parameters:
 * - id: number (appointment ID)
 * 
 * Request body: Same as POST /api/appointments, plus:
 * - diagnosis: string (optional)
 * - prescription: string (optional)
 * 
 * Response:
 * - data: updated appointment object
 * 
 * Requirements: 8.5
 */
router.put(
  '/:id',
  authenticate,
  checkPermission('appointments', 'update'),
  validateAppointment,
  handleValidationErrors,
  auditLog('update_appointment', 'appointments'),
  updateAppointment
);

/**
 * PATCH /api/appointments/:id/status
 * Update appointment status
 * 
 * Parameters:
 * - id: number (appointment ID)
 * 
 * Request body:
 * - status: string (required, pending/confirmed/completed/cancelled/no-show)
 * 
 * Response:
 * - data: updated appointment object
 * 
 * Requirements: 8.5, 8.6
 */
router.patch(
  '/:id/status',
  authenticate,
  checkPermission('appointments', 'update'),
  auditLog('update_appointment_status', 'appointments'),
  updateAppointmentStatus
);

/**
 * DELETE /api/appointments/:id
 * Cancel appointment
 * 
 * Parameters:
 * - id: number (appointment ID)
 * 
 * Request body:
 * - cancelledReason: string (optional)
 * 
 * Response:
 * - data: cancelled appointment object
 * 
 * Requirements: 8.6
 */
router.delete(
  '/:id',
  authenticate,
  checkPermission('appointments', 'delete'),
  auditLog('cancel_appointment', 'appointments'),
  cancelAppointment
);

module.exports = router;
