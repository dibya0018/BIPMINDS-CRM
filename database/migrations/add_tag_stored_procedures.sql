-- ============================================================================
-- TAG SYSTEM STORED PROCEDURES
-- Adds stored procedures for tag management operations
-- ============================================================================

-- ============================================================================
-- 1. sp_SearchTags
-- Search tags by name for autocomplete (Elasticsearch-ready fallback)
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_SearchTags;

DELIMITER $$

CREATE PROCEDURE sp_SearchTags(
    IN p_search_term VARCHAR(100),
    IN p_limit INT
)
BEGIN
    IF p_search_term = '' OR p_search_term IS NULL THEN
        -- Return all tags ordered by usage
        SELECT 
            tag_id,
            tag_name,
            tag_color,
            description,
            usage_count,
            created_at,
            updated_at
        FROM tags
        ORDER BY usage_count DESC, tag_name ASC
        LIMIT p_limit;
    ELSE
        -- Search tags by name
        SELECT 
            tag_id,
            tag_name,
            tag_color,
            description,
            usage_count,
            created_at,
            updated_at
        FROM tags
        WHERE tag_name LIKE CONCAT('%', p_search_term, '%')
        ORDER BY 
            CASE 
                WHEN tag_name LIKE CONCAT(p_search_term, '%') THEN 1
                WHEN tag_name LIKE CONCAT('%', p_search_term, '%') THEN 2
                ELSE 3
            END,
            usage_count DESC,
            tag_name ASC
        LIMIT p_limit;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- 2. sp_AssignPatientTag
-- Assign a tag to a patient (creates tag if doesn't exist)
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_AssignPatientTag;

DELIMITER $$

CREATE PROCEDURE sp_AssignPatientTag(
    IN p_patient_id INT,
    IN p_tag_name VARCHAR(100),
    IN p_tag_color VARCHAR(7),
    IN p_created_by INT,
    OUT p_tag_id INT,
    OUT p_is_new_tag BOOLEAN
)
BEGIN
    DECLARE v_existing_tag_id INT DEFAULT NULL;
    DECLARE v_current_tags JSON;
    DECLARE v_tag_exists_in_patient BOOLEAN DEFAULT FALSE;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_tag_id = NULL;
        SET p_is_new_tag = FALSE;
    END;
    
    START TRANSACTION;
    
    -- Check if tag exists
    SELECT tag_id INTO v_existing_tag_id
    FROM tags
    WHERE tag_name = p_tag_name
    LIMIT 1;
    
    IF v_existing_tag_id IS NULL THEN
        -- Create new tag
        INSERT INTO tags (tag_name, tag_color, created_by, usage_count)
        VALUES (p_tag_name, p_tag_color, p_created_by, 1);
        
        SET p_tag_id = LAST_INSERT_ID();
        SET p_is_new_tag = TRUE;
    ELSE
        -- Use existing tag
        SET p_tag_id = v_existing_tag_id;
        SET p_is_new_tag = FALSE;
    END IF;
    
    -- Get current patient tags
    SELECT COALESCE(tags, JSON_ARRAY()) INTO v_current_tags
    FROM patients
    WHERE patient_id = p_patient_id;
    
    -- Check if tag already assigned to patient
    IF JSON_CONTAINS(v_current_tags, CAST(p_tag_id AS JSON), '$') THEN
        SET v_tag_exists_in_patient = TRUE;
    ELSE
        SET v_tag_exists_in_patient = FALSE;
    END IF;
    
    -- Add tag to patient if not already assigned
    IF NOT v_tag_exists_in_patient THEN
        UPDATE patients
        SET tags = JSON_ARRAY_APPEND(COALESCE(tags, JSON_ARRAY()), '$', p_tag_id)
        WHERE patient_id = p_patient_id;
        
        -- Increment usage count only if newly assigned
        UPDATE tags
        SET usage_count = usage_count + 1
        WHERE tag_id = p_tag_id;
    END IF;
    
    COMMIT;
END$$

DELIMITER ;

-- ============================================================================
-- 3. sp_RemovePatientTag
-- Remove a tag from a patient
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_RemovePatientTag;

DELIMITER $$

CREATE PROCEDURE sp_RemovePatientTag(
    IN p_patient_id INT,
    IN p_tag_id INT
)
BEGIN
    DECLARE v_current_tags JSON;
    DECLARE v_new_tags JSON;
    DECLARE v_tag_index INT DEFAULT -1;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;
    
    START TRANSACTION;
    
    -- Get current patient tags
    SELECT COALESCE(tags, JSON_ARRAY()) INTO v_current_tags
    FROM patients
    WHERE patient_id = p_patient_id;
    
    -- Find tag index in array
    SET v_tag_index = JSON_SEARCH(v_current_tags, 'one', CAST(p_tag_id AS CHAR));
    
    -- Remove tag if found
    IF v_tag_index IS NOT NULL THEN
        -- Extract the index number from the path (e.g., "$[0]" -> 0)
        SET v_tag_index = CAST(SUBSTRING(v_tag_index, 3, LENGTH(v_tag_index) - 3) AS UNSIGNED);
        
        -- Remove the tag at the found index
        UPDATE patients
        SET tags = JSON_REMOVE(tags, CONCAT('$[', v_tag_index, ']'))
        WHERE patient_id = p_patient_id;
        
        -- Decrement usage count
        UPDATE tags
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE tag_id = p_tag_id;
    END IF;
    
    COMMIT;
END$$

DELIMITER ;

-- ============================================================================
-- 4. sp_GetPatientTags
-- Get all tags assigned to a patient with full tag details
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_GetPatientTags;

DELIMITER $$

CREATE PROCEDURE sp_GetPatientTags(
    IN p_patient_id INT
)
BEGIN
    SELECT 
        t.tag_id,
        t.tag_name,
        t.tag_color,
        t.description,
        t.usage_count,
        t.created_at,
        t.updated_at
    FROM tags t
    INNER JOIN (
        SELECT 
            JSON_UNQUOTE(JSON_EXTRACT(tags, CONCAT('$[', idx, ']'))) AS tag_id
        FROM patients
        CROSS JOIN (
            SELECT 0 AS idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
        ) AS indices
        WHERE patient_id = p_patient_id
            AND tags IS NOT NULL
            AND JSON_LENGTH(tags) > idx
    ) AS patient_tags ON t.tag_id = CAST(patient_tags.tag_id AS UNSIGNED)
    ORDER BY t.tag_name ASC;
END$$

DELIMITER ;

-- ============================================================================
-- END OF TAG STORED PROCEDURES
-- ============================================================================

