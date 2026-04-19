/**
 * Run UTM Tracking Migration
 * Adds UTM parameters to leads table
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Create database connection
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hospital_crm'
    });

    console.log('✓ Connected to database');

    // Check if columns already exist
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'leads' AND COLUMN_NAME IN ('utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid')
    `, [process.env.DB_NAME || 'hospital_crm']);

    const existingColumns = columns.map(c => c.COLUMN_NAME);
    
    if (existingColumns.length === 7) {
      console.log('⚠ All UTM columns already exist. Migration already applied.');
      return;
    }

    console.log('✓ Checking existing columns...');
    if (existingColumns.length > 0) {
      console.log('  Found existing columns:', existingColumns.join(', '));
    }

    // Add columns that don't exist
    const columnsToAdd = [
      { name: 'utm_source', def: "VARCHAR(255) NULL COMMENT 'UTM source parameter (e.g., google, facebook)'" },
      { name: 'utm_medium', def: "VARCHAR(255) NULL COMMENT 'UTM medium parameter (e.g., cpc, email, social)'" },
      { name: 'utm_campaign', def: "VARCHAR(255) NULL COMMENT 'UTM campaign parameter'" },
      { name: 'utm_term', def: "VARCHAR(255) NULL COMMENT 'UTM term parameter (keywords)'" },
      { name: 'utm_content', def: "VARCHAR(255) NULL COMMENT 'UTM content parameter (ad variation)'" },
      { name: 'gclid', def: "VARCHAR(255) NULL COMMENT 'Google Click ID for Google Ads tracking'" },
      { name: 'fbclid', def: "VARCHAR(255) NULL COMMENT 'Facebook Click ID for Facebook Ads tracking'" }
    ];

    console.log('\nAdding columns...');
    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name)) {
        await connection.query(`ALTER TABLE leads ADD COLUMN ${col.name} ${col.def}`);
        console.log(`✓ Added column: ${col.name}`);
      } else {
        console.log(`⚠ Column ${col.name} already exists, skipping`);
      }
    }

    // Add indexes
    console.log('\nAdding indexes...');
    const indexesToAdd = [
      'idx_utm_source',
      'idx_utm_medium',
      'idx_utm_campaign',
      'idx_gclid',
      'idx_fbclid'
    ];

    for (const indexName of indexesToAdd) {
      try {
        const columnName = indexName.replace('idx_', '');
        await connection.query(`CREATE INDEX ${indexName} ON leads(${columnName})`);
        console.log(`✓ Created index: ${indexName}`);
      } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠ Index ${indexName} already exists, skipping`);
        } else {
          throw err;
        }
      }
    }

    // Update table comment
    try {
      await connection.query(`ALTER TABLE leads COMMENT = 'Leads table with UTM tracking for marketing attribution'`);
      console.log('✓ Updated table comment');
    } catch (err) {
      console.log('⚠ Could not update table comment:', err.message);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\nUTM tracking columns added to leads table:');
    console.log('  - utm_source');
    console.log('  - utm_medium');
    console.log('  - utm_campaign');
    console.log('  - utm_term');
    console.log('  - utm_content');
    console.log('  - gclid');
    console.log('  - fbclid');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✓ Database connection closed');
    }
  }
}

// Run migration
runMigration();
