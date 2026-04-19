-- ============================================================================
-- INDEPENDENT TAGGING SYSTEM MIGRATION (MariaDB Compatible)
-- Creates a flexible tagging system that can be used across all entities
-- ============================================================================

-- 1. Create independent tags table
CREATE TABLE IF NOT EXISTS tags (
    tag_id INT AUTO_INCREMENT PRIMARY KEY,
    tag_name VARCHAR(100) NOT NULL UNIQUE,
    tag_color VARCHAR(7) DEFAULT '#80399a',
    description TEXT,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    INDEX idx_tag_name (tag_name),
    INDEX idx_usage_count (usage_count),
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add tags column to patients table (JSON array of tag IDs) - only if not exists
SET @dbname = DATABASE();
SET @tablename = 'patients';
SET @columnname = 'tags';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' JSON DEFAULT NULL COMMENT ''Array of tag IDs assigned to this patient''')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 3. Insert some default tags
INSERT INTO tags (tag_name, tag_color, description) VALUES
('VIP', '#FF6B6B', 'VIP patients requiring special attention'),
('Regular', '#4ECDC4', 'Regular patients'),
('Follow-up Required', '#FFD93D', 'Patients requiring follow-up'),
('Chronic Condition', '#95E1D3', 'Patients with chronic conditions'),
('Emergency Contact', '#F38181', 'Emergency contact required'),
('Insurance Pending', '#AA96DA', 'Insurance verification pending'),
('Payment Plan', '#FCBAD3', 'On payment plan'),
('Referral', '#A8D8EA', 'Referred by another doctor')
ON DUPLICATE KEY UPDATE tag_name = tag_name;

-- ============================================================================
-- END OF TAGGING SYSTEM MIGRATION
-- ============================================================================
