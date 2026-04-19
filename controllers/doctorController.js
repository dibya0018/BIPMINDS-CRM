/**
 * Doctor Controller
 * 
 * Handles doctor management operations including CRUD, availability checking,
 * and filtering. Implements audit logging and user relationship management.
 * 
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8
 */

const { getPool } = require('../config/database');
const { setAuditOldValues } = require('../middleware/audit');
const { hashPassword } = require('../utils/password');
const logger = require('../config/logger');

/**
 * Generate unique doctor code
 * Format: D-XXXXXX (D- followed by 6 random digits)
 * 
 * @returns {string} Unique doctor code
 * 
 * Requirements: 15.1
 */
function generateDoctorCode() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `D-${randomNum}`;
}

/**
 * Get doctors with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - specialization: string (filter by specialization)
 * - isAvailable: boolean (filter by availability)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 15.7, 15.8
 */
async function getDoctors(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const specialization = req.query.specialization;
    const isAvailable = req.query.isAvailable;
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build filter query
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (specialization) {
      whereClause += ' AND d.specialization LIKE ?';
      params.push(`%${specialization}%`);
    }
    
    if (isAvailable !== undefined) {
      whereClause += ' AND d.is_available = ?';
      params.push(isAvailable === 'true' || isAvailable === true ? 1 : 0);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM doctors d ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results with user information
    const query = `
      SELECT 
        d.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        COALESCE(d.gender, u.gender) as gender,
        u.profile_picture
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.user_id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [doctors] = await connection.query(query, params);
    
    logger.info('Doctors retrieved', { 
      userId: req.user ? req.user.userId : 'public',
      page,
      limit,
      filters: { specialization, isAvailable },
      count: doctors.length
    });
    
    res.json({
      success: true,
      data: doctors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get doctors error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching doctors'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get doctor by ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 15.3, 15.4
 */
async function getDoctorById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.id);
    
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
    
    // Get doctor with user information
    const query = `
      SELECT 
        d.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.gender as user_gender,
        u.profile_picture,
        u.user_type
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE d.doctor_id = ?
    `;
    
    const [doctors] = await connection.query(query, [doctorId]);
    
    if (doctors.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Doctor not found'
        }
      });
    }
    
    const doctor = doctors[0];
    
    logger.info('Doctor retrieved', { 
      userId: req.user.userId,
      doctorId
    });
    
    res.json({
      success: true,
      data: doctor
    });
    
  } catch (error) {
    logger.error('Get doctor by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching doctor'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create doctor
 * Generates doctor code and links to user account
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 15.1, 15.2
 */
async function createDoctor(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      userId,
      // User creation data (if creating new user)
      email,
      password,
      firstName,
      lastName,
      phone,
      gender,
      profilePicture,
      // Doctor data
      specialization,
      qualification,
      experienceYears,
      licenseNumber,
      consultationFee,
      department,
      location,
      languagesKnown,
      availableDays,
      availableTimeStart,
      availableTimeEnd,
      maxPatientsPerDay,
      displayInList,
      isAvailable,
      bio
    } = req.body;
    
    connection = await pool.getConnection();
    
    let actualUserId = userId;
    
    // If userId is provided, use it directly
    if (userId) {
      actualUserId = userId;
    } 
    // If user data is provided (email, firstName, lastName), find or create user
    else if (email && firstName && lastName) {
      // First, check if user with this email already exists
      const [existingUsers] = await connection.query(
        'SELECT user_id, first_name, last_name FROM users WHERE email = ? AND is_active = TRUE',
        [email]
      );
      
      if (existingUsers.length > 0) {
        // User exists, use existing userId
        actualUserId = existingUsers[0].user_id;
        
        logger.info('Using existing user for doctor', { 
          userId: actualUserId,
          email,
          existingName: `${existingUsers[0].first_name} ${existingUsers[0].last_name}`
        });
      } else {
        // User doesn't exist, create new user
        // Use default password if not provided
        const defaultPassword = password || 'Doctor@123';
        const passwordHash = await hashPassword(defaultPassword);
        
        // Create user account
        const [userResult] = await connection.execute(
          `INSERT INTO users (
            email, password_hash, first_name, last_name, phone, gender, user_type, profile_picture, is_active, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, 'doctor', ?, TRUE, ?)`,
          [
            email,
            passwordHash,
            firstName,
            lastName,
            phone || null,
            gender || null,
            profilePicture || null,
            req.user.userId
          ]
        );
        
        actualUserId = userResult.insertId;
        
        logger.info('User created for doctor', { 
          userId: actualUserId,
          email,
          createdBy: req.user.userId
        });
      }
    } else {
      // Neither userId nor user data provided
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Either userId or user creation data (email, firstName, lastName) is required'
        }
      });
    }
    
    // Check if user exists and is not already a doctor
    const [users] = await connection.query(
      'SELECT user_id, user_type FROM users WHERE user_id = ? AND is_active = TRUE',
      [actualUserId]
    );
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found or inactive'
        }
      });
    }
    
    // Check if user is already linked to a doctor
    const [existingDoctors] = await connection.query(
      'SELECT doctor_id FROM doctors WHERE user_id = ?',
      [actualUserId]
    );
    
    if (existingDoctors.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'User is already linked to a doctor profile'
        }
      });
    }
    
    // Generate unique doctor code
    let doctorCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      doctorCode = generateDoctorCode();
      
      // Check if code already exists
      const [existing] = await connection.query(
        'SELECT doctor_id FROM doctors WHERE doctor_code = ?',
        [doctorCode]
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
          message: 'Failed to generate unique doctor code'
        }
      });
    }
    
    // Use location as department if provided, otherwise use department
    const finalDepartment = location || department || null;
    
    // Create doctor record
    const [result] = await connection.execute(
      `INSERT INTO doctors (
        user_id,
        doctor_code,
        specialization,
        qualification,
        experience_years,
        license_number,
        consultation_fee,
        department,
        gender,
        available_days,
        available_time_start,
        available_time_end,
        max_patients_per_day,
        bio,
        languages_known,
        display_in_list,
        is_available,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        actualUserId,
        doctorCode,
        specialization,
        qualification,
        experienceYears || 0,
        licenseNumber,
        consultationFee || 0.00,
        finalDepartment,
        gender || null,
        availableDays ? JSON.stringify(availableDays) : null,
        availableTimeStart || null,
        availableTimeEnd || null,
        maxPatientsPerDay || 20,
        bio || null,
        languagesKnown ? JSON.stringify(languagesKnown) : null,
        displayInList !== undefined ? displayInList : true,
        isAvailable !== undefined ? isAvailable : true
      ]
    );
    
    const doctorId = result.insertId;
    
    // Insert schedules if provided
    const { schedules } = req.body;
    if (schedules && Array.isArray(schedules) && schedules.length > 0) {
      const scheduleValues = schedules.map(s => [
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
        [scheduleValues]
      );
      
      logger.info('Doctor schedules created', { 
        userId: req.user.userId,
        doctorId,
        scheduleCount: schedules.length
      });
    }
    
    // Get the created doctor with user information
    const [doctors] = await connection.query(
      `SELECT 
        d.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.gender as user_gender,
        u.profile_picture
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE d.doctor_id = ?`,
      [doctorId]
    );
    
    const doctor = doctors[0];
    
    logger.info('Doctor created', { 
      userId: req.user.userId,
      doctorId,
      doctorCode,
      linkedUserId: userId
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('doctors', 'create', { doctorId, doctorCode });
    }
    
    res.status(201).json({
      success: true,
      data: doctor,
      message: 'Doctor created successfully'
    });
    
  } catch (error) {
    logger.error('Create doctor error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Doctor with this license number already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating doctor'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update doctor
 * Updates doctor record and logs changes for audit
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 15.4
 */
async function updateDoctor(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.id);
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    const {
      specialization,
      qualification,
      experienceYears,
      licenseNumber,
      consultationFee,
      department,
      gender,
      availableDays,
      availableTimeStart,
      availableTimeEnd,
      maxPatientsPerDay,
      rating,
      totalPatients,
      bio,
      isAvailable
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldDoctors] = await connection.query(
      'SELECT * FROM doctors WHERE doctor_id = ?',
      [doctorId]
    );
    
    if (oldDoctors.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Doctor not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldDoctors[0]);
    
    // Update doctor
    await connection.execute(
      `UPDATE doctors SET
        specialization = ?,
        qualification = ?,
        experience_years = ?,
        license_number = ?,
        consultation_fee = ?,
        department = ?,
        gender = ?,
        available_days = ?,
        available_time_start = ?,
        available_time_end = ?,
        max_patients_per_day = ?,
        rating = ?,
        total_patients = ?,
        bio = ?,
        is_available = ?,
        updated_at = NOW()
      WHERE doctor_id = ?`,
      [
        specialization,
        qualification,
        experienceYears || 0,
        licenseNumber,
        consultationFee || 0.00,
        department || null,
        gender !== undefined ? gender : oldDoctors[0].gender,
        availableDays ? JSON.stringify(availableDays) : null,
        availableTimeStart || null,
        availableTimeEnd || null,
        maxPatientsPerDay || 20,
        rating !== undefined ? rating : oldDoctors[0].rating,
        totalPatients !== undefined ? totalPatients : oldDoctors[0].total_patients,
        bio || null,
        isAvailable !== undefined ? isAvailable : oldDoctors[0].is_available,
        doctorId
      ]
    );
    
    // Get updated doctor with user information
    const [doctors] = await connection.query(
      `SELECT 
        d.*,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.gender as user_gender,
        u.profile_picture
      FROM doctors d
      INNER JOIN users u ON d.user_id = u.user_id
      WHERE d.doctor_id = ?`,
      [doctorId]
    );
    
    const doctor = doctors[0];
    
    logger.info('Doctor updated', { 
      userId: req.user.userId,
      doctorId
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('doctors', 'update', { doctorId });
    }
    
    res.json({
      success: true,
      data: doctor,
      message: 'Doctor updated successfully'
    });
    
  } catch (error) {
    logger.error('Update doctor error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Doctor with this license number already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating doctor'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get doctor availability
 * Calculates available and booked time slots for a specific date
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 15.5, 15.6
 */
async function getDoctorAvailability(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const doctorId = parseInt(req.params.id);
    const date = req.query.date;
    
    if (!doctorId || doctorId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid doctor ID'
        }
      });
    }
    
    if (!date) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Date is required'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get doctor information
    const [doctors] = await connection.query(
      `SELECT 
        doctor_id,
        available_time_start,
        available_time_end,
        is_available
      FROM doctors 
      WHERE doctor_id = ?`,
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
    
    const doctor = doctors[0];
    
    if (!doctor.is_available) {
      return res.json({
        success: true,
        data: {
          doctorId,
          date,
          isAvailable: false,
          availableSlots: [],
          bookedSlots: []
        }
      });
    }
    
    // Get booked appointments for the date
    const [bookedAppointments] = await connection.query(
      `SELECT 
        appointment_time,
        duration_minutes
      FROM appointments
      WHERE doctor_id = ?
        AND appointment_date = ?
        AND status NOT IN ('cancelled', 'no-show')
      ORDER BY appointment_time`,
      [doctorId, date]
    );
    
    // Generate time slots based on doctor's availability
    const availableSlots = [];
    const bookedSlots = [];
    
    if (doctor.available_time_start && doctor.available_time_end) {
      const startTime = doctor.available_time_start;
      const endTime = doctor.available_time_end;
      const slotDuration = 30; // 30 minutes per slot
      
      // Parse start and end times
      const [startHour, startMinute] = startTime.split(':').map(Number);
      const [endHour, endMinute] = endTime.split(':').map(Number);
      
      let currentHour = startHour;
      let currentMinute = startMinute;
      
      // Generate all possible slots
      while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        const timeSlot = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;
        
        // Check if this slot is booked
        const isBooked = bookedAppointments.some(apt => apt.appointment_time === timeSlot);
        
        if (isBooked) {
          bookedSlots.push(timeSlot);
        } else {
          availableSlots.push(timeSlot);
        }
        
        // Move to next slot
        currentMinute += slotDuration;
        if (currentMinute >= 60) {
          currentHour += Math.floor(currentMinute / 60);
          currentMinute = currentMinute % 60;
        }
      }
    }
    
    logger.info('Doctor availability retrieved', { 
      userId: req.user.userId,
      doctorId,
      date,
      availableCount: availableSlots.length,
      bookedCount: bookedSlots.length
    });
    
    res.json({
      success: true,
      data: {
        doctorId,
        date,
        isAvailable: doctor.is_available,
        availableTimeStart: doctor.available_time_start,
        availableTimeEnd: doctor.available_time_end,
        availableSlots,
        bookedSlots,
        totalSlots: availableSlots.length + bookedSlots.length
      }
    });
    
  } catch (error) {
    logger.error('Get doctor availability error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching doctor availability'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  getDoctorAvailability,
  generateDoctorCode
};
