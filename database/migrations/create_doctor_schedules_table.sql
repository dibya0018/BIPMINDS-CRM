-- ============================================================================
-- Doctor Schedules Table Migration
-- Creates a new table for flexible doctor scheduling
-- Allows different schedules for different days of the week
-- ============================================================================

-- Create doctor_schedules table
CREATE TABLE IF NOT EXISTS doctor_schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    day_of_week ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_doctor_id (doctor_id),
    INDEX idx_day_of_week (day_of_week),
    INDEX idx_is_active (is_active),
    INDEX idx_doctor_day_active (doctor_id, day_of_week, is_active),
    UNIQUE KEY unique_doctor_day (doctor_id, day_of_week),
    
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Migrate existing data from doctors table to doctor_schedules table
-- ============================================================================

INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, is_active)
SELECT 
    d.doctor_id,
    day.day_name,
    d.available_time_start,
    d.available_time_end,
    d.is_available
FROM doctors d
CROSS JOIN (
    SELECT 'Monday' as day_name UNION ALL
    SELECT 'Tuesday' UNION ALL
    SELECT 'Wednesday' UNION ALL
    SELECT 'Thursday' UNION ALL
    SELECT 'Friday' UNION ALL
    SELECT 'Saturday' UNION ALL
    SELECT 'Sunday'
) day
WHERE d.available_days IS NOT NULL
    AND JSON_CONTAINS(d.available_days, JSON_QUOTE(day.day_name))
    AND d.available_time_start IS NOT NULL
    AND d.available_time_end IS NOT NULL
ON DUPLICATE KEY UPDATE
    start_time = VALUES(start_time),
    end_time = VALUES(end_time),
    is_active = VALUES(is_active),
    updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- Note: Keep old columns in doctors table for backward compatibility
-- They can be dropped later after verifying the migration:
-- 
-- ALTER TABLE doctors DROP COLUMN available_days;
-- ALTER TABLE doctors DROP COLUMN available_time_start;
-- ALTER TABLE doctors DROP COLUMN available_time_end;
-- ============================================================================
