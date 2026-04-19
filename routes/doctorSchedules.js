/**
 * Doctor Schedule Routes
 * 
 * Defines routes for doctor schedule management operations.
 * Supports flexible scheduling with different times for different days.
 */

const express = require('express');
const router = express.Router({ mergeParams: true }); // To access :doctorId from parent router
const {
  getDoctorSchedules,
  upsertDoctorSchedules,
  deleteDoctorSchedule,
  deleteDoctorScheduleByDay
} = require('../controllers/doctorScheduleController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/doctors/:doctorId/schedules
 * Get all schedules for a doctor
 * 
 * Response:
 * - data: array of schedule objects
 * 
 * Note: This endpoint is public to allow the public booking page to view schedules
 */
router.get(
  '/',
  getDoctorSchedules
);

/**
 * POST /api/doctors/:doctorId/schedules
 * Create or update schedules for a doctor
 * 
 * Request body:
 * - schedules: array of { dayOfWeek, startTime, endTime, notes }
 * 
 * Response:
 * - data: array of updated schedule objects
 */
router.post(
  '/',
  authenticate,
  checkPermission('doctors', 'update'),
  auditLog('update_doctor_schedule', 'doctors'),
  upsertDoctorSchedules
);

/**
 * DELETE /api/doctors/:doctorId/schedules/:scheduleId
 * Delete a specific schedule by ID
 * 
 * Parameters:
 * - scheduleId: number (schedule ID)
 * 
 * Response:
 * - message: success message
 */
router.delete(
  '/:scheduleId',
  authenticate,
  checkPermission('doctors', 'update'),
  auditLog('delete_doctor_schedule', 'doctors'),
  deleteDoctorSchedule
);

/**
 * DELETE /api/doctors/:doctorId/schedules/day/:dayOfWeek
 * Delete all schedules for a specific day
 * 
 * Parameters:
 * - dayOfWeek: string (Monday, Tuesday, etc.)
 * 
 * Response:
 * - message: success message
 * - deletedCount: number of deleted schedules
 */
router.delete(
  '/day/:dayOfWeek',
  authenticate,
  checkPermission('doctors', 'update'),
  auditLog('delete_doctor_schedule_by_day', 'doctors'),
  deleteDoctorScheduleByDay
);

module.exports = router;
