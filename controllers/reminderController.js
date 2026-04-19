/**
 * Reminder Controller
 * 
 * Handles reminder management operations including CRUD and tag integration.
 */

const { getPool } = require('../config/database');
const { setAuditOldValues } = require('../middleware/audit');
const logger = require('../config/logger');

/**
 * Get reminders with pagination and search
 */
async function getReminders(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;
    
    connection = await pool.getConnection();
    
    // Build search query
    let whereClause = 'WHERE r.is_active = TRUE';
    const params = [];
    
    if (search) {
      whereClause += ` AND (
        r.type LIKE ? OR 
        r.purpose LIKE ?
      )`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM reminders r ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    
    // Get paginated results
    const query = `
      SELECT r.*
      FROM reminders r
      ${whereClause}
      ORDER BY r.next_trigger_date ASC, r.reminder_time ASC
      LIMIT ? OFFSET ?
    `;
    
    params.push(limit, offset);
    const [reminders] = await connection.query(query, params);
    
    // For each reminder, fetch full tag details
    const remindersWithTags = await Promise.all(reminders.map(async (reminder) => {
      let tagsArray = reminder.tags;
      if (typeof tagsArray === 'string') {
        try {
          tagsArray = JSON.parse(tagsArray);
        } catch (e) {
          tagsArray = [];
        }
      }
      
      if (tagsArray && Array.isArray(tagsArray) && tagsArray.length > 0) {
        try {
          const tagIds = tagsArray.map(t => parseInt(t));
          const [tags] = await connection.query(
            `SELECT tag_id, tag_name, tag_color, description, usage_count 
             FROM tags WHERE tag_id IN (?)`,
            [tagIds]
          );
          return { ...reminder, tags: tags || [] };
        } catch (error) {
          logger.error(`Failed to fetch tags for reminder ${reminder.reminder_id}:`, error);
          return { ...reminder, tags: [] };
        }
      }
      return { ...reminder, tags: [] };
    }));
    
    logger.info('Reminders retrieved', { 
      userId: req.user.userId,
      page,
      limit,
      search,
      count: remindersWithTags.length
    });
    
    res.json({
      success: true,
      data: remindersWithTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    logger.error('Get reminders error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching reminders'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Get reminder by ID
 */
async function getReminderById(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.id);
    
    if (!reminderId || reminderId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid reminder ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    const [reminders] = await connection.query(
      'SELECT * FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reminder not found'
        }
      });
    }
    
    const reminder = reminders[0];
    
    // Fetch tags
    let tagsArray = reminder.tags;
    if (typeof tagsArray === 'string') {
      try {
        tagsArray = JSON.parse(tagsArray);
      } catch (e) {
        tagsArray = [];
      }
    }
    
    if (tagsArray && Array.isArray(tagsArray) && tagsArray.length > 0) {
      const tagIds = tagsArray.map(t => parseInt(t));
      const [tags] = await connection.query(
        `SELECT tag_id, tag_name, tag_color, description, usage_count 
         FROM tags WHERE tag_id IN (?)`,
        [tagIds]
      );
      reminder.tags = tags || [];
    } else {
      reminder.tags = [];
    }
    
    logger.info('Reminder retrieved', { 
      userId: req.user.userId,
      reminderId
    });
    
    res.json({
      success: true,
      data: reminder
    });
    
  } catch (error) {
    logger.error('Get reminder by ID error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching reminder'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Calculate next trigger date based on recurrence
 */
function calculateNextTriggerDate(recurrence, currentDate = new Date()) {
  const nextDate = new Date(currentDate);
  
  switch (recurrence) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'once':
    default:
      // For 'once', set to current date
      break;
  }
  
  return nextDate.toISOString().split('T')[0]; // Return YYYY-MM-DD format
}

/**
 * Create reminder
 */
async function createReminder(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const {
      type,
      purpose,
      reminderTime,
      reminderDate,
      recurrence,
      entityType,
      entityId,
      entityName
    } = req.body;
    
    // Validate required fields (only type and purpose are required now)
    if (!type || !purpose) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Type and purpose are required'
        }
      });
    }
    
    // Validate recurrence
    const validRecurrences = ['once', 'daily', 'weekly', 'monthly'];
    if (!validRecurrences.includes(recurrence)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid recurrence. Must be one of: once, daily, weekly, monthly'
        }
      });
    }
    
    // Validate entity type if provided
    const validEntityTypes = ['patient', 'doctor', 'appointment', 'lead', 'payment', 'general'];
    if (entityType && !validEntityTypes.includes(entityType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid entity type. Must be one of: patient, doctor, appointment, lead, payment, general'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Calculate next trigger date
    const nextTriggerDate = calculateNextTriggerDate(recurrence);
    
    // Create reminder
    await connection.execute(
      `INSERT INTO reminders (
        type, purpose, entity_type, entity_id, entity_name, 
        reminder_time, reminder_date, recurrence, next_trigger_date, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type, 
        purpose, 
        entityType || 'general', 
        entityId || null, 
        entityName || null,
        reminderTime || null,
        reminderDate || nextTriggerDate,
        recurrence || 'once', 
        nextTriggerDate, 
        req.user.userId
      ]
    );
    
    const [result] = await connection.query('SELECT LAST_INSERT_ID() as reminder_id');
    const reminderId = result[0].reminder_id;
    
    // Get created reminder
    const [reminders] = await connection.query(
      'SELECT * FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    const reminder = { ...reminders[0], tags: [] };
    
    logger.info('Reminder created', { 
      userId: req.user.userId,
      reminderId
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('reminders', 'create', { reminderId });
    }
    
    res.status(201).json({
      success: true,
      data: reminder,
      message: 'Reminder created successfully'
    });
    
  } catch (error) {
    logger.error('Create reminder error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while creating reminder'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Update reminder
 */
async function updateReminder(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.id);
    
    if (!reminderId || reminderId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid reminder ID'
        }
      });
    }
    
    const {
      type,
      purpose,
      reminderTime,
      reminderDate,
      recurrence,
      isActive,
      entityType,
      entityId,
      entityName
    } = req.body;
    
    connection = await pool.getConnection();
    
    // Get old values for audit logging
    const [oldReminders] = await connection.query(
      'SELECT * FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    if (oldReminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reminder not found'
        }
      });
    }
    
    setAuditOldValues(req, oldReminders[0]);
    
    // Calculate new next trigger date if recurrence changed
    let nextTriggerDate = oldReminders[0].next_trigger_date;
    if (recurrence && recurrence !== oldReminders[0].recurrence) {
      nextTriggerDate = calculateNextTriggerDate(recurrence);
    }
    
    // Update reminder
    await connection.execute(
      `UPDATE reminders SET
        type = ?,
        purpose = ?,
        entity_type = ?,
        entity_id = ?,
        entity_name = ?,
        reminder_time = ?,
        reminder_date = ?,
        recurrence = ?,
        next_trigger_date = ?,
        is_active = ?,
        updated_at = NOW()
      WHERE reminder_id = ?`,
      [
        type,
        purpose,
        entityType !== undefined ? entityType : oldReminders[0].entity_type,
        entityId !== undefined ? entityId : oldReminders[0].entity_id,
        entityName !== undefined ? entityName : oldReminders[0].entity_name,
        reminderTime,
        reminderDate !== undefined ? reminderDate : oldReminders[0].reminder_date,
        recurrence,
        nextTriggerDate,
        isActive !== undefined ? isActive : oldReminders[0].is_active,
        reminderId
      ]
    );
    
    // Get updated reminder
    const [reminders] = await connection.query(
      'SELECT * FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    const reminder = reminders[0];
    
    // Fetch tags
    let tagsArray = reminder.tags;
    if (typeof tagsArray === 'string') {
      try {
        tagsArray = JSON.parse(tagsArray);
      } catch (e) {
        tagsArray = [];
      }
    }
    
    if (tagsArray && Array.isArray(tagsArray) && tagsArray.length > 0) {
      const tagIds = tagsArray.map(t => parseInt(t));
      const [tags] = await connection.query(
        `SELECT tag_id, tag_name, tag_color, description, usage_count 
         FROM tags WHERE tag_id IN (?)`,
        [tagIds]
      );
      reminder.tags = tags || [];
    } else {
      reminder.tags = [];
    }
    
    logger.info('Reminder updated', { 
      userId: req.user.userId,
      reminderId
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('reminders', 'update', { reminderId });
    }
    
    res.json({
      success: true,
      data: reminder,
      message: 'Reminder updated successfully'
    });
    
  } catch (error) {
    logger.error('Update reminder error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while updating reminder'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Delete reminder (soft delete)
 */
async function deleteReminder(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.id);
    
    if (!reminderId || reminderId <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Invalid reminder ID'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if reminder exists
    const [reminders] = await connection.query(
      'SELECT reminder_id FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Reminder not found'
        }
      });
    }
    
    // Soft delete
    await connection.execute(
      'UPDATE reminders SET is_active = FALSE, updated_at = NOW() WHERE reminder_id = ?',
      [reminderId]
    );
    
    logger.info('Reminder deleted (soft)', { 
      userId: req.user.userId,
      reminderId
    });
    
    res.json({
      success: true,
      message: 'Reminder deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete reminder error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while deleting reminder'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Assign tag to reminder
 */
async function assignTagToReminder(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.reminderId);
    const { tagName, tagColor, description } = req.body;
    
    if (!reminderId || reminderId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid reminder ID' }
      });
    }
    
    if (!tagName || tagName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Tag name is required' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Check if reminder exists
    const [reminders] = await connection.query(
      'SELECT reminder_id, tags FROM reminders WHERE reminder_id = ? AND is_active = TRUE',
      [reminderId]
    );
    
    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder not found' }
      });
    }
    
    // Check if tag exists, if not create it
    let [existingTags] = await connection.query(
      'SELECT tag_id FROM tags WHERE tag_name = ?',
      [tagName.trim()]
    );
    
    let tagId;
    let isNewTag = false;
    
    if (existingTags.length === 0) {
      // Create new tag
      await connection.execute(
        `INSERT INTO tags (tag_name, tag_color, description, created_by, usage_count) 
         VALUES (?, ?, ?, ?, 1)`,
        [tagName.trim(), tagColor || '#80399a', description || null, req.user.userId]
      );
      
      const [result] = await connection.query('SELECT LAST_INSERT_ID() as tag_id');
      tagId = result[0].tag_id;
      isNewTag = true;
    } else {
      tagId = existingTags[0].tag_id;
      // Increment usage count
      await connection.execute(
        'UPDATE tags SET usage_count = usage_count + 1 WHERE tag_id = ?',
        [tagId]
      );
    }
    
    // Get current tags
    let currentTags = reminders[0].tags;
    if (typeof currentTags === 'string') {
      try {
        currentTags = JSON.parse(currentTags);
      } catch (e) {
        currentTags = [];
      }
    }
    if (!Array.isArray(currentTags)) {
      currentTags = [];
    }
    
    // Add tag if not already present
    if (!currentTags.includes(tagId)) {
      currentTags.push(tagId);
      
      // Update reminder tags
      await connection.execute(
        'UPDATE reminders SET tags = ?, updated_at = NOW() WHERE reminder_id = ?',
        [JSON.stringify(currentTags), reminderId]
      );
    }
    
    // Get updated tags with details
    const [tags] = await connection.query(
      `SELECT tag_id, tag_name, tag_color, description, usage_count 
       FROM tags WHERE tag_id IN (?)`,
      [currentTags]
    );
    
    logger.info('Tag assigned to reminder', {
      userId: req.user.userId,
      reminderId,
      tagId,
      isNewTag
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('reminders', 'update', { reminderId });
    }
    
    res.json({
      success: true,
      data: {
        tagId,
        isNewTag,
        reminderTags: tags || []
      },
      message: isNewTag ? 'New tag created and assigned' : 'Tag assigned successfully'
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
 * Remove tag from reminder
 */
async function removeTagFromReminder(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.reminderId);
    const tagId = parseInt(req.params.tagId);
    
    if (!reminderId || reminderId <= 0 || !tagId || tagId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid reminder ID or tag ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get current tags
    const [reminders] = await connection.query(
      'SELECT tags FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder not found' }
      });
    }
    
    let currentTags = reminders[0].tags;
    if (typeof currentTags === 'string') {
      try {
        currentTags = JSON.parse(currentTags);
      } catch (e) {
        currentTags = [];
      }
    }
    if (!Array.isArray(currentTags)) {
      currentTags = [];
    }
    
    // Remove tag
    currentTags = currentTags.filter(id => id !== tagId);
    
    // Update reminder
    await connection.execute(
      'UPDATE reminders SET tags = ?, updated_at = NOW() WHERE reminder_id = ?',
      [JSON.stringify(currentTags), reminderId]
    );
    
    // Decrement usage count
    await connection.execute(
      'UPDATE tags SET usage_count = GREATEST(0, usage_count - 1) WHERE tag_id = ?',
      [tagId]
    );
    
    logger.info('Tag removed from reminder', {
      userId: req.user.userId,
      reminderId,
      tagId
    });
    
    // Notify WebSocket clients
    if (global.wsServer) {
      global.wsServer.notifyDataChange('reminders', 'update', { reminderId });
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
 * Get all tags for a reminder
 */
async function getReminderTags(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const reminderId = parseInt(req.params.reminderId);
    
    if (!reminderId || reminderId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VAL_001', message: 'Invalid reminder ID' }
      });
    }
    
    connection = await pool.getConnection();
    
    // Get reminder tags
    const [reminders] = await connection.query(
      'SELECT tags FROM reminders WHERE reminder_id = ?',
      [reminderId]
    );
    
    if (reminders.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Reminder not found' }
      });
    }
    
    let tagsArray = reminders[0].tags;
    if (typeof tagsArray === 'string') {
      try {
        tagsArray = JSON.parse(tagsArray);
      } catch (e) {
        tagsArray = [];
      }
    }
    if (!Array.isArray(tagsArray) || tagsArray.length === 0) {
      return res.json({
        success: true,
        data: []
      });
    }
    
    // Get tag details
    const [tags] = await connection.query(
      `SELECT tag_id, tag_name, tag_color, description, usage_count 
       FROM tags WHERE tag_id IN (?)`,
      [tagsArray]
    );
    
    res.json({
      success: true,
      data: tags || []
    });
    
  } catch (error) {
    logger.error('Get reminder tags error', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch reminder tags' }
    });
  } finally {
    if (connection) connection.release();
  }
}

/**
 * Get reminders for a specific entity (e.g., patient)
 */
async function getRemindersByEntity(req, res) {
  const pool = getPool();
  let connection;
  
  try {
    const { entityType, entityId } = req.params;
    
    if (!entityType || !entityId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_001',
          message: 'Entity type and ID are required'
        }
      });
    }
    
    connection = await pool.getConnection();
    
    const [reminders] = await connection.query(
      `SELECT * FROM reminders 
       WHERE entity_type = ? AND entity_id = ? AND is_active = TRUE
       ORDER BY reminder_date ASC, reminder_time ASC`,
      [entityType, parseInt(entityId)]
    );
    
    // Fetch tags for each reminder
    const remindersWithTags = await Promise.all(reminders.map(async (reminder) => {
      let tagsArray = reminder.tags;
      if (typeof tagsArray === 'string') {
        try {
          tagsArray = JSON.parse(tagsArray);
        } catch (e) {
          tagsArray = [];
        }
      }
      
      if (tagsArray && Array.isArray(tagsArray) && tagsArray.length > 0) {
        try {
          const tagIds = tagsArray.map(t => parseInt(t));
          const [tags] = await connection.query(
            `SELECT tag_id, tag_name, tag_color, description, usage_count 
             FROM tags WHERE tag_id IN (?)`,
            [tagIds]
          );
          return { ...reminder, tags: tags || [] };
        } catch (error) {
          logger.error(`Failed to fetch tags for reminder ${reminder.reminder_id}:`, error);
          return { ...reminder, tags: [] };
        }
      }
      return { ...reminder, tags: [] };
    }));
    
    logger.info('Reminders retrieved by entity', { 
      userId: req.user.userId,
      entityType,
      entityId,
      count: remindersWithTags.length
    });
    
    res.json({
      success: true,
      data: remindersWithTags
    });
    
  } catch (error) {
    logger.error('Get reminders by entity error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An error occurred while fetching reminders'
      }
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = {
  getReminders,
  getReminderById,
  getRemindersByEntity,
  createReminder,
  updateReminder,
  deleteReminder,
  assignTagToReminder,
  removeTagFromReminder,
  getReminderTags
};
