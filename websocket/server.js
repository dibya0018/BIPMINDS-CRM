/**
 * WebSocket Server for Real-Time Data Updates
 * 
 * Handles WebSocket connections and broadcasts data changes
 * to all connected clients when database changes occur.
 */

const WebSocket = require('ws');
const logger = require('../config/logger');
const { getPool } = require('../config/database');
const jwt = require('jsonwebtoken');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws',
      verifyClient: this.verifyClient.bind(this)
    });
    this.clients = new Map(); // Map of userId -> Set of WebSocket connections
    this.changePollInterval = null;
    this.lastCheckTimes = {
      patients: null,
      appointments: null,
      doctors: null,
      users: null,
      payments: null,
      leads: null
    };

    this.setupEventHandlers();
    this.startChangeDetection();
  }

  /**
   * Verify WebSocket client connection (authentication)
   */
  verifyClient(info) {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        logger.warn('WebSocket connection rejected: No token provided');
        return false;
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        info.req.user = decoded;
        return true;
      } catch (err) {
        logger.warn('WebSocket connection rejected: Invalid token', { error: err.message });
        return false;
      }
    } catch (err) {
      logger.error('WebSocket verification error:', err);
      return false;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      const user = req.user;
      const userId = user.userId;

      logger.info('WebSocket client connected', { userId, email: user.email });

      // Add client to map
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId).add(ws);

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        message: 'WebSocket connected successfully',
        timestamp: new Date().toISOString()
      });

      // Handle incoming messages
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleMessage(ws, user, data);
        } catch (err) {
          logger.error('Error parsing WebSocket message:', err);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Invalid message format'
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('WebSocket client disconnected', { userId });
        if (this.clients.has(userId)) {
          this.clients.get(userId).delete(ws);
          if (this.clients.get(userId).size === 0) {
            this.clients.delete(userId);
          }
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
      });
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(ws, user, data) {
    switch (data.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
        break;
      case 'subscribe':
        // Client can subscribe to specific data types
        logger.info('Client subscribed to data types', { userId: user.userId, types: data.types });
        break;
      default:
        logger.warn('Unknown message type:', data.type);
    }
  }

  /**
   * Send message to a specific client
   */
  sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (err) {
        logger.error('Error sending message to client:', err);
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((clientSet) => {
      clientSet.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(messageStr);
            sentCount++;
          } catch (err) {
            logger.error('Error broadcasting message:', err);
          }
        }
      });
    });

    logger.debug(`Broadcasted message to ${sentCount} clients`, { type: message.type });
  }

  /**
   * Start change detection polling
   */
  startChangeDetection() {
    const pollInterval = parseInt(process.env.WS_POLL_INTERVAL || '5000'); // Default 5 seconds

    this.changePollInterval = setInterval(async () => {
      await this.checkForChanges();
    }, pollInterval);

    logger.info('WebSocket change detection started', { interval: pollInterval });
  }

  /**
   * Check for database changes
   */
  async checkForChanges() {
    const pool = getPool();
    let connection;

    try {
      connection = await pool.getConnection();

      // Check each data type for changes
      await Promise.all([
        this.checkPatientsChanges(connection),
        this.checkAppointmentsChanges(connection),
        this.checkDoctorsChanges(connection),
        this.checkUsersChanges(connection),
        this.checkPaymentsChanges(connection),
        this.checkLeadsChanges(connection)
      ]);
    } catch (err) {
      logger.error('Error checking for changes:', err);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Check for patients table changes
   */
  async checkPatientsChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT patient_id, updated_at 
         FROM patients 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.patients]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.patients || latestUpdate > this.lastCheckTimes.patients) {
          this.broadcast({
            type: 'data_change',
            dataType: 'patients',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Patients data has been updated'
          });
          this.lastCheckTimes.patients = latestUpdate;
          logger.info('Patients change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking patients changes:', err);
    }
  }

  /**
   * Check for appointments table changes
   */
  async checkAppointmentsChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT appointment_id, updated_at 
         FROM appointments 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.appointments]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.appointments || latestUpdate > this.lastCheckTimes.appointments) {
          this.broadcast({
            type: 'data_change',
            dataType: 'appointments',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Appointments data has been updated'
          });
          this.lastCheckTimes.appointments = latestUpdate;
          logger.info('Appointments change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking appointments changes:', err);
    }
  }

  /**
   * Check for doctors table changes
   */
  async checkDoctorsChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT doctor_id, updated_at 
         FROM doctors 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.doctors]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.doctors || latestUpdate > this.lastCheckTimes.doctors) {
          this.broadcast({
            type: 'data_change',
            dataType: 'doctors',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Doctors data has been updated'
          });
          this.lastCheckTimes.doctors = latestUpdate;
          logger.info('Doctors change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking doctors changes:', err);
    }
  }

  /**
   * Check for users table changes
   */
  async checkUsersChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT user_id, updated_at 
         FROM users 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.users]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.users || latestUpdate > this.lastCheckTimes.users) {
          this.broadcast({
            type: 'data_change',
            dataType: 'users',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Users data has been updated'
          });
          this.lastCheckTimes.users = latestUpdate;
          logger.info('Users change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking users changes:', err);
    }
  }

  /**
   * Check for payments table changes
   */
  async checkPaymentsChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT payment_id, updated_at 
         FROM payments 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.payments]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.payments || latestUpdate > this.lastCheckTimes.payments) {
          this.broadcast({
            type: 'data_change',
            dataType: 'payments',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Payments data has been updated'
          });
          this.lastCheckTimes.payments = latestUpdate;
          logger.info('Payments change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking payments changes:', err);
    }
  }

  /**
   * Check for leads table changes
   */
  async checkLeadsChanges(connection) {
    try {
      const [rows] = await connection.query(
        `SELECT lead_id, updated_at 
         FROM leads 
         WHERE updated_at > COALESCE(?, '1970-01-01')
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [this.lastCheckTimes.leads]
      );

      if (rows.length > 0) {
        const latestUpdate = new Date(rows[0].updated_at);
        if (!this.lastCheckTimes.leads || latestUpdate > this.lastCheckTimes.leads) {
          this.broadcast({
            type: 'data_change',
            dataType: 'leads',
            changeType: 'update',
            timestamp: latestUpdate.toISOString(),
            message: 'Leads data has been updated'
          });
          this.lastCheckTimes.leads = latestUpdate;
          logger.info('Leads change detected', { latestUpdate });
        }
      }
    } catch (err) {
      logger.error('Error checking leads changes:', err);
    }
  }

  /**
   * Manually trigger a data change notification
   * Can be called from controllers after create/update/delete operations
   */
  notifyDataChange(dataType, changeType = 'update', data = null) {
    this.broadcast({
      type: 'data_change',
      dataType,
      changeType, // 'create', 'update', 'delete'
      timestamp: new Date().toISOString(),
      data,
      message: `${dataType} ${changeType} detected`
    });

    // Update last check time
    this.lastCheckTimes[dataType] = new Date();
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    if (this.changePollInterval) {
      clearInterval(this.changePollInterval);
    }

    this.clients.forEach((clientSet) => {
      clientSet.forEach((ws) => {
        ws.close();
      });
    });

    this.wss.close();
    logger.info('WebSocket server stopped');
  }
}

module.exports = WebSocketServer;
