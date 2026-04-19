/**
 * Patient Controller
 * 
 * Handles patient management operations including CRUD, QR code generation,
 * and QR code scanning. Implements pagination, search, and audit logging.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.5, 7.7, 7.8, 7.10
 */

const { getPool } = require('../config/database');
const { generateQRData, decryptQRData, generateQRImage } = require('../utils/qrCode');
const { setAuditOldValues } = require('../middleware/audit');
const logger = require('../config/logger');

/**
 * Generate unique patient code
 * Format: P-XXXXXX (P- followed by 6 random digits)
 * 
 * @returns {string} Unique patient code
 * 
 * Requirements: 6.1
 */
function generatePatientCode() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `P-${randomNum}`;
}

/**
 * Get patients with pagination and search
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - search: string (searches name, code, phone, email)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 6.4, 6.5, 6.8
 */
async function getPatients(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build search query
    let whereClause = 'WHERE p.is_active = TRUE';
    const params = [];
    
    if (search) {
      whereClause += ` AND (
        p.first_name LIKE ? OR 
        p.last_name LIKE ? OR 
        p.patient_code LIKE ? OR 
        p.phone LIKE ? OR 
        p.email LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM patients p ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results with appointment count and last visit
    const query = `
      SELECT 
        p.*,
        COUNT(DISTINCT a.appointment_id) as appointment_count,
        MAX(a.appointment_date) as last_visit_date
      FROM patients p
      LEFT JOIN appointments a ON p.patient_id = a.patient_id 
        AND a.status IN ('completed', 'confirmed')
      ${whereClause}
      GROUP BY p.patient_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [patients] = await connection.query(query, params);
    
    // For each patient, fetch full tag details
    const patientsWithTags = await Promise.all(patients.map(async (patient) => {
      // Parse tags if it's a string (from JSON column)
      let tagsArray = patient.tags;
      if (typeof tagsArray === 'string') {
        try {
          tagsArray = JSON.parse(tagsArray);
        } catch (e) {
          tagsArray = [];
        }
      }
      
      if (tagsArray && Array.isArray(tagsArray) && tagsArray.length > 0) {
        try {
          // Get tag IDs from the JSON array
          const tagIds = tagsArray.map(t => parseInt(t));
          
          // Fetch full tag details
          const [tags] = await connection.query(
            `SELECT tag_id, tag_name, tag_color, description, usage_count 
             FROM tags WHERE tag_id IN (?)`,
            [tagIds]
          );
          
          return { ...patient, tags: tags || [] };
        } catch (error) {
          logger.error(`Failed to fetch tags for patient ${patient.patient_id}:`, error);
          return { ...patient, tags: [] };
        }
      }
      return { ...patient, tags: [] };
    }));
    
    logger.info('Patients retrieved', { 
      userId: req.user.userId,
      page,
      limit,
      search,
      count: patientsWithTags.length
    });
    
    res.json({
      success: true,
      data: patientsWithTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get patients error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching patients'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get patient by ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 6.8
 */
async function getPatientById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.id);
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid patient ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Call stored procedure to get patient details
    await connection.query('CALL sp_get_patient_by_id(?)', [patientId]);
    
    // Get result from stored procedure
    const [results] = await connection.query('SELECT * FROM patients WHERE patient_id = ?', [patientId]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found'
        }
      });
    }
    
    // Get appointment count and last visit
    const [stats] = await connection.query(
      `SELECT 
        COUNT(DISTINCT a.appointment_id) as appointment_count,
        MAX(a.appointment_date) as last_visit_date
      FROM appointments a
      WHERE a.patient_id = ? AND a.status IN ('completed', 'confirmed')`,
      [patientId]
    );
    
    const patient = {
      ...results[0],
      appointment_count: stats[0].appointment_count || 0,
      last_visit_date: stats[0].last_visit_date || null
    };
    
    logger.info('Patient retrieved', { 
      userId: req.user.userId,
      patientId
    });
    
    res.json({
      success: true,
      data: patient
    });
    
  } catch (error) {
    logger.error('Get patient by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching patient'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create patient
 * Generates patient code, creates patient record, and generates QR code
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 6.1, 6.2, 6.3
 */
async function createPatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      phone,
      email,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      medicalHistory,
      allergies,
      currentMedications,
      insuranceProvider,
      insuranceNumber,
      profilePicture
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Generate unique patient code
    let patientCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      patientCode = generatePatientCode();
      
      // Check if code already exists
      const [existing] = await connection.query(
        'SELECT patient_id FROM patients WHERE patient_code = ?',
        [patientCode]
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
          message: 'Failed to generate unique patient code'
        }
      });
    }
    
    // Call stored procedure to create patient
    // Note: If stored procedure fails, it might be because it hasn't been updated with profile_picture parameter
    // Run: backend/database/migrations/update_stored_procedure_profile_picture.sql
    let patientId;
    let useStoredProcedure = true;
    
    try {
      await connection.query(
        `CALL sp_create_patient(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, @patient_id)`,
        [
          patientCode,
          firstName,
          lastName,
          dateOfBirth,
          gender,
          bloodGroup,
          phone,
          email || null,
          address || null,
          city || null,
          state || null,
          zipCode || null,
          emergencyContactName || null,
          emergencyContactPhone || null,
          emergencyContactRelation || null,
          medicalHistory || null,
          allergies || null,
          currentMedications || null,
          insuranceProvider || null,
          insuranceNumber || null,
          profilePicture || null,
          req.user.userId
        ]
      );
      
      // Get the patient ID from stored procedure output parameter
      const [result] = await connection.query('SELECT @patient_id as patient_id');
      patientId = result[0]?.patient_id;
    } catch (spError) {
      // If stored procedure fails (likely because it hasn't been updated), use direct INSERT as fallback
      logger.warn('Stored procedure failed, using direct INSERT fallback', { 
        error: spError.message,
        code: spError.code,
        sqlMessage: spError.sqlMessage,
        sqlState: spError.sqlState
      });
      
      useStoredProcedure = false;
      
      try {
        // Direct INSERT with profile_picture
        // Limit profile_picture to reasonable size (if it's too long, truncate or skip it)
        let profilePicValue = profilePicture || null;
        if (profilePicValue && profilePicValue.length > 1000000) { // ~1MB limit for safety
          logger.warn('Profile picture too large, truncating', { 
            originalLength: profilePicValue.length 
          });
          profilePicValue = profilePicValue.substring(0, 1000000);
        }
        
        await connection.execute(
          `INSERT INTO patients (
            patient_code, first_name, last_name, date_of_birth, gender, blood_group,
            phone, email, address, city, state, zip_code,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
            medical_history, allergies, current_medications,
            insurance_provider, insurance_number, profile_picture, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            patientCode,
            firstName,
            lastName,
            dateOfBirth,
            gender,
            bloodGroup,
            phone,
            email || null,
            address || null,
            city || null,
            state || null,
            zipCode || null,
            emergencyContactName || null,
            emergencyContactPhone || null,
            emergencyContactRelation || null,
            medicalHistory || null,
            allergies || null,
            currentMedications || null,
            insuranceProvider || null,
            insuranceNumber || null,
            profilePicValue,
            req.user.userId
          ]
        );
        
        // Get last insert ID
        const [result] = await connection.query('SELECT LAST_INSERT_ID() as patient_id');
        patientId = result[0]?.patient_id;
      } catch (insertError) {
        // If direct INSERT also fails, log the error and re-throw
        logger.error('Direct INSERT also failed', {
          error: insertError.message,
          code: insertError.code,
          sqlMessage: insertError.sqlMessage,
          sqlState: insertError.sqlState,
          stack: insertError.stack
        });
        throw insertError; // Re-throw to be caught by outer catch
      }
    }
    
    if (!patientId) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create patient - patient ID not returned'
        }
      });
    }
    
    // Generate QR code data
    const qrData = generateQRData(patientId, patientCode);
    const qrImageUrl = await generateQRImage(qrData);
    
    // Store QR code in database
    await connection.execute(
      `INSERT INTO qr_codes (patient_id, qr_code_data, qr_code_image_url, generated_at, is_active) 
       VALUES (?, ?, ?, NOW(), TRUE)`,
      [patientId, qrData, qrImageUrl]
    );
    
    // Get the created patient
    const [patients] = await connection.query(
      'SELECT * FROM patients WHERE patient_id = ?',
      [patientId]
    );
    
    const patient = patients[0];
    
    logger.info('Patient created', { 
      userId: req.user.userId,
      patientId,
      patientCode
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('patients', 'create', { patientId, patientCode });
    }
    
    res.status(201).json({
      success: true,
      data: {
        ...patient,
        qr_code_data: qrData,
        qr_code_image_url: qrImageUrl
      },
      message: 'Patient created successfully'
    });
    
  } catch (error) {
    logger.error('Create patient error', { 
      error: error.message, 
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      errno: error.errno
    });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Patient with this phone or email already exists'
        }
      });
    }
    
    // Check for stored procedure parameter mismatch
    if (error.code === 'ER_WRONG_PARAMCOUNT_TO_PROCEDURE' || error.sqlMessage?.includes('parameter')) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Database stored procedure error. Please ensure the database migration has been run.',
          details: error.sqlMessage || error.message
        }
      });
    }
    
    // Check for column not found errors
    if (error.code === 'ER_BAD_FIELD_ERROR' || error.sqlMessage?.includes('Unknown column')) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Database schema error. Please run the migration to add profile_picture column.',
          details: process.env.NODE_ENV === 'development' ? error.sqlMessage : undefined
        }
      });
    }
    
    // Return detailed error in development
    const errorResponse = {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating patient'
      }
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error.details = error.sqlMessage || error.message;
      errorResponse.error.code = error.code;
    }
    
    res.status(500).json(errorResponse);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update patient
 * Updates patient record and logs changes for audit
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 6.6
 */
async function updatePatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.id);
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid patient ID'
        }
      });
    }
    
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      phone,
      email,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation,
      medicalHistory,
      allergies,
      currentMedications,
      insuranceProvider,
      insuranceNumber,
      profilePicture
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldPatients] = await connection.query(
      'SELECT * FROM patients WHERE patient_id = ?',
      [patientId]
    );
    
    if (oldPatients.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldPatients[0]);
    
    // Update patient
    await connection.execute(
      `UPDATE patients SET
        first_name = ?,
        last_name = ?,
        date_of_birth = ?,
        gender = ?,
        blood_group = ?,
        phone = ?,
        email = ?,
        address = ?,
        city = ?,
        state = ?,
        zip_code = ?,
        emergency_contact_name = ?,
        emergency_contact_phone = ?,
        emergency_contact_relation = ?,
        medical_history = ?,
        allergies = ?,
        current_medications = ?,
        insurance_provider = ?,
        insurance_number = ?,
        profile_picture = ?,
        updated_at = NOW()
      WHERE patient_id = ?`,
      [
        firstName,
        lastName,
        dateOfBirth,
        gender,
        bloodGroup,
        phone,
        email || null,
        address || null,
        city || null,
        state || null,
        zipCode || null,
        emergencyContactName || null,
        emergencyContactPhone || null,
        emergencyContactRelation || null,
        medicalHistory || null,
        allergies || null,
        currentMedications || null,
        insuranceProvider || null,
        insuranceNumber || null,
        profilePicture || null,
        patientId
      ]
    );
    
    // Get updated patient
    const [patients] = await connection.query(
      'SELECT * FROM patients WHERE patient_id = ?',
      [patientId]
    );
    
    const patient = patients[0];
    
    logger.info('Patient updated', { 
      userId: req.user.userId,
      patientId
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('patients', 'update', { patientId });
    }
    
    res.json({
      success: true,
      data: patient,
      message: 'Patient updated successfully'
    });
    
  } catch (error) {
    logger.error('Update patient error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Patient with this phone or email already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating patient'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Delete patient (soft delete)
 * Sets is_active to false instead of deleting the record
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 6.7
 */
async function deletePatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.id);
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid patient ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if patient exists
    const [patients] = await connection.query(
      'SELECT patient_id FROM patients WHERE patient_id = ?',
      [patientId]
    );
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found'
        }
      });
    }
    
    // Soft delete - set is_active to false
    await connection.execute(
      'UPDATE patients SET is_active = FALSE, updated_at = NOW() WHERE patient_id = ?',
      [patientId]
    );
    
    logger.info('Patient deleted (soft)', { 
      userId: req.user.userId,
      patientId
    });
    
    res.json({
      success: true,
      message: 'Patient deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete patient error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting patient'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get patient QR code
 * Returns QR code image for a patient
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 7.3, 7.4
 */
async function getPatientQRCode(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.id);
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid patient ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get QR code from database
    const [qrCodes] = await connection.query(
      'SELECT * FROM qr_codes WHERE patient_id = ? AND is_active = TRUE',
      [patientId]
    );
    
    if (qrCodes.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'QR code not found for this patient'
        }
      });
    }
    
    const qrCode = qrCodes[0];
    
    logger.info('QR code retrieved', { 
      userId: req.user.userId,
      patientId
    });
    
    res.json({
      success: true,
      data: {
        qr_code_id: qrCode.qr_code_id,
        patient_id: qrCode.patient_id,
        qr_code_data: qrCode.qr_code_data,
        qr_code_image_url: qrCode.qr_code_image_url,
        generated_at: qrCode.generated_at,
        scan_count: qrCode.scan_count,
        last_scanned_at: qrCode.last_scanned_at
      }
    });
    
  } catch (error) {
    logger.error('Get QR code error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching QR code'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Scan QR code
 * Decrypts QR code, increments scan counter, and returns patient data
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 7.5, 7.7, 7.8, 7.10
 */
async function scanQRCode(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { qrData } = req.body;
    
    if (!qrData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'QR data is required'
        }
      });
    }
    
    // Decrypt QR code data
    let decryptedData;
    try {
      decryptedData = decryptQRData(qrData);
    } catch (error) {
      logger.warn('Invalid QR code scanned', { 
        userId: req.user.userId,
        error: error.message
      });
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid QR code data'
        }
      });
    }
    
    const { patientId, patientCode } = decryptedData;
    
    connection = await pool.getConnection();
    
    // Check if QR code is active
    const [qrCodes] = await connection.query(
      'SELECT * FROM qr_codes WHERE patient_id = ? AND is_active = TRUE',
      [patientId]
    );
    
    if (qrCodes.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'QR code is inactive or not found'
        }
      });
    }
    
    // Call stored procedure to get patient and update scan count
    await connection.query('CALL sp_get_patient_by_qr(?)', [patientId]);
    
    // Get patient details with updated scan count
    const [patients] = await connection.query(
      `SELECT 
        p.*,
        COUNT(DISTINCT a.appointment_id) as appointment_count,
        MAX(a.appointment_date) as last_visit_date,
        qr.scan_count,
        qr.last_scanned_at
      FROM patients p
      LEFT JOIN appointments a ON p.patient_id = a.patient_id 
        AND a.status IN ('completed', 'confirmed')
      LEFT JOIN qr_codes qr ON p.patient_id = qr.patient_id
      WHERE p.patient_id = ?
      GROUP BY p.patient_id`,
      [patientId]
    );
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found'
        }
      });
    }
    
    const patient = patients[0];
    
    logger.info('QR code scanned', { 
      userId: req.user.userId,
      patientId,
      scanCount: patient.scan_count
    });
    
    res.json({
      success: true,
      data: patient,
      message: 'QR code scanned successfully'
    });
    
  } catch (error) {
    logger.error('Scan QR code error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while scanning QR code'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update patient visit status
 * Updates only the visit_status field for quick status changes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function updatePatientStatus(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.id);
    const { visitStatus } = req.body;
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid patient ID'
        }
      });
    }
    
    // Validate visit status
    const validStatuses = ['arrived', 'waiting', 'in-room', 'completed'];
    if (!visitStatus || !validStatuses.includes(visitStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid visit status. Must be one of: arrived, waiting, in-room, completed'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if patient exists
    const [patients] = await connection.query(
      'SELECT patient_id FROM patients WHERE patient_id = ? AND is_active = TRUE',
      [patientId]
    );
    
    if (patients.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Patient not found'
        }
      });
    }
    
    // Update visit status
    await connection.execute(
      'UPDATE patients SET visit_status = ?, updated_at = NOW() WHERE patient_id = ?',
      [visitStatus, patientId]
    );
    
    logger.info('Patient visit status updated', { 
      userId: req.user.userId,
      patientId,
      visitStatus
    });
    
    // Notify WebSocket clients about the change
    if (global.wsServer) {
      global.wsServer.notifyDataChange('patients', 'update', { patientId, visitStatus });
    }
    
    res.json({
      success: true,
      data: { patientId, visitStatus },
      message: 'Patient visit status updated successfully'
    });
    
  } catch (error) {
    logger.error('Update patient status error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating patient status'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  getPatientQRCode,
  scanQRCode,
  generatePatientCode,
  updatePatientStatus
};
