/**
 * Doctor Routes
 * 
 * Defines routes for doctor management operations.
 * Includes CRUD operations and availability checking.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
 */

const express = require('express');
const router = express.Router();
const {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  getDoctorAvailability
} = require('../controllers/doctorController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validateDoctor, handleValidationErrors } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');

// Import schedule routes
const scheduleRoutes = require('./doctorSchedules');

/**
 * GET /api/doctors
 * Get all doctors with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - specialization: string (filter by specialization)
 * - isAvailable: boolean (filter by availability)
 * 
 * Response:
 * - data: array of doctor objects with user information
 * - pagination: { page, limit, total, totalPages }
 * 
 * Requirements: 15.7
 * 
 * Note: This endpoint is public to allow the public booking page to list doctors
 */
router.get(
  '/',
  getDoctors
);

/**
 * GET /api/doctors/:id
 * Get doctor by ID
 * 
 * Parameters:
 * - id: number (doctor ID)
 * 
 * Response:
 * - data: doctor object with user information
 * 
 * Requirements: 15.3, 15.4
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('doctors', 'read'),
  getDoctorById
);

/**
 * POST /api/doctors
 * Create new doctor
 * 
 * Request body:
 * - userId: number (required, user account to link)
 * - specialization: string (required)
 * - qualification: string (required)
 * - licenseNumber: string (required)
 * - experienceYears: number (optional, default: 0)
 * - consultationFee: number (optional, default: 0.00)
 * - department: string (optional)
 * - availableDays: array (optional, JSON array of days)
 * - availableTimeStart: string (optional, HH:MM:SS)
 * - availableTimeEnd: string (optional, HH:MM:SS)
 * - maxPatientsPerDay: number (optional, default: 20)
 * - bio: string (optional)
 * 
 * Response:
 * - data: created doctor object with user information
 * 
 * Requirements: 15.1, 15.2
 */
router.post(
  '/',
  authenticate,
  checkPermission('doctors', 'create'),
  validateDoctor,
  handleValidationErrors,
  auditLog('create_doctor', 'doctors'),
  createDoctor
);

/**
 * PUT /api/doctors/:id
 * Update doctor
 * 
 * Parameters:
 * - id: number (doctor ID)
 * 
 * Request body:
 * - specialization: string (required)
 * - qualification: string (required)
 * - licenseNumber: string (required)
 * - experienceYears: number (optional)
 * - consultationFee: number (optional)
 * - department: string (optional)
 * - availableDays: array (optional, JSON array of days)
 * - availableTimeStart: string (optional, HH:MM:SS)
 * - availableTimeEnd: string (optional, HH:MM:SS)
 * - maxPatientsPerDay: number (optional)
 * - rating: number (optional)
 * - totalPatients: number (optional)
 * - bio: string (optional)
 * - isAvailable: boolean (optional)
 * 
 * Response:
 * - data: updated doctor object with user information
 * 
 * Requirements: 15.4
 */
router.put(
  '/:id',
  authenticate,
  checkPermission('doctors', 'update'),
  validateDoctor,
  handleValidationErrors,
  auditLog('update_doctor', 'doctors'),
  updateDoctor
);

/**
 * GET /api/doctors/:id/availability
 * Get doctor availability for a specific date
 * 
 * Parameters:
 * - id: number (doctor ID)
 * 
 * Query parameters:
 * - date: string (required, YYYY-MM-DD)
 * 
 * Response:
 * - data: {
 *     doctorId: number,
 *     date: string,
 *     isAvailable: boolean,
 *     availableTimeStart: string,
 *     availableTimeEnd: string,
 *     availableSlots: array of time strings,
 *     bookedSlots: array of time strings,
 *     totalSlots: number
 *   }
 * 
 * Requirements: 15.5, 15.6
 */
router.get(
  '/:id/availability',
  authenticate,
  checkPermission('doctors', 'read'),
  getDoctorAvailability
);

/**
 * Mount schedule routes
 * All routes under /api/doctors/:doctorId/schedules
 */
router.use('/:doctorId/schedules', scheduleRoutes);

module.exports = router;
