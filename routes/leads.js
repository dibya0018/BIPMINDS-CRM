/**
 * Lead Routes
 * 
 * Defines routes for lead management operations.
 * Includes CRUD operations and lead conversion to patient.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  convertLeadToPatient
} = require('../controllers/leadController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validateLead, handleValidationErrors } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/leads
 * Get all leads with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by status: new, contacted, qualified, converted, lost)
 * - priority: string (filter by priority: low, medium, high)
 * - source: string (filter by source: website, facebook, google, instagram, referral, walk-in, other)
 * - search: string (searches name, phone, email)
 * 
 * Response:
 * - data: array of lead objects
 * - pagination: { page, limit, total, totalPages }
 * 
 * Requirements: 10.8
 */
router.get(
  '/',
  authenticate,
  checkPermission('leads', 'read'),
  getLeads
);

/**
 * GET /api/leads/:id
 * Get lead by ID
 * 
 * Parameters:
 * - id: number (lead ID)
 * 
 * Response:
 * - data: lead object with assigned user and converted patient information
 * 
 * Requirements: 10.2
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('leads', 'read'),
  getLeadById
);

/**
 * POST /api/leads
 * Create new lead
 * 
 * Request body:
 * - firstName: string (required)
 * - lastName: string (optional)
 * - phone: string (required, 10 digits)
 * - email: string (optional)
 * - source: string (required, website/facebook/google/instagram/referral/walk-in/other)
 * - status: string (optional, default: new)
 * - priority: string (optional, default: medium)
 * - interestedIn: string (optional)
 * - notes: string (optional)
 * - followUpDate: string (optional, YYYY-MM-DD)
 * 
 * Response:
 * - data: created lead object
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
router.post(
  '/',
  authenticate,
  checkPermission('leads', 'create'),
  validateLead,
  handleValidationErrors,
  auditLog('create_lead', 'leads'),
  createLead
);

/**
 * PUT /api/leads/:id
 * Update lead
 * 
 * Parameters:
 * - id: number (lead ID)
 * 
 * Request body: Same as POST /api/leads
 * 
 * Response:
 * - data: updated lead object
 * 
 * Requirements: 10.4
 */
router.put(
  '/:id',
  authenticate,
  checkPermission('leads', 'update'),
  validateLead,
  handleValidationErrors,
  auditLog('update_lead', 'leads'),
  updateLead
);

/**
 * PATCH /api/leads/:id/convert
 * Convert lead to patient
 * 
 * Parameters:
 * - id: number (lead ID)
 * 
 * Request body:
 * - dateOfBirth: string (required, YYYY-MM-DD)
 * - gender: string (required, male/female/other)
 * - bloodGroup: string (required, A+/A-/B+/B-/AB+/AB-/O+/O-)
 * - address: string (optional)
 * - city: string (optional)
 * - state: string (optional)
 * - zipCode: string (optional)
 * - emergencyContactName: string (optional)
 * - emergencyContactPhone: string (optional)
 * - emergencyContactRelation: string (optional)
 * 
 * Response:
 * - data: { patient: patient object, lead: updated lead object }
 * 
 * Requirements: 10.5, 10.6, 10.7
 */
router.patch(
  '/:id/convert',
  authenticate,
  checkPermission('leads', 'update'),
  auditLog('convert_lead', 'leads'),
  convertLeadToPatient
);

module.exports = router;
