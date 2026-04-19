/**
 * Unit Tests for Database Initialization Module
 * 
 * Tests database creation, table creation, stored procedure installation,
 * demo data seeding, and idempotency.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */

const mysql = require('mysql2/promise');
const {
  initializeDatabase,
  checkDatabaseExists,
  createDatabase,
  checkTablesExist,
  createTables,
  installStoredProcedures,
  seedDemoData,
  isDemoDataSeeded
} = require('../../database/init');

// Test database configuration
const TEST_DB_NAME = process.env.DB_NAME || 'hospital_crm_test';
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

/**
 * Helper function to drop test database
 */
async function dropTestDatabase() {
  let connection;
  try {
    connection = await mysql.createConnection(DB_CONFIG);
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
  } catch (error) {
    console.error('Error dropping test database:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Helper function to check if a table exists
 */
async function tableExists(tableName) {
  let connection;
  try {
    connection = await mysql.createConnection({
      ...DB_CONFIG,
      database: TEST_DB_NAME
    });
    const [rows] = await connection.query('SHOW TABLES LIKE ?', [tableName]);
    return rows.length > 0;
  } catch (error) {
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Helper function to check if a stored procedure exists
 */
async function procedureExists(procedureName) {
  let connection;
  try {
    connection = await mysql.createConnection({
      ...DB_CONFIG,
      database: TEST_DB_NAME
    });
    const [rows] = await connection.query(
      'SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME = ?',
      [TEST_DB_NAME, procedureName]
    );
    return rows.length > 0;
  } catch (error) {
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Helper function to count records in a table
 */
async function countRecords(tableName) {
  let connection;
  try {
    connection = await mysql.createConnection({
      ...DB_CONFIG,
      database: TEST_DB_NAME
    });
    const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    return rows[0].count;
  } catch (error) {
    return 0;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

describe('Database Initialization Module', () => {
  // Clean up before all tests
  beforeAll(async () => {
    await dropTestDatabase();
  });

  // Clean up after all tests
  afterAll(async () => {
    // Optionally keep the test database for inspection
    // await dropTestDatabase();
  });

  describe('checkDatabaseExists', () => {
    it('should return false when database does not exist', async () => {
      const exists = await checkDatabaseExists();
      expect(exists).toBe(false);
    });

    it('should return true after database is created', async () => {
      await createDatabase();
      const exists = await checkDatabaseExists();
      expect(exists).toBe(true);
    });
  });

  describe('createDatabase', () => {
    beforeAll(async () => {
      await dropTestDatabase();
    });

    it('should create database with proper character encoding', async () => {
      await createDatabase();
      
      let connection;
      try {
        connection = await mysql.createConnection(DB_CONFIG);
        const [rows] = await connection.query(
          `SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME 
           FROM INFORMATION_SCHEMA.SCHEMATA 
           WHERE SCHEMA_NAME = ?`,
          [TEST_DB_NAME]
        );
        
        expect(rows.length).toBe(1);
        expect(rows[0].DEFAULT_CHARACTER_SET_NAME).toBe('utf8mb4');
        expect(rows[0].DEFAULT_COLLATION_NAME).toBe('utf8mb4_unicode_ci');
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    it('should not fail when database already exists', async () => {
      // Create database twice - should not throw error
      await expect(createDatabase()).resolves.not.toThrow();
      await expect(createDatabase()).resolves.not.toThrow();
    });
  });

  describe('checkTablesExist', () => {
    beforeAll(async () => {
      await dropTestDatabase();
      await createDatabase();
    });

    it('should return all required tables as missing when database is empty', async () => {
      const missingTables = await checkTablesExist();
      
      expect(missingTables).toContain('users');
      expect(missingTables).toContain('roles');
      expect(missingTables).toContain('permissions');
      expect(missingTables).toContain('patients');
      expect(missingTables).toContain('doctors');
      expect(missingTables).toContain('appointments');
      expect(missingTables).toContain('payments');
      expect(missingTables).toContain('leads');
      expect(missingTables).toContain('qr_codes');
      expect(missingTables).toContain('audit_logs');
      expect(missingTables).toContain('sessions');
      expect(missingTables).toContain('settings');
    });

    it('should return empty array when all tables exist', async () => {
      await createTables();
      const missingTables = await checkTablesExist();
      
      expect(missingTables).toEqual([]);
    });
  });

  describe('createTables', () => {
    beforeAll(async () => {
      await dropTestDatabase();
      await createDatabase();
    });

    it('should create all required tables', async () => {
      await createTables();
      
      // Check that all required tables exist
      expect(await tableExists('users')).toBe(true);
      expect(await tableExists('roles')).toBe(true);
      expect(await tableExists('permissions')).toBe(true);
      expect(await tableExists('user_roles')).toBe(true);
      expect(await tableExists('role_permissions')).toBe(true);
      expect(await tableExists('patients')).toBe(true);
      expect(await tableExists('doctors')).toBe(true);
      expect(await tableExists('appointments')).toBe(true);
      expect(await tableExists('payments')).toBe(true);
      expect(await tableExists('leads')).toBe(true);
      expect(await tableExists('qr_codes')).toBe(true);
      expect(await tableExists('audit_logs')).toBe(true);
      expect(await tableExists('sessions')).toBe(true);
      expect(await tableExists('settings')).toBe(true);
    });

    it('should create tables with proper indexes', async () => {
      let connection;
      try {
        connection = await mysql.createConnection({
          ...DB_CONFIG,
          database: TEST_DB_NAME
        });
        
        // Check for indexes on users table
        const [indexes] = await connection.query(
          'SHOW INDEX FROM users WHERE Key_name != "PRIMARY"'
        );
        
        expect(indexes.length).toBeGreaterThan(0);
        
        // Check for specific indexes
        const indexNames = indexes.map(idx => idx.Key_name);
        expect(indexNames).toContain('idx_email');
        expect(indexNames).toContain('idx_user_type');
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    it('should create tables with foreign key constraints', async () => {
      let connection;
      try {
        connection = await mysql.createConnection({
          ...DB_CONFIG,
          database: TEST_DB_NAME
        });
        
        // Check for foreign keys on user_roles table
        const [foreignKeys] = await connection.query(
          `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME 
           FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
           WHERE TABLE_SCHEMA = ? 
           AND TABLE_NAME = 'user_roles' 
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
          [TEST_DB_NAME]
        );
        
        expect(foreignKeys.length).toBeGreaterThan(0);
        
        // Check that it references users and roles tables
        const referencedTables = foreignKeys.map(fk => fk.REFERENCED_TABLE_NAME);
        expect(referencedTables).toContain('users');
        expect(referencedTables).toContain('roles');
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });
  });

  describe('installStoredProcedures', () => {
    beforeAll(async () => {
      await dropTestDatabase();
      await createDatabase();
      await createTables();
    });

    it('should install all required stored procedures', async () => {
      await installStoredProcedures();
      
      // Check that all required procedures exist
      expect(await procedureExists('sp_user_login')).toBe(true);
      expect(await procedureExists('sp_user_logout')).toBe(true);
      expect(await procedureExists('sp_create_patient')).toBe(true);
      expect(await procedureExists('sp_get_patient_by_id')).toBe(true);
      expect(await procedureExists('sp_get_patient_by_qr')).toBe(true);
      expect(await procedureExists('sp_create_appointment')).toBe(true);
      expect(await procedureExists('sp_create_payment')).toBe(true);
      expect(await procedureExists('sp_check_permission')).toBe(true);
      expect(await procedureExists('sp_get_dashboard_stats')).toBe(true);
    });

    it('should not fail when procedures already exist', async () => {
      // Install procedures twice - should not throw error
      await expect(installStoredProcedures()).resolves.not.toThrow();
      await expect(installStoredProcedures()).resolves.not.toThrow();
    });
  });

  describe('seedDemoData', () => {
    beforeAll(async () => {
      await dropTestDatabase();
      await createDatabase();
      await createTables();
    });

    it('should seed demo data when database is empty', async () => {
      await seedDemoData();
      
      // Check that demo data was created
      const userCount = await countRecords('users');
      const roleCount = await countRecords('roles');
      const permissionCount = await countRecords('permissions');
      const patientCount = await countRecords('patients');
      const doctorCount = await countRecords('doctors');
      const appointmentCount = await countRecords('appointments');
      const paymentCount = await countRecords('payments');
      const leadCount = await countRecords('leads');
      
      expect(userCount).toBeGreaterThan(0);
      expect(roleCount).toBe(6); // 6 default roles
      expect(permissionCount).toBeGreaterThan(0);
      expect(patientCount).toBeGreaterThan(0);
      expect(doctorCount).toBeGreaterThan(0);
      expect(appointmentCount).toBeGreaterThan(0);
      expect(paymentCount).toBeGreaterThan(0);
      expect(leadCount).toBeGreaterThan(0);
    });

    it('should create super admin user with correct email', async () => {
      let connection;
      try {
        connection = await mysql.createConnection({
          ...DB_CONFIG,
          database: TEST_DB_NAME
        });
        
        const [rows] = await connection.query(
          'SELECT * FROM users WHERE email = ?',
          ['admin@hospital.com']
        );
        
        expect(rows.length).toBe(1);
        expect(rows[0].first_name).toBe('System');
        expect(rows[0].last_name).toBe('Administrator');
        expect(rows[0].user_type).toBe('admin');
        expect(rows[0].is_active).toBe(1);
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    it('should create default roles with correct names', async () => {
      let connection;
      try {
        connection = await mysql.createConnection({
          ...DB_CONFIG,
          database: TEST_DB_NAME
        });
        
        const [rows] = await connection.query('SELECT role_name FROM roles ORDER BY role_name');
        const roleNames = rows.map(r => r.role_name);
        
        expect(roleNames).toContain('super_admin');
        expect(roleNames).toContain('admin');
        expect(roleNames).toContain('doctor');
        expect(roleNames).toContain('nurse');
        expect(roleNames).toContain('receptionist');
        expect(roleNames).toContain('accountant');
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    it('should assign permissions to roles', async () => {
      let connection;
      try {
        connection = await mysql.createConnection({
          ...DB_CONFIG,
          database: TEST_DB_NAME
        });
        
        const [rows] = await connection.query(
          `SELECT COUNT(*) as count FROM role_permissions`
        );
        
        expect(rows[0].count).toBeGreaterThan(0);
      } finally {
        if (connection) {
          await connection.end();
        }
      }
    });

    it('should not duplicate data when run twice (idempotency)', async () => {
      const userCountBefore = await countRecords('users');
      const roleCountBefore = await countRecords('roles');
      
      // Run seed again
      await seedDemoData();
      
      const userCountAfter = await countRecords('users');
      const roleCountAfter = await countRecords('roles');
      
      // Counts should remain the same
      expect(userCountAfter).toBe(userCountBefore);
      expect(roleCountAfter).toBe(roleCountBefore);
    });
  });

  describe('initializeDatabase (full integration)', () => {
    beforeAll(async () => {
      await dropTestDatabase();
    });

    it('should complete full initialization successfully', async () => {
      await expect(initializeDatabase()).resolves.not.toThrow();
      
      // Verify database exists
      expect(await checkDatabaseExists()).toBe(true);
      
      // Verify tables exist
      const missingTables = await checkTablesExist();
      expect(missingTables).toEqual([]);
      
      // Verify stored procedures exist
      expect(await procedureExists('sp_user_login')).toBe(true);
      expect(await procedureExists('sp_get_dashboard_stats')).toBe(true);
      
      // Verify demo data exists
      expect(await isDemoDataSeeded()).toBe(true);
    });

    it('should be idempotent (running twice should not fail)', async () => {
      // Run initialization again
      await expect(initializeDatabase()).resolves.not.toThrow();
      
      // Verify data is not duplicated
      const userCount = await countRecords('users');
      expect(userCount).toBeGreaterThan(0);
      expect(userCount).toBeLessThan(10); // Should not have duplicates
    });
  });
});
