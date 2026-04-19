-- Migration: Add gender column to doctors table
-- Date: 2026-01-30
-- Description: Adds gender column to doctors table to store doctor's gender
-- Note: Gender is also stored in users table, but adding to doctors table for direct access

-- Add gender column to doctors table
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'other') DEFAULT NULL AFTER department;

-- If the column already exists but needs to be updated, use this instead:
-- ALTER TABLE doctors MODIFY COLUMN gender ENUM('male', 'female', 'other') DEFAULT NULL;
