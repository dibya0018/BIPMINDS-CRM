/**
 * Appointment Controller
 * 
 * Handles appointment management operations including CRUD, availability checking,
 * status updates, and cancellation. Implements filtering and audit logging.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 8.8
 */

const { getPool } = require('../config/database');
const { setAuditOldValues } = require('../middleware/audit');
const logger = require('../config/logger');

/**
 * Generate unique appointment code
 * Format: A-XXXXXX (A- followed by 6 random digits)
 * 
 * @returns {string} Unique appointment code
 * 
 * Requirements: 8.1
 */
function generateAppointmentCode() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `A-${randomNum}`;
}

/**
 * Get appointments with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by status)
 * - doctorId: number (filter by doctor)
 * - patientId: number (filter by patient)
 * - startDate: string (filter by date range start)
 * - endDate: string (filter by date range end)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.7, 8.8
 */
async function getAppointments(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const doctorId = req.query.doctorId ? parseInt(req.query.doctorId) : null;
    const patientId = req.query.patientId ? parseInt(req.query.patientId) : null;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build filter query
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (status) {
      whereClause += ' AND a.status = ?';
      params.push(status);
    }
    
    if (doctorId) {
      whereClause += ' AND a.doctor_id = ?';
      params.push(doctorId);
    }
    
    if (patientId) {
      whereClause += ' AND a.patient_id = ?';
      params.push(patientId);
    }
    
    if (startDate) {
      whereClause += ' AND a.appointment_date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      whereClause += ' AND a.appointment_date <= ?';
      params.push(endDate);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM appointments a ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results with patient and doctor information
    const query = `
      SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        d.doctor_code,
        u.first_name as doctor_first_name,
        u.last_name as doctor_last_name,
        d.specialization
      FROM appointments a
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
      INNER JOIN users u ON d.user_id = u.user_id
      ${whereClause}
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [appointments] = await connection.query(query, params);
    
    logger.info('Appointments retrieved', { 
      userId: req.user.userId,
      page,
      limit,
      filters: { status, doctorId, patientId, startDate, endDate },
      count: appointments.length
    });
    
    res.json({
      success: true,
      data: appointments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get appointments error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching appointments'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get appointment by ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.8
 */
async function getAppointmentById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const appointmentId = parseInt(req.params.id);
    
    if (!appointmentId || appointmentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid appointment ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get appointment with patient and doctor information
    const query = `
      SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        p.phone as patient_phone,
        p.email as patient_email,
        d.doctor_code,
        u.first_name as doctor_first_name,
        u.last_name as doctor_last_name,
        d.specialization,
        d.consultation_fee
      FROM appointments a
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE a.appointment_id = ?
    `;
    
    const [appointments] = await connection.query(query, [appointmentId]);
    
    if (appointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
    }
    
    const appointment = appointments[0];
    
    logger.info('Appointment retrieved', { 
      userId: req.user.userId,
      appointmentId
    });
    
    res.json({
      success: true,
      data: appointment
    });
    
  } catch (error) {
    logger.error('Get appointment by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching appointment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create appointment
 * Checks doctor availability and time slot availability before creating
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.1, 8.2, 8.3
 */
async function createAppointment(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      patientId,
      doctorId,
      appointmentDate,
      appointmentTime,
      appointmentType,
      reason,
      notes,
      durationMinutes
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
    
    // Check if doctor exists and is available
    const [doctors] = await connection.query(
      'SELECT doctor_id, is_available FROM doctors WHERE doctor_id = ?',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Doctor not found'
        }
      });
    }
    
    if (!doctors[0].is_available) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Doctor is not available'
        }
      });
    }
    
    // Check for time slot conflicts
    const [conflicts] = await connection.query(
      `SELECT appointment_id 
       FROM appointments 
       WHERE doctor_id = ? 
         AND appointment_date = ? 
         AND appointment_time = ?
         AND status NOT IN ('cancelled', 'no-show')`,
      [doctorId, appointmentDate, appointmentTime]
    );
    
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Time slot is already booked for this doctor'
        }
      });
    }
    
    // Generate unique appointment code
    let appointmentCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      appointmentCode = generateAppointmentCode();
      
      const [existing] = await connection.query(
        'SELECT appointment_id FROM appointments WHERE appointment_code = ?',
        [appointmentCode]
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
          message: 'Failed to generate unique appointment code'
        }
      });
    }
    
    // Call stored procedure to create appointment
    // sp_create_appointment has 11 parameters: 9 IN + 2 OUT (appointment_id, conflict_exists)
    await connection.query(
      `CALL sp_create_appointment(?, ?, ?, ?, ?, ?, ?, ?, ?, @appointment_id, @conflict_exists)`,
      [
        appointmentCode,
        patientId,
        doctorId,
        appointmentDate,
        appointmentTime,
        appointmentType,
        reason || null,
        durationMinutes || 30,
        req.user.userId
      ]
    );
    
    // Get the appointment ID and conflict status from output parameters
    const [result] = await connection.query('SELECT @appointment_id as appointment_id, @conflict_exists as conflict_exists');
    const appointmentId = result[0].appointment_id;
    
    if (!appointmentId) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create appointment'
        }
      });
    }
    
    // Get the created appointment with details
    const [appointments] = await connection.query(
      `SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        d.doctor_code,
        u.first_name as doctor_first_name,
        u.last_name as doctor_last_name,
        d.specialization
      FROM appointments a
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE a.appointment_id = ?`,
      [appointmentId]
    );
    
    const appointment = appointments[0];
    
    logger.info('Appointment created', { 
      userId: req.user.userId,
      appointmentId,
      appointmentCode
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('appointments', 'create', { appointmentId, appointmentCode });
    }
    
    res.status(201).json({
      success: true,
      data: appointment,
      message: 'Appointment created successfully'
    });
    
  } catch (error) {
    logger.error('Create appointment error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating appointment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update appointment
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.5
 */
async function updateAppointment(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const appointmentId = parseInt(req.params.id);
    
    if (!appointmentId || appointmentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid appointment ID'
        }
      });
    }
    
    const {
      patientId,
      doctorId,
      appointmentDate,
      appointmentTime,
      appointmentType,
      reason,
      notes,
      diagnosis,
      prescription,
      durationMinutes
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldAppointments] = await connection.query(
      'SELECT * FROM appointments WHERE appointment_id = ?',
      [appointmentId]
    );
    
    if (oldAppointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldAppointments[0]);
    
    // If changing doctor or time, check for conflicts
    if (doctorId !== oldAppointments[0].doctor_id || 
        appointmentDate !== oldAppointments[0].appointment_date ||
        appointmentTime !== oldAppointments[0].appointment_time) {
      
      const [conflicts] = await connection.query(
        `SELECT appointment_id 
         FROM appointments 
         WHERE doctor_id = ? 
           AND appointment_date = ? 
           AND appointment_time = ?
           AND appointment_id != ?
           AND status NOT IN ('cancelled', 'no-show')`,
        [doctorId, appointmentDate, appointmentTime, appointmentId]
      );
      
      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Time slot is already booked for this doctor'
          }
        });
      }
    }
    
    // Update appointment
    await connection.execute(
      `UPDATE appointments SET
        patient_id = ?,
        doctor_id = ?,
        appointment_date = ?,
        appointment_time = ?,
        appointment_type = ?,
        reason = ?,
        notes = ?,
        diagnosis = ?,
        prescription = ?,
        duration_minutes = ?,
        updated_at = NOW()
      WHERE appointment_id = ?`,
      [
        patientId,
        doctorId,
        appointmentDate,
        appointmentTime,
        appointmentType,
        reason || null,
        notes || null,
        diagnosis || null,
        prescription || null,
        durationMinutes || 30,
        appointmentId
      ]
    );
    
    // Get updated appointment
    const [appointments] = await connection.query(
      `SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.patient_code,
        d.doctor_code,
        u.first_name as doctor_first_name,
        u.last_name as doctor_last_name,
        d.specialization
      FROM appointments a
      INNER JOIN patients p ON a.patient_id = p.patient_id
      INNER JOIN doctors d ON a.doctor_id = d.doctor_id
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE a.appointment_id = ?`,
      [appointmentId]
    );
    
    const appointment = appointments[0];
    
    logger.info('Appointment updated', { 
      userId: req.user.userId,
      appointmentId
    });
    
    res.json({
      success: true,
      data: appointment,
      message: 'Appointment updated successfully'
    });
    
  } catch (error) {
    logger.error('Update appointment error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating appointment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update appointment status
 * Updates status and logs the change for audit
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.5, 8.6
 */
async function updateAppointmentStatus(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const appointmentId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!appointmentId || appointmentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid appointment ID'
        }
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Status is required'
        }
      });
    }
    
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid status value'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldAppointments] = await connection.query(
      'SELECT * FROM appointments WHERE appointment_id = ?',
      [appointmentId]
    );
    
    if (oldAppointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldAppointments[0]);
    
    // Update status
    await connection.execute(
      'UPDATE appointments SET status = ?, updated_at = NOW() WHERE appointment_id = ?',
      [status, appointmentId]
    );
    
    // Get updated appointment
    const [appointments] = await connection.query(
      'SELECT * FROM appointments WHERE appointment_id = ?',
      [appointmentId]
    );
    
    const appointment = appointments[0];
    
    logger.info('Appointment status updated', { 
      userId: req.user.userId,
      appointmentId,
      oldStatus: oldAppointments[0].status,
      newStatus: status
    });
    
    res.json({
      success: true,
      data: appointment,
      message: 'Appointment status updated successfully'
    });
    
  } catch (error) {
    logger.error('Update appointment status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating appointment status'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Cancel appointment
 * Records cancellation reason and timestamp
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 8.6
 */
async function cancelAppointment(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const appointmentId = parseInt(req.params.id);
    const { cancelledReason } = req.body;
    
    if (!appointmentId || appointmentId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid appointment ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldAppointments] = await connection.query(
      'SELECT * FROM appointments WHERE appointment_id = ?',
      [appointmentId]
    );
    
    if (oldAppointments.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Appointment not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldAppointments[0]);
    
    // Cancel appointment
    await connection.execute(
      `UPDATE appointments SET 
        status = 'cancelled',
        cancelled_reason = ?,
        cancelled_at = NOW(),
        cancelled_by = ?,
        updated_at = NOW()
      WHERE appointment_id = ?`,
      [cancelledReason || null, req.user.userId, appointmentId]
    );
    
    // Get updated appointment
    const [appointments] = await connection.query(
      'SELECT * FROM appointments WHERE appointment_id = ?',
      [appointmentId]
    );
    
    const appointment = appointments[0];
    
    logger.info('Appointment cancelled', { 
      userId: req.user.userId,
      appointmentId,
      reason: cancelledReason
    });
    
    res.json({
      success: true,
      data: appointment,
      message: 'Appointment cancelled successfully'
    });
    
  } catch (error) {
    logger.error('Cancel appointment error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while cancelling appointment'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  generateAppointmentCode
};
