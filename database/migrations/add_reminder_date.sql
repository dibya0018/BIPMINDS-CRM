-- ============================================================================
-- ADD REMINDER DATE TO REMINDERS
-- Adds reminder_date field to store the specific date for the reminder
-- ============================================================================

-- Add reminder_date column
ALTER TABLE reminders
ADD COLUMN reminder_date DATE DEFAULT NULL AFTER reminder_time,
ADD INDEX idx_reminder_date (reminder_date);

-- Update existing reminders to set reminder_date to next_trigger_date if available
UPDATE reminders 
SET reminder_date = next_trigger_date 
WHERE reminder_date IS NULL AND next_trigger_date IS NOT NULL;

-- ============================================================================
-- USAGE:
-- 
-- For one-time reminders:
--   reminder_date = specific date (e.g., '2024-03-15')
--   reminder_time = specific time (e.g., '14:00')
--
-- For recurring reminders:
--   reminder_date = start date or next occurrence
--   reminder_time = time of day
--   recurrence = daily/weekly/monthly
-- ============================================================================

