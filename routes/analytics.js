/**
 * Analytics Routes
 * 
 * Defines routes for analytics and dashboard statistics operations.
 * Provides key metrics for hospital operations monitoring.
 * 
 * Requirements: 16.8
 */

const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

/**
 * GET /api/analytics/dashboard
 * Get dashboard statistics
 * 
 * Response:
 * - data: {
 *     total_active_patients: number,
 *     todays_appointments: number,
 *     active_doctors: number,
 *     current_month_revenue: string,
 *     pending_leads: number,
 *     revenue_growth_percentage: string,
 *     appointment_growth_percentage: string
 *   }
 * 
 * Requirements: 16.8
 */
router.get(
  '/dashboard',
  authenticate,
  checkPermission('analytics', 'read'),
  getDashboardStats
);

module.exports = router;
