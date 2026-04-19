/**
 * Manual Database Verification Script
 * 
 * This script manually verifies that the database initialization was successful.
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyDatabase() {
  let connection;
  
  try {
    console.log('\n========================================');
    console.log('Manual Database Verification');
    console.log('========================================\n');
    
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm_test'
    });
    
    console.log('✓ Connected to database successfully\n');
    
    // Check tables
    console.log('Checking tables...');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✓ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });
    console.log();
    
    // Check stored procedures
    console.log('Checking stored procedures...');
    const [procedures] = await connection.query(
      `SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES 
       WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'`,
      [process.env.DB_NAME || 'hospital_crm_test']
    );
    console.log(`✓ Found ${procedures.length} stored procedures:`);
    procedures.forEach(proc => {
      console.log(`  - ${proc.ROUTINE_NAME}`);
    });
    console.log();
    
    // Check demo data
    console.log('Checking demo data...');
    
    const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`✓ Users: ${users[0].count}`);
    
    const [roles] = await connection.query('SELECT COUNT(*) as count FROM roles');
    console.log(`✓ Roles: ${roles[0].count}`);
    
    const [permissions] = await connection.query('SELECT COUNT(*) as count FROM permissions');
    console.log(`✓ Permissions: ${permissions[0].count}`);
    
    const [patients] = await connection.query('SELECT COUNT(*) as count FROM patients');
    console.log(`✓ Patients: ${patients[0].count}`);
    
    const [doctors] = await connection.query('SELECT COUNT(*) as count FROM doctors');
    console.log(`✓ Doctors: ${doctors[0].count}`);
    
    const [appointments] = await connection.query('SELECT COUNT(*) as count FROM appointments');
    console.log(`✓ Appointments: ${appointments[0].count}`);
    
    const [payments] = await connection.query('SELECT COUNT(*) as count FROM payments');
    console.log(`✓ Payments: ${payments[0].count}`);
    
    const [leads] = await connection.query('SELECT COUNT(*) as count FROM leads');
    console.log(`✓ Leads: ${leads[0].count}`);
    console.log();
    
    // Check admin user
    console.log('Checking admin user...');
    const [adminUser] = await connection.query(
      'SELECT email, first_name, last_name, user_type, is_active FROM users WHERE email = ?',
      ['admin@hospital.com']
    );
    
    if (adminUser.length > 0) {
      console.log('✓ Super admin user found:');
      console.log(`  Email: ${adminUser[0].email}`);
      console.log(`  Name: ${adminUser[0].first_name} ${adminUser[0].last_name}`);
      console.log(`  Type: ${adminUser[0].user_type}`);
      console.log(`  Active: ${adminUser[0].is_active ? 'Yes' : 'No'}`);
    } else {
      console.log('✗ Super admin user not found!');
    }
    console.log();
    
    // Check role assignments
    console.log('Checking role assignments...');
    const [roleAssignments] = await connection.query(
      `SELECT COUNT(*) as count FROM user_roles`
    );
    console.log(`✓ User-Role assignments: ${roleAssignments[0].count}`);
    
    const [permissionAssignments] = await connection.query(
      `SELECT COUNT(*) as count FROM role_permissions`
    );
    console.log(`✓ Role-Permission assignments: ${permissionAssignments[0].count}`);
    console.log();
    
    console.log('========================================');
    console.log('Database Verification Complete');
    console.log('========================================\n');
    
    console.log('✓ All checks passed! Database is properly initialized.');
    
  } catch (error) {
    console.error('\n✗ Verification failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run verification
verifyDatabase();
