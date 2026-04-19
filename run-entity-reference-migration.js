const fs = require('fs');
const path = require('path');
const pool = require('./config/database');

async function runMigration() {
  let connection;
  
  try {
    console.log('🔄 Starting entity reference migration for reminders...');
    
    // Get connection from pool
    connection = await pool.getConnection();
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'database', 'migrations', 'add_entity_reference_to_reminders.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Remove comments and split by semicolon
    const statements = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n')
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`📝 Found ${statements.length} SQL statement(s) to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n⚙️  Executing statement ${i + 1}/${statements.length}...`);
      console.log(`SQL: ${statement.substring(0, 100)}...`);
      
      await connection.query(statement);
      console.log(`✅ Statement ${i + 1} executed successfully`);
    }
    
    console.log('\n✅ Entity reference migration completed successfully!');
    console.log('\n📋 New fields added to reminders table:');
    console.log('   - entity_type: Type of entity (patient, doctor, appointment, lead, payment, general)');
    console.log('   - entity_id: ID of the linked entity');
    console.log('   - entity_name: Cached name for display');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run migration
runMigration();
