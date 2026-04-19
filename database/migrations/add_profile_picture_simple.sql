-- Migration: Add profile_picture columns (Simple Version)
-- Use this if the dynamic version doesn't work
-- Date: 2026-01-30

-- Add profile_picture to users table (if it doesn't exist)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS profile_picture TEXT AFTER user_type;

-- If the above fails, use this instead:
-- ALTER TABLE users ADD COLUMN profile_picture TEXT AFTER user_type;

-- Add profile_picture to patients table (if it doesn't exist)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS profile_picture TEXT AFTER insurance_number;

-- If the above fails, use this instead:
-- ALTER TABLE patients ADD COLUMN profile_picture TEXT AFTER insurance_number;

-- Note: If column already exists but is VARCHAR(500), run this to change it:
-- ALTER TABLE users MODIFY COLUMN profile_picture TEXT;
-- ALTER TABLE patients MODIFY COLUMN profile_picture TEXT;
