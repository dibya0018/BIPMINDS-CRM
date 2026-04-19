-- ============================================================================
-- ADD ENTITY REFERENCE TO REMINDERS
-- Allows linking reminders to patients, doctors, appointments, etc.
-- ============================================================================

-- Add entity reference columns
ALTER TABLE reminders
ADD COLUMN entity_type ENUM('patient', 'doctor', 'appointment', 'lead', 'payment', 'general') DEFAULT 'general' AFTER purpose,
ADD COLUMN entity_id INT DEFAULT NULL AFTER entity_type,
ADD COLUMN entity_name VARCHAR(255) DEFAULT NULL AFTER entity_id,
ADD INDEX idx_entity_type (entity_type),
ADD INDEX idx_entity_id (entity_id),
ADD INDEX idx_entity_type_id (entity_type, entity_id);

-- ============================================================================
-- USAGE EXAMPLES:
-- 
-- General reminder (not linked to any entity):
--   entity_type = 'general', entity_id = NULL, entity_name = NULL
--
-- Patient reminder:
--   entity_type = 'patient', entity_id = 123, entity_name = 'John Doe'
--
-- Doctor reminder:
--   entity_type = 'doctor', entity_id = 456, entity_name = 'Dr. Smith'
--
-- Appointment reminder:
--   entity_type = 'appointment', entity_id = 789, entity_name = 'Appointment #789'
-- ============================================================================
