/**
 * Run Reminders Migration
 * 
 * Creates reminders table and stored procedures
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    console.log('========================================');
    console.log('Starting Reminders Migration');
    console.log('========================================\n');
    
    // Create connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: false
    });
    
    console.log('✓ Database connection established\n');
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'create_reminders_table.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('Running migration...\n');
    
    // Split SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    // Execute each statement separately
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await connection.query(statement);
        } catch (error) {
          // Skip DROP PROCEDURE errors if procedure doesn't exist
          if (!error.message.includes('does not exist')) {
            throw error;
          }
        }
      }
    }
    
    console.log('✓ Reminders table created');
    console.log('✓ Stored procedures created (if supported)\n');
    
    // Verify table was created
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'reminders'"
    );
    
    if (tables.length > 0) {
      console.log('✓ Verification: reminders table exists\n');
      
      // Show table structure
      const [columns] = await connection.query('DESCRIBE reminders');
      console.log('Table structure:');
      columns.forEach(col => {
        console.log(`  - ${col.Field} (${col.Type})`);
      });
    }
    
    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
