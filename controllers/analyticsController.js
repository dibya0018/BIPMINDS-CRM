/**
 * Analytics Controller
 * 
 * Handles analytics and dashboard statistics operations.
 * Provides key metrics for hospital operations monitoring.
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */

const { getPool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Get dashboard statistics
 * 
 * Retrieves key metrics including:
 * - Total active patients
 * - Today's appointments
 * - Active doctors
 * - Current month revenue
 * - Pending leads
 * - Revenue growth percentage
 * - Appointment growth percentage
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */
async function getDashboardStats(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    // Call stored procedure to get basic dashboard stats
    await connection.query(
      'CALL sp_get_dashboard_stats(@total_active_patients, @todays_appointments, @active_doctors, @current_month_revenue, @pending_leads)'
    );
    
    // Get output parameters
    const [results] = await connection.query(
      'SELECT @total_active_patients as total_active_patients, @todays_appointments as todays_appointments, @active_doctors as active_doctors, @current_month_revenue as current_month_revenue, @pending_leads as pending_leads'
    );
    
    const {
      total_active_patients,
      todays_appointments,
      active_doctors,
      current_month_revenue,
      pending_leads
    } = results[0];
    
    // Calculate revenue growth percentage
    // Get previous month revenue
    const [prevMonthRevenue] = await connection.query(
      `SELECT COALESCE(SUM(total_amount), 0) as prev_month_revenue
       FROM payments
       WHERE payment_status = 'paid'
         AND MONTH(payment_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
         AND YEAR(payment_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))`
    );
    
    const previousMonthRevenue = parseFloat(prevMonthRevenue[0].prev_month_revenue) || 0;
    const currentMonthRevenue = parseFloat(current_month_revenue) || 0;
    
    let revenueGrowth = 0;
    if (previousMonthRevenue > 0) {
      revenueGrowth = ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      revenueGrowth = 100; // 100% growth if previous month was 0
    }
    
    // Calculate appointment growth percentage
    // Get previous month appointments
    const [prevMonthAppointments] = await connection.query(
      `SELECT COUNT(*) as prev_month_appointments
       FROM appointments
       WHERE MONTH(appointment_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
         AND YEAR(appointment_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
         AND status IN ('completed', 'confirmed')`
    );
    
    const [currentMonthAppointments] = await connection.query(
      `SELECT COUNT(*) as current_month_appointments
       FROM appointments
       WHERE MONTH(appointment_date) = MONTH(CURDATE())
         AND YEAR(appointment_date) = YEAR(CURDATE())
         AND status IN ('completed', 'confirmed')`
    );
    
    const previousMonthAppointmentCount = parseInt(prevMonthAppointments[0].prev_month_appointments) || 0;
    const currentMonthAppointmentCount = parseInt(currentMonthAppointments[0].current_month_appointments) || 0;
    
    let appointmentGrowth = 0;
    if (previousMonthAppointmentCount > 0) {
      appointmentGrowth = ((currentMonthAppointmentCount - previousMonthAppointmentCount) / previousMonthAppointmentCount) * 100;
    } else if (currentMonthAppointmentCount > 0) {
      appointmentGrowth = 100; // 100% growth if previous month was 0
    }
    
    const dashboardStats = {
      total_active_patients: parseInt(total_active_patients) || 0,
      todays_appointments: parseInt(todays_appointments) || 0,
      active_doctors: parseInt(active_doctors) || 0,
      current_month_revenue: parseFloat(currentMonthRevenue).toFixed(2),
      pending_leads: parseInt(pending_leads) || 0,
      revenue_growth_percentage: parseFloat(revenueGrowth).toFixed(2),
      appointment_growth_percentage: parseFloat(appointmentGrowth).toFixed(2)
    };
    
    logger.info('Dashboard stats retrieved', { 
      userId: req.user.userId,
      stats: dashboardStats
    });
    
    res.json({
      success: true,
      data: dashboardStats
    });
    
  } catch (error) {
    logger.error('Get dashboard stats error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching dashboard statistics'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getDashboardStats
};
