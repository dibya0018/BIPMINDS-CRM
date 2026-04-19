-- ============================================================================
-- REMINDERS TABLE MIGRATION
-- Creates reminders table with tag support
-- ============================================================================

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
    reminder_id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(100) NOT NULL,
    purpose TEXT NOT NULL,
    reminder_time TIME NOT NULL,
    recurrence ENUM('once', 'daily', 'weekly', 'monthly') NOT NULL DEFAULT 'once',
    next_trigger_date DATE,
    tags JSON DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    INDEX idx_type (type),
    INDEX idx_recurrence (recurrence),
    INDEX idx_is_active (is_active),
    INDEX idx_next_trigger_date (next_trigger_date),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
