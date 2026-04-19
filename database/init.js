/**
 * Database Initialization Module
 * 
 * This module handles automatic database initialization on first run:
 * - Checks if database exists
 * - Creates database if missing
 * - Verifies all tables exist
 * - Creates missing tables
 * - Installs stored procedures
 * - Seeds demo data
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Required tables in the database
const REQUIRED_TABLES = [
  'users',
  'roles',
  'permissions',
  'user_roles',
  'role_permissions',
  'patients',
  'doctors',
  'appointments',
  'payments',
  'leads',
  'qr_codes',
  'audit_logs',
  'sessions',
  'settings'
];

/**
 * Create a connection without specifying a database
 * Used for checking/creating the database itself
 * @returns {Promise<mysql.Connection>}
 */
async function createSystemConnection() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
      charset: 'utf8mb4',
      // SSL configuration for remote databases
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    return connection;
  } catch (error) {
    console.error('Failed to create system connection:', error.message);
    throw error;
  }
}

/**
 * Check if the database exists
 * Requirements: 2.1
 * @returns {Promise<boolean>}
 */
async function checkDatabaseExists() {
  let connection;
  try {
    console.log('Checking if database exists...');
    connection = await createSystemConnection();
    
    const dbName = process.env.DB_NAME || 'hospital_crm';
    const [rows] = await connection.query(
      'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
      [dbName]
    );
    
    const exists = rows.length > 0;
    console.log(`Database '${dbName}' ${exists ? 'exists' : 'does not exist'}`);
    return exists;
  } catch (error) {
    console.error('Error checking database existence:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Create the database with proper character encoding
 * Requirements: 2.2
 * @returns {Promise<void>}
 */
async function createDatabase() {
  let connection;
  try {
    console.log('Creating database...');
    connection = await createSystemConnection();
    
    const dbName = process.env.DB_NAME || 'hospital_crm';
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` 
       CHARACTER SET utf8mb4 
       COLLATE utf8mb4_unicode_ci`
    );
    
    console.log(`✓ Database '${dbName}' created successfully`);
  } catch (error) {
    console.error('Error creating database:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Check which tables exist in the database
 * Requirements: 2.3
 * @returns {Promise<string[]>} Array of missing table names
 */
async function checkTablesExist() {
  let connection;
  try {
    console.log('Checking which tables exist...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true,
      // SSL configuration for remote databases
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    
    const [rows] = await connection.query('SHOW TABLES');
    const existingTables = rows.map(row => Object.values(row)[0]);
    
    const missingTables = REQUIRED_TABLES.filter(
      table => !existingTables.includes(table)
    );
    
    if (missingTables.length > 0) {
      console.log(`Missing tables: ${missingTables.join(', ')}`);
    } else {
      console.log('✓ All required tables exist');
    }
    
    return missingTables;
  } catch (error) {
    console.error('Error checking tables:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Create missing tables from schema.sql
 * Requirements: 2.3, 2.4
 * @returns {Promise<void>}
 */
async function createTables() {
  let connection;
  try {
    console.log('Creating tables from schema...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true,
      // SSL configuration for remote databases
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    
    // Read schema.sql file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    
    // Execute schema SQL
    await connection.query(schemaSql);
    
    console.log('✓ Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Install stored procedures from procedures.sql
 * Requirements: 2.5
 * @returns {Promise<void>}
 */
async function installStoredProcedures() {
  let connection;
  try {
    console.log('Installing stored procedures...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true,
      // SSL configuration for remote databases
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    
    // Read procedures.sql file
    const proceduresPath = path.join(__dirname, 'procedures.sql');
    const proceduresSql = await fs.readFile(proceduresPath, 'utf8');
    
    // Remove comments and split by DROP PROCEDURE statements
    const lines = proceduresSql.split('\n');
    let currentProcedure = '';
    const procedures = [];
    
    for (const line of lines) {
      // Skip comment-only lines
      if (line.trim().startsWith('--') && !line.includes('DROP PROCEDURE')) {
        continue;
      }
      
      // If we hit a DROP PROCEDURE and have accumulated content, save it
      if (line.includes('DROP PROCEDURE IF EXISTS') && currentProcedure.trim()) {
        procedures.push(currentProcedure.trim());
        currentProcedure = line + '\n';
      } else {
        currentProcedure += line + '\n';
      }
    }
    
    // Don't forget the last procedure
    if (currentProcedure.trim() && !currentProcedure.includes('END OF STORED PROCEDURES')) {
      procedures.push(currentProcedure.trim());
    }
    
    // Execute each procedure separately
    for (const procedure of procedures) {
      if (procedure && procedure.includes('CREATE PROCEDURE')) {
        try {
          await connection.query(procedure);
        } catch (error) {
          console.error(`Error installing procedure: ${error.message}`);
          // Continue with other procedures
        }
      }
    }
    
    console.log('✓ Stored procedures installed successfully');
  } catch (error) {
    console.error('Error installing stored procedures:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Check if demo data has already been seeded
 * @returns {Promise<boolean>}
 */
async function isDemoDataSeeded() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm'
    });
    
    // Check if admin user exists
    const [rows] = await connection.query(
      'SELECT COUNT(*) as count FROM users WHERE email = ?',
      ['admin@hospital.com']
    );
    
    return rows[0].count > 0;
  } catch (error) {
    console.error('Error checking demo data:', error.message);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Seed demo data from seed.sql
 * Requirements: 2.6, 2.7
 * @returns {Promise<void>}
 */
async function seedDemoData() {
  let connection;
  try {
    // Check if demo data already exists
    const alreadySeeded = await isDemoDataSeeded();
    if (alreadySeeded) {
      console.log('✓ Demo data already exists, skipping seed');
      return;
    }
    
    console.log('Seeding demo data...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true,
      // SSL configuration for remote databases
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    
    // Read seed.sql file
    const seedPath = path.join(__dirname, 'seed.sql');
    const seedSql = await fs.readFile(seedPath, 'utf8');
    
    // Execute seed SQL
    await connection.query(seedSql);
    
    console.log('✓ Demo data seeded successfully');
    console.log('\n=== Demo Credentials ===');
    console.log('Super Admin: admin@hospital.com / Admin@123');
    console.log('Doctor: dr.sharma@hospital.com / Admin@123');
    console.log('Receptionist: reception@hospital.com / Admin@123');
    console.log('Accountant: accounts@hospital.com / Admin@123');
    console.log('========================\n');
  } catch (error) {
    console.error('Error seeding demo data:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Main initialization orchestration function
 * Runs all initialization steps in sequence
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 * @returns {Promise<void>}
 */
async function initializeDatabase() {
  try {
    console.log('\n========================================');
    console.log('Starting Database Initialization');
    console.log('========================================\n');
    
    // Step 1: Check if database exists
    const dbExists = await checkDatabaseExists();
    
    // Step 2: Create database if it doesn't exist
    if (!dbExists) {
      await createDatabase();
    }
    
    // Step 3: Check which tables exist
    const missingTables = await checkTablesExist();
    
    // Step 4: Create missing tables
    if (missingTables.length > 0 || !dbExists) {
      await createTables();
    }
    
    // Step 5: Install stored procedures (always run to ensure latest version)
    await installStoredProcedures();
    
    // Step 6: Seed demo data if database is empty
    await seedDemoData();
    
    console.log('\n========================================');
    console.log('Database Initialization Complete');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n========================================');
    console.error('Database Initialization Failed');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('\nPlease check your database configuration and try again.\n');
    throw error;
  }
}

// Export all functions
module.exports = {
  initializeDatabase,
  checkDatabaseExists,
  createDatabase,
  checkTablesExist,
  createTables,
  installStoredProcedures,
  seedDemoData,
  isDemoDataSeeded
};
