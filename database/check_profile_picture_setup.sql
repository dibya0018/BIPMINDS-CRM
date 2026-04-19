-- Check if profile_picture column exists and its type
-- Run this to verify the database setup

-- Check users table
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users' 
  AND COLUMN_NAME = 'profile_picture';

-- Check patients table
SELECT 
    COLUMN_NAME, 
    DATA_TYPE, 
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'patients' 
  AND COLUMN_NAME = 'profile_picture';

-- Check stored procedure parameters
SELECT 
    PARAMETER_NAME,
    PARAMETER_MODE,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.PARAMETERS
WHERE SPECIFIC_SCHEMA = DATABASE()
  AND SPECIFIC_NAME = 'sp_create_patient'
  AND PARAMETER_NAME = 'p_profile_picture';
