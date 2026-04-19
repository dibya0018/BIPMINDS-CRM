/**
 * Migration Runner Script
 * Runs the doctor_schedules table migration
 */

const fs = require('fs');
const path = require('path');
const { getPool } = require('./config/database');

async function runMigration() {
  const pool = getPool();
  let connection;
  
  try {
    console.log('🔄 Starting migration: create_doctor_schedules_table.sql');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'create_doctor_schedules_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    connection = await pool.getConnection();
    
    console.log('📝 Executing migration SQL...');
    
    // Execute the entire SQL file at once
    // MySQL driver can handle multiple statements if multipleStatements is enabled
    await connection.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('   - Created doctor_schedules table');
    console.log('   - Migrated existing schedule data from doctors table');
    console.log('   - Added indexes for performance');
    console.log('');
    console.log('🎉 Doctor scheduling system is now ready!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    process.exit(0);
  }
}

// Run the migration
runMigration();
