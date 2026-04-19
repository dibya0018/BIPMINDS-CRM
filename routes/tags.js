/**
 * Tag Routes
 * 
 * Defines routes for the independent tagging system.
 * Tags can be used across all entities (patients, doctors, appointments, etc.)
 */

const express = require('express');
const router = express.Router();
const {
  getAllTags,
  searchTags,
  createTag,
  updateTag,
  deleteTag,
  assignTagToPatient,
  removeTagFromPatient,
  getPatientTags
} = require('../controllers/tagController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/tags
 * Get all tags with pagination
 */
router.get(
  '/',
  authenticate,
  checkPermission('patients', 'read'),
  getAllTags
);

/**
 * GET /api/tags/search
 * Search tags for autocomplete (Elasticsearch-ready)
 * Query params: q or search, limit
 */
router.get(
  '/search',
  authenticate,
  checkPermission('patients', 'read'),
  searchTags
);

/**
 * POST /api/tags
 * Create new tag
 */
router.post(
  '/',
  authenticate,
  checkPermission('patients', 'create'),
  auditLog('create_tag', 'tags'),
  createTag
);

/**
 * PUT /api/tags/:id
 * Update tag
 */
router.put(
  '/:id',
  authenticate,
  checkPermission('patients', 'update'),
  auditLog('update_tag', 'tags'),
  updateTag
);

/**
 * DELETE /api/tags/:id
 * Delete tag
 */
router.delete(
  '/:id',
  authenticate,
  checkPermission('patients', 'delete'),
  auditLog('delete_tag', 'tags'),
  deleteTag
);

/**
 * POST /api/tags/patients/:patientId
 * Assign tag to patient (creates tag if doesn't exist)
 */
router.post(
  '/patients/:patientId',
  authenticate,
  checkPermission('patients', 'update'),
  auditLog('assign_tag_to_patient', 'patients'),
  assignTagToPatient
);

/**
 * DELETE /api/tags/patients/:patientId/:tagId
 * Remove tag from patient
 */
router.delete(
  '/patients/:patientId/:tagId',
  authenticate,
  checkPermission('patients', 'update'),
  auditLog('remove_tag_from_patient', 'patients'),
  removeTagFromPatient
);

/**
 * GET /api/tags/patients/:patientId
 * Get all tags for a patient
 */
router.get(
  '/patients/:patientId',
  authenticate,
  checkPermission('patients', 'read'),
  getPatientTags
);

module.exports = router;
