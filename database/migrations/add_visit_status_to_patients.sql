-- Migration: Add visit_status column to patients table
-- This adds a visit status field to track patient visit progress
-- Date: 2026-02-19

-- Add visit_status column with ENUM values
ALTER TABLE patients 
ADD COLUMN visit_status ENUM('arrived', 'waiting', 'in-room', 'completed') 
DEFAULT 'waiting' 
AFTER is_active;

-- Add index for better query performance
CREATE INDEX idx_visit_status ON patients(visit_status);

-- Update existing patients to have 'completed' status if they have appointments
UPDATE patients p
LEFT JOIN appointments a ON p.patient_id = a.patient_id AND a.status = 'completed'
SET p.visit_status = CASE 
    WHEN a.appointment_id IS NOT NULL THEN 'completed'
    ELSE 'waiting'
END;

-- Add comment to column
ALTER TABLE patients MODIFY COLUMN visit_status ENUM('arrived', 'waiting', 'in-room', 'completed') 
DEFAULT 'waiting' 
COMMENT 'Current visit status: arrived (red), waiting (yellow), in-room (green), completed (grey)';
