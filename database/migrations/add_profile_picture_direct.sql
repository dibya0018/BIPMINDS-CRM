-- Migration: Update profile_picture columns to TEXT type
-- Run this in phpMyAdmin SQL tab
-- Date: 2026-01-30
-- Note: Column already exists, just need to change type from VARCHAR(500) to TEXT

-- Update users table profile_picture column to TEXT
ALTER TABLE users 
MODIFY COLUMN profile_picture TEXT;

-- Update patients table profile_picture column to TEXT
ALTER TABLE patients 
MODIFY COLUMN profile_picture TEXT;
