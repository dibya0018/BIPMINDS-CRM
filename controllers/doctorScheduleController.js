/**
 * Doctor Schedule Controller
 * 
 * Handles CRUD operations for doctor schedules.
 * Supports flexible scheduling with different times for different days.
 * 
 * Requirements: Flexible doctor scheduling system
 */

const { getPool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Get all schedules for a doctor
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * GET /api/doctors/:doctorId/schedules
 */
async function getDoctorSchedules(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.doctorId);
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get all active schedules for the doctor, ordered by day of week
    const [schedules] = await connection.query(
      `SELECT 
        schedule_id,
        doctor_id,
        day_of_week,
        start_time,
        end_time,
        is_active,
        notes,
        created_at,
        updated_at
       FROM doctor_schedules 
       WHERE doctor_id = ? AND is_active = TRUE
       ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')`,
      [doctorId]
    );
    
    logger.info('Doctor schedules retrieved', { 
      userId: req.user.userId,
      doctorId,
      count: schedules.length
    });
    
    res.json({
      success: true,
      data: schedules
    });
    
  } catch (error) {
    logger.error('Get doctor schedules error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch schedules'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create or update schedules for a doctor
 * Replaces existing schedules for the specified days
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * POST /api/doctors/:doctorId/schedules
 * Body: { schedules: [{ dayOfWeek, startTime, endTime, notes }] }
 */
async function upsertDoctorSchedules(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.doctorId);
    const { schedules } = req.body;
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Schedules array is required and must not be empty'
        }
      });
    }
    
    // Validate each schedule
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const schedule of schedules) {
      if (!schedule.dayOfWeek || !validDays.includes(schedule.dayOfWeek)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VAL_001',
            message: `Invalid day of week: ${schedule.dayOfWeek}`
          }
        });
      }
      
      if (!schedule.startTime || !schedule.endTime) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VAL_001',
            message: 'Start time and end time are required for each schedule'
          }
        });
      }
    }
    
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    // Verify doctor exists
    const [doctors] = await connection.query(
      'SELECT doctor_id FROM doctors WHERE doctor_id = ?',
      [doctorId]
    );
    
    if (doctors.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Doctor not found'
        }
      });
    }
    
    // Check for time overlaps with existing schedules
    for (const schedule of schedules) {
      const [existingSchedules] = await connection.query(
        `SELECT schedule_id, start_time, end_time 
         FROM doctor_schedules 
         WHERE doctor_id = ? 
         AND day_of_week = ? 
         AND is_active = TRUE
         AND (
           (start_time <= ? AND end_time > ?) OR
           (start_time < ? AND end_time >= ?) OR
           (start_time >= ? AND end_time <= ?)
         )`,
        [
          doctorId,
          schedule.dayOfWeek,
          schedule.startTime, schedule.startTime,
          schedule.endTime, schedule.endTime,
          schedule.startTime, schedule.endTime
        ]
      );
      
      if (existingSchedules.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: {
            code: 'VAL_OVERLAP',
            message: `Schedule overlaps with existing schedule on ${schedule.dayOfWeek}`,
            details: {
              day: schedule.dayOfWeek,
              newSchedule: `${schedule.startTime} - ${schedule.endTime}`,
              existingSchedule: `${existingSchedules[0].start_time} - ${existingSchedules[0].end_time}`
            }
          }
        });
      }
    }
    
    // Insert new schedules (don't delete existing ones)
    const values = schedules.map(s => [
      doctorId,
      s.dayOfWeek,
      s.startTime,
      s.endTime,
      s.notes || null,
      true // is_active
    ]);
    
    await connection.query(
      `INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, notes, is_active)
       VALUES ?`,
      [values]
    );
    
    await connection.commit();
    
    // Fetch updated schedules
    const [updatedSchedules] = await connection.query(
      `SELECT * FROM doctor_schedules 
       WHERE doctor_id = ? AND is_active = TRUE
       ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')`,
      [doctorId]
    );
    
    logger.info('Doctor schedules updated', { 
      userId: req.user.userId,
      doctorId,
      count: updatedSchedules.length
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('doctors', 'update', { doctorId });
    }
    
    res.json({
      success: true,
      data: updatedSchedules,
      message: 'Schedules updated successfully'
    });
    
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('Upsert doctor schedules error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update schedules'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Delete a specific schedule
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * DELETE /api/doctors/:doctorId/schedules/:scheduleId
 */
async function deleteDoctorSchedule(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.doctorId);
    const scheduleId = parseInt(req.params.scheduleId);
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    if (!scheduleId || scheduleId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid schedule ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if schedule exists
    const [schedules] = await connection.query(
      'SELECT schedule_id FROM doctor_schedules WHERE schedule_id = ? AND doctor_id = ?',
      [scheduleId, doctorId]
    );
    
    if (schedules.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Schedule not found'
        }
      });
    }
    
    // Delete the schedule
    await connection.query(
      `DELETE FROM doctor_schedules WHERE schedule_id = ? AND doctor_id = ?`,
      [scheduleId, doctorId]
    );
    
    logger.info('Doctor schedule deleted', { 
      userId: req.user.userId,
      doctorId,
      scheduleId
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('doctors', 'update', { doctorId });
    }
    
    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete doctor schedule error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete schedule'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Delete all schedules for a specific day
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * DELETE /api/doctors/:doctorId/schedules/day/:dayOfWeek
 */
async function deleteDoctorScheduleByDay(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.doctorId);
    const dayOfWeek = req.params.dayOfWeek;
    
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    if (!validDays.includes(dayOfWeek)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid day of week'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Delete schedules for the specified day
    const [result] = await connection.query(
      `DELETE FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?`,
      [doctorId, dayOfWeek]
    );
    
    logger.info('Doctor schedule deleted by day', { 
      userId: req.user.userId,
      doctorId,
      dayOfWeek,
      deletedCount: result.affectedRows
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('doctors', 'update', { doctorId });
    }
    
    res.json({
      success: true,
      message: `Schedule for ${dayOfWeek} deleted successfully`,
      deletedCount: result.affectedRows
    });
    
  } catch (error) {
    logger.error('Delete doctor schedule by day error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to delete schedule'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getDoctorSchedules,
  upsertDoctorSchedules,
  deleteDoctorSchedule,
  deleteDoctorScheduleByDay
};
