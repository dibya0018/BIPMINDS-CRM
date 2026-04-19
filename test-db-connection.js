const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'srv2145.hstgr.io',
  port: 3306,
  user: 'u262861839_bipzy',
  password: 'Pubg1968',
  database: 'u262861839_BIPZY_CRM',
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  try {
    const [rows] = await pool.query('SELECT 1');
    console.log('DB connected, test query result:', rows);
    
    // Test a more meaningful query
    const [tables] = await pool.query('SHOW TABLES');
    console.log('Available tables:', tables);
    
    // Close the pool
    await pool.end();
    console.log('Connection pool closed successfully');
  } catch (err) {
    console.error('Failed to connect:', err);
    process.exit(1);
  }
}

testConnection();
