/**
 * Tag Controller
 * 
 * Handles tag management operations for the independent tagging system.
 * Tags can be assigned to any entity (patients, doctors, appointments, etc.)
 */

const { getPool } = require('../config/database');
const logger = require('../config/logger');

/**
 * Get all tags with pagination and search
 */
async function getAllTags(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build search query
    let whereClause = '';
    const params = [];
    
    if (search) {
      whereClause = 'WHERE tag_name LIKE ?';
      params.push(`%${search}%`);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM tags ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results
    const query = `
      SELECT * FROM tags
      ${whereClause}
      ORDER BY usage_count DESC, tag_name ASC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [tags] = await connection.query(query, params);
    
    res.json({
      success: true,
      data: tags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get tags error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch tags' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Search tags for autocomplete (Elasticsearch-ready)
 */
async function searchTags(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const search = req.query.q || req.query.search || '';
    const limit = parseInt(req.query.limit) || 10;
    
    connection = await pool.getConnection();
    
    // Call stored procedure for tag search
    const [tags] = await connection.query(
      'CALL sp_SearchTags(?, ?)',
      [search, limit]
    );
    
    // Return first result set from stored procedure
    const results = tags[0] || [];
    
    res.json({
      success: true,
      data: results
    });
    
  } catch (error) {
    logger.error('Search tags error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to search tags' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Create new tag
 */
async function createTag(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { tagName, tagColor, description } = req.body;
    
    if (!tagName || tagName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Tag name is required' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if tag already exists
    const [existing] = await connection.query(
      'SELECT tag_id FROM tags WHERE tag_name = ?',
      [tagName.trim()]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'Tag already exists' },
        data: existing[0]
      });
    }
    
    // Create tag
    await connection.execute(
      `INSERT INTO tags (tag_name, tag_color, description, created_by) 
       VALUES (?, ?, ?, ?)`,
      [tagName.trim(), tagColor || '#80399a', description || null, req.user.userId]
    );
    
    const [result] = await connection.query('SELECT LAST_INSERT_ID() as tag_id');
    const tagId = result[0].tag_id;
    
    // Get created tag
    const [tags] = await connection.query(
      'SELECT * FROM tags WHERE tag_id = ?',
      [tagId]
    );
    
    logger.info('Tag created', { userId: req.user.userId, tagId, tagName });
    
    res.status(201).json({
      success: true,
      data: tags[0],
      message: 'Tag created successfully'
    });
    
  } catch (error) {
    logger.error('Create tag error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create tag' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Update tag
 */
async function updateTag(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const tagId = parseInt(req.params.id);
    const { tagName, tagColor, description } = req.body;
    
    if (!tagId || tagId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid tag ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if tag exists
    const [existing] = await connection.query(
      'SELECT tag_id FROM tags WHERE tag_id = ?',
      [tagId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tag not found' }
      });
    }
    
    // Update tag
    await connection.execute(
      `UPDATE tags SET 
        tag_name = COALESCE(?, tag_name),
        tag_color = COALESCE(?, tag_color),
        description = COALESCE(?, description),
        updated_at = NOW()
       WHERE tag_id = ?`,
      [tagName?.trim(), tagColor, description, tagId]
    );
    
    // Get updated tag
    const [tags] = await connection.query(
      'SELECT * FROM tags WHERE tag_id = ?',
      [tagId]
    );
    
    logger.info('Tag updated', { userId: req.user.userId, tagId });
    
    res.json({
      success: true,
      data: tags[0],
      message: 'Tag updated successfully'
    });
    
  } catch (error) {
    logger.error('Update tag error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update tag' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Delete tag
 */
async function deleteTag(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const tagId = parseInt(req.params.id);
    
    if (!tagId || tagId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid tag ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if tag exists
    const [existing] = await connection.query(
      'SELECT tag_id, usage_count FROM tags WHERE tag_id = ?',
      [tagId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tag not found' }
      });
    }
    
    // Remove tag from all patients
    await connection.execute(
      `UPDATE patients 
       SET tags = JSON_REMOVE(
         tags,
         JSON_UNQUOTE(JSON_SEARCH(tags, 'one', ?))
       )
       WHERE JSON_CONTAINS(tags, ?, '$')`,
      [tagId.toString(), JSON.stringify(tagId)]
    );
    
    // Delete tag
    await connection.execute('DELETE FROM tags WHERE tag_id = ?', [tagId]);
    
    logger.info('Tag deleted', { userId: req.user.userId, tagId });
    
    res.json({
      success: true,
      message: 'Tag deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete tag error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to delete tag' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Assign tag to patient
 */
async function assignTagToPatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.patientId);
    const { tagName, tagColor, description } = req.body;
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid patient ID' }
      });
    }
    
    if (!tagName || tagName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Tag name is required' }
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
        error: { code: 'NOT_FOUND', message: 'Patient not found' }
      });
    }
    
    // Check if tag exists
    const [existingTags] = await connection.query(
      'SELECT tag_id FROM tags WHERE tag_name = ?',
      [tagName.trim()]
    );
    
    // If tag doesn't exist and description is provided, create it first
    if (existingTags.length === 0 && description) {
      await connection.execute(
        `INSERT INTO tags (tag_name, tag_color, description, created_by, usage_count) 
         VALUES (?, ?, ?, ?, 0)`,
        [tagName.trim(), tagColor || '#80399a', description.trim(), req.user.userId]
      );
    }
    
    // Call stored procedure to assign tag
    await connection.query(
      'CALL sp_AssignPatientTag(?, ?, ?, ?, @tag_id, @is_new_tag)',
      [patientId, tagName.trim(), tagColor || '#80399a', req.user.userId]
    );
    
    // Get output parameters
    const [result] = await connection.query(
      'SELECT @tag_id as tag_id, @is_new_tag as is_new_tag'
    );
    
    const { tag_id, is_new_tag } = result[0];
    
    // Get updated patient tags
    const [tags] = await connection.query(
      'CALL sp_GetPatientTags(?)',
      [patientId]
    );
    
    logger.info('Tag assigned to patient', {
      userId: req.user.userId,
      patientId,
      tagId: tag_id,
      isNewTag: is_new_tag
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('patients', 'update', { patientId });
    }
    
    res.json({
      success: true,
      data: {
        tagId: tag_id,
        isNewTag: Boolean(is_new_tag),
        patientTags: tags[0] || []
      },
      message: is_new_tag ? 'New tag created and assigned' : 'Tag assigned successfully'
    });
    
  } catch (error) {
    logger.error('Assign tag error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to assign tag' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Remove tag from patient
 */
async function removeTagFromPatient(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.patientId);
    const tagId = parseInt(req.params.tagId);
    
    if (!patientId || patientId <= 0 || !tagId || tagId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid patient ID or tag ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Call stored procedure to remove tag
    await connection.query(
      'CALL sp_RemovePatientTag(?, ?)',
      [patientId, tagId]
    );
    
    logger.info('Tag removed from patient', {
      userId: req.user.userId,
      patientId,
      tagId
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('patients', 'update', { patientId });
    }
    
    res.json({
      success: true,
      message: 'Tag removed successfully'
    });
    
  } catch (error) {
    logger.error('Remove tag error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to remove tag' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get all tags for a patient
 */
async function getPatientTags(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const patientId = parseInt(req.params.patientId);
    
    if (!patientId || patientId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid patient ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Call stored procedure to get patient tags
    const [tags] = await connection.query(
      'CALL sp_GetPatientTags(?)',
      [patientId]
    );
    
    res.json({
      success: true,
      data: tags[0] || []
    });
    
  } catch (error) {
    logger.error('Get patient tags error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch patient tags' }
    });
  } finally {
    if (connection) connection.release();
  }
}

module.exports = {
  getAllTags,
  searchTags,
  createTag,
  updateTag,
  deleteTag,
  assignTagToPatient,
  removeTagFromPatient,
  getPatientTags
};
