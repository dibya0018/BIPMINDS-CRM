/**
 * Run Tags System Migration
 * 
 * This script runs the tags system migration to create the tags table,
 * add tags column to patients, and create stored procedures.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    console.log('\n========================================');
    console.log('Running Tags System Migration');
    console.log('========================================\n');
    
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true
    });
    
    console.log('✓ Connected to database');
    
    // Read migration file (use simple version for MariaDB)
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'create_tags_system_simple.sql');
    let migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('✓ Migration file loaded');
    
    // Execute migration
    console.log('Running migration...');
    await connection.query(migrationSQL);
    
    console.log('✓ Migration completed successfully');
    
    // Verify tables and procedures
    console.log('\nVerifying migration...');
    
    // Check tags table
    const [tables] = await connection.query("SHOW TABLES LIKE 'tags'");
    if (tables.length > 0) {
      console.log('✓ Tags table created');
    }
    
    // Check patients.tags column
    const [columns] = await connection.query(
      "SHOW COLUMNS FROM patients LIKE 'tags'"
    );
    if (columns.length > 0) {
      console.log('✓ Tags column added to patients table');
    }
    
    // Check stored procedures
    const [procedures] = await connection.query(
      "SHOW PROCEDURE STATUS WHERE Db = ? AND Name LIKE 'sp_%Tag%'",
      [process.env.DB_NAME || 'hospital_crm']
    );
    console.log(`✓ ${procedures.length} tag-related stored procedures created`);
    
    // Count default tags
    const [tagCount] = await connection.query('SELECT COUNT(*) as count FROM tags');
    console.log(`✓ ${tagCount[0].count} default tags inserted`);
    
    console.log('\n========================================');
    console.log('Migration Completed Successfully!');
    console.log('========================================\n');
    
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Test tag assignment: POST /api/tags/patients/:patientId');
    console.log('3. Test tag search: GET /api/tags/search?q=VIP');
    console.log('4. (Optional) Install Elasticsearch for advanced search\n');
    
  } catch (error) {
    console.error('\n========================================');
    console.error('Migration Failed');
    console.error('========================================');
    console.error('Error:', error.message);
    
    if (error.sqlMessage) {
      console.error('SQL Error:', error.sqlMessage);
    }
    
    console.error('\nPlease check the error above and try again.\n');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run migration
runMigration();
