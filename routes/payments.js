/**
 * Payment Routes
 * 
 * Defines routes for payment management operations.
 * Includes CRUD operations, invoice generation, and payment status updates.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPaymentById,
  createPayment,
  updatePaymentStatus
} = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validatePayment, handleValidationErrors } = require('../middleware/validation');
const { auditLog } = require('../middleware/audit');

/**
 * GET /api/payments
 * Get all payments with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by payment status)
 * - patientId: number (filter by patient)
 * - startDate: string (filter by date range start)
 * - endDate: string (filter by date range end)
 * 
 * Response:
 * - data: array of payment objects
 * - pagination: { page, limit, total, totalPages }
 * 
 * Requirements: 9.6
 */
router.get(
  '/',
  authenticate,
  checkPermission('payments', 'read'),
  getPayments
);

/**
 * GET /api/payments/:id
 * Get payment by ID
 * 
 * Parameters:
 * - id: number (payment ID)
 * 
 * Response:
 * - data: payment object with patient and appointment information
 * 
 * Requirements: 9.1
 */
router.get(
  '/:id',
  authenticate,
  checkPermission('payments', 'read'),
  getPaymentById
);

/**
 * POST /api/payments
 * Create new payment
 * 
 * Request body:
 * - patientId: number (required)
 * - amount: number (required)
 * - paymentMethod: string (required, cash/card/upi/insurance/bank-transfer)
 * - appointmentId: number (optional)
 * - taxAmount: number (optional)
 * - discountAmount: number (optional)
 * - transactionId: string (optional)
 * - description: string (optional)
 * - notes: string (optional)
 * 
 * Response:
 * - data: created payment object with invoice number and calculated total
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
router.post(
  '/',
  authenticate,
  checkPermission('payments', 'create'),
  validatePayment,
  handleValidationErrors,
  auditLog('create_payment', 'payments'),
  createPayment
);

/**
 * PATCH /api/payments/:id/status
 * Update payment status
 * 
 * Parameters:
 * - id: number (payment ID)
 * 
 * Request body:
 * - paymentStatus: string (required, pending/paid/partial/overdue/refunded)
 * 
 * Response:
 * - data: updated payment object
 * 
 * Requirements: 9.4, 9.5
 */
router.patch(
  '/:id/status',
  authenticate,
  checkPermission('payments', 'update'),
  auditLog('update_payment_status', 'payments'),
  updatePaymentStatus
);

module.exports = router;
