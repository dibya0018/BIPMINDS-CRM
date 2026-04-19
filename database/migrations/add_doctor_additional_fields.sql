-- Migration: Add additional fields to doctors table and users table
-- Adds: languages_known, gender to users, display_in_list to doctors
-- Date: 2026-01-30

-- Add gender to users table if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'other') DEFAULT NULL AFTER phone;

-- Add languages_known to doctors table (JSON array of languages)
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS languages_known JSON DEFAULT NULL AFTER bio;

-- Add display_in_list to doctors table (controls if doctor appears in public listings)
ALTER TABLE doctors 
ADD COLUMN IF NOT EXISTS display_in_list BOOLEAN DEFAULT TRUE AFTER languages_known;

-- Update profile_picture in users to TEXT if it's VARCHAR
ALTER TABLE users 
MODIFY COLUMN profile_picture TEXT;
