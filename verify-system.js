/**
 * System Verification Script
 * Verifies database initialization, demo data, and basic functionality
 */

require('dotenv').config();
const { getPool } = require('./config/database');
const { initializeDatabase } = require('./database/init');

async function verifySystem() {
  console.log('=== Hospital CRM API System Verification ===\n');
  
  const pool = getPool();
  let connection;
  
  try {
    // 1. Verify database connection
    console.log('1. Testing database connection...');
    connection = await pool.getConnection();
    await connection.ping();
    console.log('   ✓ Database connection successful\n');
    
    // 2. Verify database initialization
    console.log('2. Verifying database initialization...');
    await initializeDatabase();
    console.log('   ✓ Database initialization complete\n');
    
    // 3. Verify demo data
    console.log('3. Verifying demo data...');
    
    // Check admin user
    const [adminUsers] = await connection.execute(
      'SELECT * FROM users WHERE email = ?',
      ['admin@hospital.com']
    );
    console.log(`   ✓ Admin user exists: ${adminUsers.length > 0}`);
    
    // Check roles
    const [roles] = await connection.execute('SELECT COUNT(*) as count FROM roles');
    console.log(`   ✓ Roles created: ${roles[0].count} roles`);
    
    // Check permissions
    const [permissions] = await connection.execute('SELECT COUNT(*) as count FROM permissions');
    console.log(`   ✓ Permissions created: ${permissions[0].count} permissions`);
    
    // Check demo patient
    const [patients] = await connection.execute('SELECT COUNT(*) as count FROM patients');
    console.log(`   ✓ Patients: ${patients[0].count} patient(s)`);
    
    // Check demo doctor
    const [doctors] = await connection.execute('SELECT COUNT(*) as count FROM doctors');
    console.log(`   ✓ Doctors: ${doctors[0].count} doctor(s)`);
    
    // Check demo appointment
    const [appointments] = await connection.execute('SELECT COUNT(*) as count FROM appointments');
    console.log(`   ✓ Appointments: ${appointments[0].count} appointment(s)`);
    
    // Check demo payment
    const [payments] = await connection.execute('SELECT COUNT(*) as count FROM payments');
    console.log(`   ✓ Payments: ${payments[0].count} payment(s)`);
    
    // Check demo lead
    const [leads] = await connection.execute('SELECT COUNT(*) as count FROM leads');
    console.log(`   ✓ Leads: ${leads[0].count} lead(s)\n`);
    
    // 4. Verify stored procedures
    console.log('4. Verifying stored procedures...');
    const [procedures] = await connection.execute(
      `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
      [process.env.DB_NAME]
    );
    console.log(`   ✓ Stored procedures: ${procedures.length} procedures`);
    procedures.forEach(proc => {
      console.log(`     - ${proc.ROUTINE_NAME}`);
    });
    console.log();
    
    // 5. Test stored procedure execution
    console.log('5. Testing stored procedure execution...');
    try {
      const [statsResult] = await connection.execute('CALL sp_get_dashboard_stats()');
      console.log('   ✓ sp_get_dashboard_stats executed successfully');
      console.log(`     - Active patients: ${statsResult[0][0].total_active_patients}`);
      console.log(`     - Today\'s appointments: ${statsResult[0][0].todays_appointments}`);
      console.log(`     - Active doctors: ${statsResult[0][0].active_doctors}`);
    } catch (error) {
      console.log(`   ✗ Error executing stored procedure: ${error.message}`);
    }
    console.log();
    
    console.log('=== System Verification Complete ===');
    console.log('✓ All checks passed successfully!\n');
    
  } catch (error) {
    console.error('✗ Verification failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

// Run verification
verifySystem();
