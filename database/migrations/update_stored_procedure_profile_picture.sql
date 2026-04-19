-- Migration: Update sp_create_patient to include profile_picture
-- Date: 2026-01-30

-- Change delimiter to handle semicolons in procedure body
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_create_patient$$

CREATE PROCEDURE sp_create_patient(
    IN p_patient_code VARCHAR(20),
    IN p_first_name VARCHAR(100),
    IN p_last_name VARCHAR(100),
    IN p_date_of_birth DATE,
    IN p_gender VARCHAR(10),
    IN p_blood_group VARCHAR(5),
    IN p_phone VARCHAR(20),
    IN p_email VARCHAR(255),
    IN p_address TEXT,
    IN p_city VARCHAR(100),
    IN p_state VARCHAR(100),
    IN p_zip_code VARCHAR(20),
    IN p_emergency_contact_name VARCHAR(200),
    IN p_emergency_contact_phone VARCHAR(20),
    IN p_emergency_contact_relation VARCHAR(50),
    IN p_medical_history TEXT,
    IN p_allergies TEXT,
    IN p_current_medications TEXT,
    IN p_insurance_provider VARCHAR(200),
    IN p_insurance_number VARCHAR(100),
    IN p_profile_picture TEXT,
    IN p_created_by INT,
    OUT p_patient_id INT
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_patient_id = NULL;
    END;
    
    START TRANSACTION;
    
    INSERT INTO patients (
        patient_code,
        first_name,
        last_name,
        date_of_birth,
        gender,
        blood_group,
        phone,
        email,
        address,
        city,
        state,
        zip_code,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relation,
        medical_history,
        allergies,
        current_medications,
        insurance_provider,
        insurance_number,
        profile_picture,
        created_by
    ) VALUES (
        p_patient_code,
        p_first_name,
        p_last_name,
        p_date_of_birth,
        p_gender,
        p_blood_group,
        p_phone,
        p_email,
        p_address,
        p_city,
        p_state,
        p_zip_code,
        p_emergency_contact_name,
        p_emergency_contact_phone,
        p_emergency_contact_relation,
        p_medical_history,
        p_allergies,
        p_current_medications,
        p_insurance_provider,
        p_insurance_number,
        p_profile_picture,
        p_created_by
    );
    
    SET p_patient_id = LAST_INSERT_ID();
    
    COMMIT;
END$$

-- Reset delimiter back to semicolon
DELIMITER ;
