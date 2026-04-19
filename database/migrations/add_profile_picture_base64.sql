-- Migration: Add/Update profile_picture columns to support base64 images
-- Adds column if it doesn't exist, or changes VARCHAR(500) to TEXT if it exists
-- Date: 2026-01-30

-- Add or update users table profile_picture column
-- Check if column exists, if not add it, if yes modify it
SET @db_name = DATABASE();
SET @table_name = 'users';
SET @column_name = 'profile_picture';

SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name 
      AND TABLE_NAME = @table_name 
      AND COLUMN_NAME = @column_name
);

SET @sql = IF(@col_exists > 0,
    'ALTER TABLE users MODIFY COLUMN profile_picture TEXT',
    'ALTER TABLE users ADD COLUMN profile_picture TEXT AFTER user_type'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add or update patients table profile_picture column
SET @table_name = 'patients';

SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @db_name 
      AND TABLE_NAME = @table_name 
      AND COLUMN_NAME = @column_name
);

SET @sql = IF(@col_exists > 0,
    'ALTER TABLE patients MODIFY COLUMN profile_picture TEXT',
    'ALTER TABLE patients ADD COLUMN profile_picture TEXT AFTER insurance_number'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Note: Doctors table doesn't have profile_picture column
-- Doctors use the profile_picture from the users table (via user_id foreign key)
