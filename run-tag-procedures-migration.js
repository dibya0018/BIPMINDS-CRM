/**
 * Migration Script: Add Tag Stored Procedures
 * 
 * This script adds the missing stored procedures for the tagging system:
 * - sp_SearchTags: Search tags for autocomplete
 * - sp_AssignPatientTag: Assign tag to patient (creates if doesn't exist)
 * - sp_RemovePatientTag: Remove tag from patient
 * - sp_GetPatientTags: Get all tags for a patient
 */

const { getPool } = require('./config/database');

// Define procedures as separate strings
const procedures = [
  {
    name: 'sp_SearchTags',
    drop: 'DROP PROCEDURE IF EXISTS sp_SearchTags',
    create: `
CREATE PROCEDURE sp_SearchTags(
    IN p_search_term VARCHAR(100),
    IN p_limit INT
)
BEGIN
    IF p_search_term = '' OR p_search_term IS NULL THEN
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
END`
  },
  {
    name: 'sp_AssignPatientTag',
    drop: 'DROP PROCEDURE IF EXISTS sp_AssignPatientTag',
    create: `
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
    
    SELECT tag_id INTO v_existing_tag_id
    FROM tags
    WHERE tag_name = p_tag_name
    LIMIT 1;
    
    IF v_existing_tag_id IS NULL THEN
        INSERT INTO tags (tag_name, tag_color, created_by, usage_count)
        VALUES (p_tag_name, p_tag_color, p_created_by, 1);
        
        SET p_tag_id = LAST_INSERT_ID();
        SET p_is_new_tag = TRUE;
    ELSE
        SET p_tag_id = v_existing_tag_id;
        SET p_is_new_tag = FALSE;
    END IF;
    
    SELECT COALESCE(tags, JSON_ARRAY()) INTO v_current_tags
    FROM patients
    WHERE patient_id = p_patient_id;
    
    SET v_tag_exists_in_patient = JSON_CONTAINS(v_current_tags, CAST(p_tag_id AS CHAR), '$');
    
    IF NOT v_tag_exists_in_patient THEN
        UPDATE patients
        SET tags = JSON_ARRAY_APPEND(COALESCE(tags, JSON_ARRAY()), '$', p_tag_id)
        WHERE patient_id = p_patient_id;
        
        UPDATE tags
        SET usage_count = usage_count + 1
        WHERE tag_id = p_tag_id;
    END IF;
    
    COMMIT;
END`
  },
  {
    name: 'sp_RemovePatientTag',
    drop: 'DROP PROCEDURE IF EXISTS sp_RemovePatientTag',
    create: `
CREATE PROCEDURE sp_RemovePatientTag(
    IN p_patient_id INT,
    IN p_tag_id INT
)
BEGIN
    DECLARE v_current_tags JSON;
    DECLARE v_tag_index VARCHAR(10);
    DECLARE v_index_num INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
    END;
    
    START TRANSACTION;
    
    SELECT COALESCE(tags, JSON_ARRAY()) INTO v_current_tags
    FROM patients
    WHERE patient_id = p_patient_id;
    
    SET v_tag_index = JSON_SEARCH(v_current_tags, 'one', CAST(p_tag_id AS CHAR));
    
    IF v_tag_index IS NOT NULL THEN
        SET v_index_num = CAST(SUBSTRING(v_tag_index, 3, LENGTH(v_tag_index) - 3) AS UNSIGNED);
        
        UPDATE patients
        SET tags = JSON_REMOVE(tags, CONCAT('$[', v_index_num, ']'))
        WHERE patient_id = p_patient_id;
        
        UPDATE tags
        SET usage_count = GREATEST(usage_count - 1, 0)
        WHERE tag_id = p_tag_id;
    END IF;
    
    COMMIT;
END`
  },
  {
    name: 'sp_GetPatientTags',
    drop: 'DROP PROCEDURE IF EXISTS sp_GetPatientTags',
    create: `
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
END`
  }
];

async function runMigration() {
  const pool = getPool();
  let connection;

  try {
    console.log('🚀 Starting tag stored procedures migration...\n');

    connection = await pool.getConnection();
    console.log('✅ Database connection established\n');

    // Execute each procedure
    for (const proc of procedures) {
      try {
        console.log(`⚙️  Creating procedure: ${proc.name}`);
        
        // Drop if exists
        await connection.query(proc.drop);
        console.log(`   🗑️  Dropped existing procedure (if any)`);
        
        // Create procedure
        await connection.query(proc.create);
        console.log(`   ✅ Created successfully\n`);
        
      } catch (error) {
        console.error(`   ❌ Error creating ${proc.name}:`, error.message);
        throw error;
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📋 Created stored procedures:');
    procedures.forEach(proc => console.log(`   - ${proc.name}`));
    console.log('');

    // Verify procedures were created
    const [dbProcedures] = await connection.query(`
      SELECT ROUTINE_NAME 
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_SCHEMA = DATABASE() 
        AND ROUTINE_TYPE = 'PROCEDURE'
        AND ROUTINE_NAME LIKE 'sp_%Tag%'
      ORDER BY ROUTINE_NAME
    `);

    if (dbProcedures.length > 0) {
      console.log('✅ Verification: Found tag-related procedures:');
      dbProcedures.forEach(proc => {
        console.log(`   - ${proc.ROUTINE_NAME}`);
      });
    } else {
      console.log('⚠️  Warning: No tag procedures found in database');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
      console.log('\n🔌 Database connection closed');
    }
    process.exit(0);
  }
}

// Run migration
runMigration();

