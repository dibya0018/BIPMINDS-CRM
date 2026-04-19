/**
 * Migration Runner Script
 * Removes unique constraint to allow multiple schedules per day
 */

const fs = require('fs');
const path = require('path');
const { getPool } = require('./config/database');

async function runMigration() {
  const pool = getPool();
  let connection;
  
  try {
    console.log('🔄 Starting migration: allow_multiple_schedules_per_day.sql');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'allow_multiple_schedules_per_day.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    connection = await pool.getConnection();
    
    console.log('📝 Executing migration SQL...');
    
    // Split SQL statements and execute them one by one
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('   Executing:', statement.substring(0, 50) + '...');
        await connection.query(statement);
      }
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log('   - Removed unique constraint on (doctor_id, day_of_week)');
    console.log('   - Added composite index for performance');
    console.log('   - Doctors can now have multiple schedules per day');
    console.log('');
    console.log('🎉 Multiple schedules per day feature is now enabled!');
    
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
