-- Migration: Update profile_picture columns from VARCHAR(500) to TEXT
-- Run this in phpMyAdmin SQL tab
-- Date: 2026-01-30
-- This changes the column type to support larger base64 images

-- Update users table profile_picture column
ALTER TABLE users 
MODIFY COLUMN profile_picture TEXT;

-- Update patients table profile_picture column
ALTER TABLE patients 
MODIFY COLUMN profile_picture TEXT;
