/**
 * Database Configuration Module
 * 
 * This module creates and manages a MySQL connection pool using mysql2/promise.
 * It provides connection pooling, error handling, and automatic reconnection logic.
 * 
 * Requirements: 1.2, 1.7, 18.3
 */

const mysql = require('mysql2/promise');

// Connection pool configuration
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hospital_crm',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Connection timeout settings
  connectTimeout: 10000,
  // Automatically reconnect on connection loss
  multipleStatements: true,
  // Character encoding
  charset: 'utf8mb4',
  // Max idle time before connection is closed (helps with test cleanup)
  idleTimeout: 60000,
  // SSL configuration for remote databases
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

// Create connection pool
let pool;

/**
 * Initialize the database connection pool
 * @returns {Promise<mysql.Pool>} The connection pool
 */
function createPool() {
  if (pool) {
    return pool;
  }

  // Don't create pool if it's being torn down
  if (global.__JEST_TEARDOWN__) {
    return null;
  }

  try {
    pool = mysql.createPool(poolConfig);
    
    // Test the connection pool
    pool.getConnection()
      .then(connection => {
        if (!global.__JEST_TEARDOWN__) {
          console.log('✓ Database connection pool established successfully');
        }
        connection.release();
      })
      .catch(err => {
        // Suppress all errors during test teardown
        if (!global.__JEST_TEARDOWN__ && process.env.NODE_ENV !== 'test') {
          console.error('✗ Failed to establish database connection:', err.message);
        }
        // Don't throw here - let the application handle it
      });

    // Handle pool errors
    pool.on('error', (err) => {
      // Suppress errors during test teardown
      if (global.__JEST_TEARDOWN__) {
        return;
      }
      console.error('Database pool error:', err.message);
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('Attempting to reconnect to database...');
        // Pool will automatically create new connections
      } else {
        console.error('Unexpected database error:', err);
      }
    });

    return pool;
  } catch (error) {
    console.error('Error creating database pool:', error.message);
    throw error;
  }
}

/**
 * Get the database connection pool
 * @returns {mysql.Pool} The connection pool
 */
function getPool() {
  // Don't create pool during teardown
  if (global.__JEST_TEARDOWN__) {
    return null;
  }
  
  if (!pool) {
    return createPool();
  }
  return pool;
}

/**
 * Execute a query with automatic retry logic
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<Array>} Query results [rows, fields]
 */
async function query(sql, params = [], retries = 3) {
  const currentPool = getPool();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [rows, fields] = await currentPool.query(sql, params);
      return [rows, fields];
    } catch (error) {
      console.error(`Query attempt ${attempt} failed:`, error.message);
      
      // Check if error is retryable
      const retryableErrors = [
        'PROTOCOL_CONNECTION_LOST',
        'ECONNRESET',
        'ETIMEDOUT',
        'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
      ];
      
      const isRetryable = retryableErrors.some(code => 
        error.code === code || error.message.includes(code)
      );
      
      if (!isRetryable || attempt === retries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Execute a prepared statement with automatic retry logic
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<Array>} Query results [rows, fields]
 */
async function execute(sql, params = [], retries = 3) {
  const currentPool = getPool();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const [rows, fields] = await currentPool.execute(sql, params);
      return [rows, fields];
    } catch (error) {
      console.error(`Execute attempt ${attempt} failed:`, error.message);
      
      // Check if error is retryable
      const retryableErrors = [
        'PROTOCOL_CONNECTION_LOST',
        'ECONNRESET',
        'ETIMEDOUT',
        'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
      ];
      
      const isRetryable = retryableErrors.some(code => 
        error.code === code || error.message.includes(code)
      );
      
      if (!isRetryable || attempt === retries) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get a connection from the pool
 * @returns {Promise<mysql.PoolConnection>} A database connection
 */
async function getConnection() {
  const currentPool = getPool();
  try {
    const connection = await currentPool.getConnection();
    return connection;
  } catch (error) {
    console.error('Failed to get database connection:', error.message);
    throw error;
  }
}

/**
 * Close the connection pool gracefully
 * @returns {Promise<void>}
 */
async function closePool() {
  // Set teardown flag to prevent reconnection attempts
  global.__JEST_TEARDOWN__ = true;
  
  if (pool) {
    try {
      await pool.end();
      console.log('✓ Database connection pool closed successfully');
      pool = null;
    } catch (error) {
      // Suppress errors during teardown
      if (!error.message.includes('Pool is closed')) {
        console.error('Error closing database pool:', error.message);
      }
      pool = null;
    }
  }
}

/**
 * Test database connectivity
 * @returns {Promise<boolean>} True if connection is successful
 */
async function testConnection() {
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

// Initialize pool on module load (except during tests)
if (process.env.NODE_ENV !== 'test') {
  createPool();
}

// Export pool and utility functions
module.exports = {
  get pool() { return getPool(); },
  getPool,
  query,
  execute,
  getConnection,
  closePool,
  testConnection
};
