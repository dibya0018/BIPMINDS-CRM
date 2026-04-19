-- Migration: Add profile_picture columns - Step by Step
-- Run each command one at a time in phpMyAdmin SQL tab
-- Date: 2026-01-30

-- STEP 1: Add profile_picture to users table
-- Run this first. If you get "Duplicate column name" error, skip to STEP 2
ALTER TABLE users 
ADD COLUMN profile_picture TEXT AFTER user_type;

-- STEP 2: If STEP 1 gave "Duplicate column name" error, run this instead:
-- ALTER TABLE users MODIFY COLUMN profile_picture TEXT;

-- STEP 3: Add profile_picture to patients table
-- Run this. If you get "Duplicate column name" error, skip to STEP 4
ALTER TABLE patients 
ADD COLUMN profile_picture TEXT AFTER insurance_number;

-- STEP 4: If STEP 3 gave "Duplicate column name" error, run this instead:
-- ALTER TABLE patients MODIFY COLUMN profile_picture TEXT;
