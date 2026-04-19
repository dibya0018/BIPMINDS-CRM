/**
 * Run Visit Status Migration
 * Adds visit_status column to patients table
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      multipleStatements: true
    });
    
    console.log('Connected successfully');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'add_visit_status_to_patients.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('Running migration: add_visit_status_to_patients.sql');
    
    // Execute migration
    await connection.query(migrationSQL);
    
    console.log('✓ Migration completed successfully');
    console.log('\nVisit status column added to patients table');
    console.log('Available statuses:');
    console.log('  - arrived (red) - Patient has arrived, needs attention');
    console.log('  - waiting (yellow) - Patient is waiting');
    console.log('  - in-room (green) - Patient is with doctor');
    console.log('  - completed (grey) - Visit completed');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    
    // Check if column already exists
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('\n⚠️  Column already exists. Migration skipped.');
    } else {
      console.error('Error details:', error);
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
