/**
 * Lead Controller
 * 
 * Handles lead management operations including CRUD and lead conversion to patient.
 * Implements filtering, search, and audit logging.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8
 */

const { getPool } = require('../config/database');
const { setAuditOldValues } = require('../middleware/audit');
const logger = require('../config/logger');

/**
 * Generate unique lead code
 * Format: L-XXXXXX (L- followed by 6 random digits)
 * 
 * @returns {string} Unique lead code
 * 
 * Requirements: 10.1
 */
function generateLeadCode() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `L-${randomNum}`;
}

/**
 * Get leads with filtering
 * 
 * Query parameters:
 * - page: number (default: 1)
 * - limit: number (default: 10)
 * - status: string (filter by status)
 * - priority: string (filter by priority)
 * - source: string (filter by source)
 * - search: string (searches name, phone, email)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 10.8
 */
async function getLeads(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const priority = req.query.priority || '';
    const source = req.query.source || '';
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build filter query
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      whereClause += ` AND (
        l.first_name LIKE ? OR 
        l.last_name LIKE ? OR 
        l.phone LIKE ? OR 
        l.email LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    if (status) {
      whereClause += ' AND l.status = ?';
      params.push(status);
    }
    
    if (priority) {
      whereClause += ' AND l.priority = ?';
      params.push(priority);
    }
    
    if (source) {
      whereClause += ' AND l.source = ?';
      params.push(source);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM leads l ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results
    const query = `
      SELECT 
        l.*,
        u.first_name as assigned_to_first_name,
        u.last_name as assigned_to_last_name,
        p.patient_code as converted_patient_code
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.user_id
      LEFT JOIN patients p ON l.converted_to_patient_id = p.patient_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [leads] = await connection.query(query, params);
    
    logger.info('Leads retrieved', { 
      userId: req.user.userId,
      page,
      limit,
      search,
      status,
      priority,
      source,
      count: leads.length
    });
    
    res.json({
      success: true,
      data: leads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get leads error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching leads'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get lead by ID
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 10.2
 */
async function getLeadById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const leadId = parseInt(req.params.id);
    
    if (!leadId || leadId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid lead ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get lead details with related information
    const [leads] = await connection.query(
      `SELECT 
        l.*,
        u.first_name as assigned_to_first_name,
        u.last_name as assigned_to_last_name,
        u.email as assigned_to_email,
        p.patient_code as converted_patient_code,
        p.first_name as converted_patient_first_name,
        p.last_name as converted_patient_last_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.user_id
      LEFT JOIN patients p ON l.converted_to_patient_id = p.patient_id
      WHERE l.lead_id = ?`,
      [leadId]
    );
    
    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Lead not found'
        }
      });
    }
    
    const lead = leads[0];
    
    logger.info('Lead retrieved', { 
      userId: req.user.userId,
      leadId
    });
    
    res.json({
      success: true,
      data: lead
    });
    
  } catch (error) {
    logger.error('Get lead by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching lead'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Create lead
 * Generates lead code and creates lead record
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
async function createLead(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      source,
      status,
      priority,
      interestedIn,
      notes,
      followUpDate,
      // UTM parameters
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      gclid,
      fbclid
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Generate unique lead code
    let leadCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      leadCode = generateLeadCode();
      
      // Check if code already exists
      const [existing] = await connection.query(
        'SELECT lead_id FROM leads WHERE lead_code = ?',
        [leadCode]
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
          message: 'Failed to generate unique lead code'
        }
      });
    }
    
    // Source Mapping Logic: Auto-map utm_source to source field if it matches ENUM values
    let finalSource = source;
    const validSources = ['website', 'facebook', 'google', 'instagram', 'referral', 'walk-in', 'other'];
    
    if (utmSource) {
      const utmSourceLower = utmSource.toLowerCase().trim();
      // Check if utm_source matches any valid source value
      const matchedSource = validSources.find(s => s.toLowerCase() === utmSourceLower);
      if (matchedSource) {
        finalSource = matchedSource;
        logger.info('Auto-mapped utm_source to source field', { 
          utmSource, 
          mappedSource: matchedSource 
        });
      }
    }
    
    // Create lead with UTM tracking
    const [result] = await connection.execute(
      `INSERT INTO leads (
        lead_code,
        first_name,
        last_name,
        phone,
        email,
        source,
        status,
        priority,
        interested_in,
        notes,
        follow_up_date,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        gclid,
        fbclid,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        leadCode,
        firstName,
        lastName || null,
        phone,
        email || null,
        finalSource,
        status || 'new',
        priority || 'medium',
        interestedIn || null,
        notes || null,
        followUpDate || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null,
        utmTerm || null,
        utmContent || null,
        gclid || null,
        fbclid || null
      ]
    );
    
    const leadId = result.insertId;
    
    // Get the created lead
    const [leads] = await connection.query(
      'SELECT * FROM leads WHERE lead_id = ?',
      [leadId]
    );
    
    const lead = leads[0];
    
    logger.info('Lead created with UTM tracking', { 
      userId: req.user.userId,
      leadId,
      leadCode,
      source: finalSource,
      utmSource: utmSource || 'none',
      utmCampaign: utmCampaign || 'none'
    });
    
    res.status(201).json({
      success: true,
      data: lead,
      message: 'Lead created successfully'
    });
    
  } catch (error) {
    logger.error('Create lead error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Lead with this phone or email already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating lead'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update lead
 * Updates lead record and logs changes for audit
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 10.4
 */
async function updateLead(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const leadId = parseInt(req.params.id);
    
    if (!leadId || leadId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid lead ID'
        }
      });
    }
    
    const {
      firstName,
      lastName,
      phone,
      email,
      source,
      status,
      priority,
      interestedIn,
      notes,
      followUpDate
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldLeads] = await connection.query(
      'SELECT * FROM leads WHERE lead_id = ?',
      [leadId]
    );
    
    if (oldLeads.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Lead not found'
        }
      });
    }
    
    // Set old values for audit logging
    setAuditOldValues(req, oldLeads[0]);
    
    // Update lead
    await connection.execute(
      `UPDATE leads SET
        first_name = ?,
        last_name = ?,
        phone = ?,
        email = ?,
        source = ?,
        status = ?,
        priority = ?,
        interested_in = ?,
        notes = ?,
        follow_up_date = ?,
        updated_at = NOW()
      WHERE lead_id = ?`,
      [
        firstName,
        lastName || null,
        phone,
        email || null,
        source,
        status || 'new',
        priority || 'medium',
        interestedIn || null,
        notes || null,
        followUpDate || null,
        leadId
      ]
    );
    
    // Get updated lead
    const [leads] = await connection.query(
      'SELECT * FROM leads WHERE lead_id = ?',
      [leadId]
    );
    
    const lead = leads[0];
    
    logger.info('Lead updated', { 
      userId: req.user.userId,
      leadId
    });
    
    res.json({
      success: true,
      data: lead,
      message: 'Lead updated successfully'
    });
    
  } catch (error) {
    logger.error('Update lead error', { error: error.message, stack: error.stack });
    
    // Check for duplicate errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Lead with this phone or email already exists'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating lead'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Convert lead to patient
 * Creates a patient record from lead data, links them, and records conversion timestamp
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * 
 * Requirements: 10.5, 10.6, 10.7
 */
async function convertLeadToPatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const leadId = parseInt(req.params.id);
    
    if (!leadId || leadId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid lead ID'
        }
      });
    }
    
    const {
      dateOfBirth,
      gender,
      bloodGroup,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelation
    } = req.body;
    
    // Validate required fields for patient creation
    if (!dateOfBirth || !gender || !bloodGroup) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Date of birth, gender, and blood group are required for patient conversion'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    try {
      // Get lead details
      const [leads] = await connection.query(
        'SELECT * FROM leads WHERE lead_id = ?',
        [leadId]
      );
      
      if (leads.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Lead not found'
          }
        });
      }
      
      const lead = leads[0];
      
      // Check if lead is already converted
      if (lead.status === 'converted' || lead.converted_to_patient_id) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Lead has already been converted to a patient'
          }
        });
      }
      
      // Generate unique patient code
      let patientCode;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;
      
      while (!isUnique && attempts < maxAttempts) {
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        patientCode = `P-${randomNum}`;
        
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
        await connection.rollback();
        return res.status(500).json({
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'Failed to generate unique patient code'
          }
        });
      }
      
      // Create patient from lead data
      const [patientResult] = await connection.execute(
        `INSERT INTO patients (
          patient_code,
          first_name,
          last_name,
          date_of_birth,
          gender,
          blood_group,
          phone,
          email,
          address,
          city,
          state,
          zip_code,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact_relation,
          is_active,
          created_at,
          updated_at,
          created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW(), ?)`,
        [
          patientCode,
          lead.first_name,
          lead.last_name || '',
          dateOfBirth,
          gender,
          bloodGroup,
          lead.phone,
          lead.email || null,
          address || null,
          city || null,
          state || null,
          zipCode || null,
          emergencyContactName || null,
          emergencyContactPhone || null,
          emergencyContactRelation || null,
          req.user.userId
        ]
      );
      
      const patientId = patientResult.insertId;
      
      // Update lead with conversion information
      await connection.execute(
        `UPDATE leads SET
          status = 'converted',
          converted_to_patient_id = ?,
          converted_at = NOW(),
          updated_at = NOW()
        WHERE lead_id = ?`,
        [patientId, leadId]
      );
      
      // Commit transaction
      await connection.commit();
      
      // Get the created patient
      const [patients] = await connection.query(
        'SELECT * FROM patients WHERE patient_id = ?',
        [patientId]
      );
      
      const patient = patients[0];
      
      // Get updated lead
      const [updatedLeads] = await connection.query(
        'SELECT * FROM leads WHERE lead_id = ?',
        [leadId]
      );
      
      const updatedLead = updatedLeads[0];
      
      logger.info('Lead converted to patient', { 
        userId: req.user.userId,
        leadId,
        patientId,
        patientCode
      });
      
      res.status(201).json({
        success: true,
        data: {
          patient,
          lead: updatedLead
        },
        message: 'Lead converted to patient successfully'
      });
      
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    logger.error('Convert lead to patient error', { error: error.message, stack: error.stack });
    
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
        message: 'An error occurred while converting lead to patient'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  convertLeadToPatient,
  generateLeadCode
};
