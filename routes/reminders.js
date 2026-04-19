/**
 * Reminder Routes
 * 
 * Defines routes for reminder management operations.
 */

const express = require('express');
const router = express.Router();
const {
  getReminders,
  getReminderById,
  getRemindersByEntity,
  createReminder,
  updateReminder,
  deleteReminder,
  assignTagToReminder,
  removeTagFromReminder,
  getReminderTags
} = require('../controllers/reminderController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/reminders
 * Get all reminders with pagination and search
 */
router.get(
  '/',
  authenticate,
  getReminders
);

/**
 * GET /api/reminders/entity/:entityType/:entityId
 * Get reminders for a specific entity (e.g., patient)
 * IMPORTANT: This must come BEFORE /:id route
 */
router.get(
  '/entity/:entityType/:entityId',
  authenticate,
  getRemindersByEntity
);

/**
 * GET /api/reminders/:id
 * Get reminder by ID
 */
router.get(
  '/:id',
  authenticate,
  getReminderById
);

/**
 * POST /api/reminders
 * Create new reminder
 */
router.post(
  '/',
  authenticate,
  auditLog('create_reminder', 'reminders'),
  createReminder
);

/**
 * PUT /api/reminders/:id
 * Update reminder
 */
router.put(
  '/:id',
  authenticate,
  auditLog('update_reminder', 'reminders'),
  updateReminder
);

/**
 * DELETE /api/reminders/:id
 * Delete reminder (soft delete)
 */
router.delete(
  '/:id',
  authenticate,
  auditLog('delete_reminder', 'reminders'),
  deleteReminder
);

/**
 * POST /api/reminders/:reminderId/tags
 * Assign tag to reminder
 */
router.post(
  '/:reminderId/tags',
  authenticate,
  auditLog('assign_reminder_tag', 'reminders'),
  assignTagToReminder
);

/**
 * DELETE /api/reminders/:reminderId/tags/:tagId
 * Remove tag from reminder
 */
router.delete(
  '/:reminderId/tags/:tagId',
  authenticate,
  auditLog('remove_reminder_tag', 'reminders'),
  removeTagFromReminder
);

/**
 * GET /api/reminders/:reminderId/tags
 * Get all tags for a reminder
 */
router.get(
  '/:reminderId/tags',
  authenticate,
  getReminderTags
);

module.exports = router;
