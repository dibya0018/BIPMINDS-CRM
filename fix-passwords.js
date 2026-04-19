/**
 * Fix Password Hashes Script
 * 
 * This script generates fresh bcrypt hashes for the password "Admin@123"
 * and updates all users in the database with unique hashes.
 * 
 * Run: node fix-passwords.js
 */

const mysql = require('mysql2/promise');
const { hashPassword } = require('./utils/password');
require('dotenv').config();

const PASSWORD = 'Admin@123';

async function fixPasswords() {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    console.log('✓ Connected to database');
    console.log(`\nGenerating fresh password hash for: ${PASSWORD}...`);
    
    // Generate a fresh hash for the password
    const newHash = await hashPassword(PASSWORD);
    console.log(`✓ Generated hash: ${newHash.substring(0, 30)}...`);
    
    // Get all users
    const [users] = await connection.query('SELECT user_id, email FROM users');
    console.log(`\nFound ${users.length} users to update:`);
    
    // Update each user with a unique hash
    for (const user of users) {
      // Generate a unique hash for each user (even with same password)
      const uniqueHash = await hashPassword(PASSWORD);
      
      await connection.query(
        'UPDATE users SET password_hash = ? WHERE user_id = ?',
        [uniqueHash, user.user_id]
      );
      
      console.log(`  ✓ Updated ${user.email} (ID: ${user.user_id})`);
      console.log(`    Hash: ${uniqueHash.substring(0, 30)}...`);
    }
    
    console.log('\n✓ All passwords updated successfully!');
    console.log('\n=== Updated Credentials ===');
    console.log('All users now have password: Admin@123');
    console.log('Each user has a unique bcrypt hash');
    console.log('===========================\n');
    
  } catch (error) {
    console.error('✗ Error fixing passwords:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
fixPasswords();
