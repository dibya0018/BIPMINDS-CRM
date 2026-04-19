/**
 * Manual Test for Database Connection Module
 * 
 * This is a simple test to verify the database connection module works correctly.
 * Run with: node config/database.test.js
 * 
 * Note: Requires a running MySQL server with credentials from .env file
 */

const db = require('./database');

async function testDatabaseConnection() {
  console.log('\n=== Testing Database Connection Module ===\n');
  
  try {
    // Test 1: Test connection
    console.log('Test 1: Testing database connectivity...');
    const isConnected = await db.testConnection();
    if (isConnected) {
      console.log('✓ Database connection test passed\n');
    } else {
      console.log('✗ Database connection test failed\n');
      process.exit(1);
    }
    
    // Test 2: Get connection from pool
    console.log('Test 2: Getting connection from pool...');
    const connection = await db.getConnection();
    console.log('✓ Successfully obtained connection from pool');
    connection.release();
    console.log('✓ Connection released back to pool\n');
    
    // Test 3: Execute a simple query
    console.log('Test 3: Executing simple query...');
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    if (rows[0].result === 2) {
      console.log('✓ Query execution successful (1 + 1 = 2)\n');
    } else {
      console.log('✗ Query execution failed\n');
      process.exit(1);
    }
    
    // Test 4: Test prepared statement
    console.log('Test 4: Testing prepared statement...');
    const [results] = await db.execute('SELECT ? + ? AS sum', [5, 3]);
    if (results[0].sum === 8) {
      console.log('✓ Prepared statement execution successful (5 + 3 = 8)\n');
    } else {
      console.log('✗ Prepared statement execution failed\n');
      process.exit(1);
    }
    
    // Test 5: Test pool availability
    console.log('Test 5: Testing pool availability...');
    const pool = db.getPool();
    if (pool) {
      console.log('✓ Pool is available and accessible\n');
    } else {
      console.log('✗ Pool is not available\n');
      process.exit(1);
    }
    
    console.log('=== All Tests Passed ===\n');
    
    // Close the pool
    await db.closePool();
    console.log('Database connection pool closed.');
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Try to close pool even on error
    try {
      await db.closePool();
    } catch (closeError) {
      console.error('Error closing pool:', closeError.message);
    }
    
    process.exit(1);
  }
}

// Run tests
testDatabaseConnection();
