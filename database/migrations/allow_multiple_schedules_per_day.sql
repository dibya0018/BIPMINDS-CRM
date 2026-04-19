-- ============================================================================
-- Allow Multiple Schedules Per Day Migration
-- Removes unique constraint to allow doctors to have multiple schedules
-- per day (e.g., morning shift, evening shift, split schedules)
-- ============================================================================

-- Drop the unique constraint that prevents multiple schedules per day
ALTER TABLE doctor_schedules 
DROP INDEX unique_doctor_day;

-- Add a composite index for better query performance
-- This allows multiple schedules per day while maintaining good performance
ALTER TABLE doctor_schedules
ADD INDEX idx_doctor_day_time (doctor_id, day_of_week, start_time, end_time);

-- ============================================================================
-- Note: After this migration, doctors can have multiple schedules per day
-- Example use cases:
-- - Morning shift: 9:00 AM - 1:00 PM
-- - Evening shift: 5:00 PM - 9:00 PM
-- - Split shifts with lunch breaks
-- - Different session types (consultation, surgery, emergency)
-- ============================================================================

