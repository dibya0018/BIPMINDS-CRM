/**
 * Payment Controller
 * 
 * Handles payment management operations including CRUD, invoice generation,
 * payment calculation, and status updates. Implements filtering and audit logging.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */

const { getPool } = require('../config/database');
const { setAuditOldValues } = require('../middleware/audit');
const logger = require('../config/logger');

/**
 * Generate unique invoice number
 * Format: INV-XXXXXX (INV- followed by 6 random digits)
 * 
 * @returns {string} Unique invoice number
 * 
 * Requirements: 9.1
 */
function generateInvoiceNumber() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `INV-${randomNum}`;
}

/**
 * Calculate total amount
 * Formula: total = amount + tax - discount
 * 
 * @param {number} amount - Base amount
 * @param {number} taxAmount - Tax amount (default: 0)
 * @param {number} discountAmount - Discount amount (default: 0)
 * @returns {number} Total amount
 * 
 * Requirements: 9.2
 */
function calculateTotalAmount(amount, taxAmount = 0, discountAmount = 0) {
  return parseFloat((amount + taxAmount - discountAmount).toFixed(2));
}

/**
 * Get payments with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by payment status)
 * - patientId: number (filter by patient)
 * - startDate: string (filter by date range start)
 * - endDate: string (filter by date range end)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 9.6
 */
async function getPayments(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const patientId = req.query.patientId ? parseInt(req.query.patientId) : null;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build filter query
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (status) {
      whereClause += ' AND pay.payment_status = ?';
      params.push(status);
    }
    
    if (patientId) {
      whereClause += ' AND pay.patient_id = ?';
      params.push(patientId);
    }
    
    if (startDate) {
      whereClause += ' AND DATE(pay.payment_date) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND DATE(pay.payment_date) <= ?';
      params.push(endDate);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM payments pay ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results with patient information
    const query = `
      SELECT 
        pay.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        p.phone as patient_phone,
        a.appointment_code,
        a.appointment_date
      FROM payments pay
      INNER JOIN patients p ON pay.patient_id = p.patient_id
      LEFT JOIN appointments a ON pay.appointment_id = a.appointment_id
      ${whereClause}
      ORDER BY pay.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [payments] = await connection.query(query, params);
    
    logger.info('Payments retrieved', { 
      userId: req.user.userId,
      page,
      limit,
      filters: { status, patientId, startDate, endDate },
      count: payments.length
    });
    
    res.json({
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get payments error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching payments'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get payment by ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 9.1
 */
async function getPaymentById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const paymentId = parseInt(req.params.id);
    
    if (!paymentId || paymentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid payment ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get payment with patient and appointment information
    const query = `
      SELECT 
        pay.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        p.phone as patient_phone,
        p.email as patient_email,
        a.appointment_code,
        a.appointment_date,
        a.appointment_time
      FROM payments pay
      INNER JOIN patients p ON pay.patient_id = p.patient_id
      LEFT JOIN appointments a ON pay.appointment_id = a.appointment_id
      WHERE pay.payment_id = ?
    `;
    
    const [payments] = await connection.query(query, [paymentId]);
    
    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }
    
    const payment = payments[0];
    
    logger.info('Payment retrieved', { 
      userId: req.user.userId,
      paymentId
    });
    
    res.json({
      success: true,
      data: payment
    });
    
  } catch (error) {
    logger.error('Get payment by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching payment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create payment
 * Generates invoice number and calculates total amount
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
async function createPayment(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      patientId,
      appointmentId,
      amount,
      taxAmount,
      discountAmount,
      paymentMethod,
      transactionId,
      description,
      notes
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Check if patient exists and is active
    const [patients] = await connection.query(
      'SELECT patient_id FROM patients WHERE patient_id = ? AND is_active = TRUE',
      [patientId]
    );
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found or inactive'
        }
      });
    }
    
    // If appointment ID is provided, check if it exists
    if (appointmentId) {
      const [appointments] = await connection.query(
        'SELECT appointment_id FROM appointments WHERE appointment_id = ?',
        [appointmentId]
      );
      
      if (appointments.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Appointment not found'
          }
        });
      }
    }
    
    // Generate unique invoice number
    let invoiceNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      invoiceNumber = generateInvoiceNumber();
      
      // Check if invoice number already exists
      const [existing] = await connection.query(
        'SELECT payment_id FROM payments WHERE invoice_number = ?',
        [invoiceNumber]
      );
      
      if (existing.length === 0) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to generate unique invoice number'
        }
      });
    }
    
    // Calculate total amount
    const tax = taxAmount || 0;
    const discount = discountAmount || 0;
    
    // Call stored procedure to create payment
    // sp_create_payment has 12 parameters: 10 IN + 2 OUT (payment_id, total_amount)
    // Parameters: invoice_number, patient_id, appointment_id, amount, tax_amount, discount_amount, 
    //             payment_method, description, due_date, created_by, OUT payment_id, OUT total_amount
    await connection.query(
      `CALL sp_create_payment(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @payment_id, @total_amount)`,
      [
        invoiceNumber,
        patientId,
        appointmentId || null,
        amount,
        tax,
        discount,
        paymentMethod,
        description || null,
        null, // due_date
        req.user.userId
      ]
    );
    
    // Get the payment ID and total amount from output parameters
    const [result] = await connection.query('SELECT @payment_id as payment_id, @total_amount as total_amount');
    const paymentId = result[0].payment_id;
    const calculatedTotal = result[0].total_amount;
    
    if (!paymentId) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create payment'
        }
      });
    }
    
    // Get the created payment with details
    const [payments] = await connection.query(
      `SELECT 
        pay.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code
      FROM payments pay
      INNER JOIN patients p ON pay.patient_id = p.patient_id
      WHERE pay.payment_id = ?`,
      [paymentId]
    );
    
    const payment = payments[0];
    
    logger.info('Payment created', { 
      userId: req.user.userId,
      paymentId,
      invoiceNumber,
      totalAmount: calculatedTotal
    });
    
    res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment created successfully'
    });
    
  } catch (error) {
    logger.error('Create payment error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating payment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update payment status
 * Updates payment status and logs the change for audit
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 9.4, 9.5
 */
async function updatePaymentStatus(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const paymentId = parseInt(req.params.id);
    const { paymentStatus } = req.body;
    
    if (!paymentId || paymentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid payment ID'
        }
      });
    }
    
    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Payment status is required'
        }
      });
    }
    
    const validStatuses = ['pending', 'paid', 'partial', 'overdue', 'refunded'];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid payment status value'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldPayments] = await connection.query(
      'SELECT * FROM payments WHERE payment_id = ?',
      [paymentId]
    );
    
    if (oldPayments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Payment not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldPayments[0]);
    
    // Update payment status and payment_date if status is 'paid'
    if (paymentStatus === 'paid') {
      await connection.execute(
        'UPDATE payments SET payment_status = ?, payment_date = NOW(), updated_at = NOW() WHERE payment_id = ?',
        [paymentStatus, paymentId]
      );
    } else {
      await connection.execute(
        'UPDATE payments SET payment_status = ?, updated_at = NOW() WHERE payment_id = ?',
        [paymentStatus, paymentId]
      );
    }
    
    // Get updated payment
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE payment_id = ?',
      [paymentId]
    );
    
    const payment = payments[0];
    
    logger.info('Payment status updated', { 
      userId: req.user.userId,
      paymentId,
      oldStatus: oldPayments[0].payment_status,
      newStatus: paymentStatus
    });
    
    res.json({
      success: true,
      data: payment,
      message: 'Payment status updated successfully'
    });
    
  } catch (error) {
    logger.error('Update payment status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating payment status'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getPayments,
  getPaymentById,
  createPayment,
  updatePaymentStatus,
  generateInvoiceNumber,
  calculateTotalAmount
};
