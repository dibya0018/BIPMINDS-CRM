-- Hospital CRM API - Stored Procedures
-- This file defines all stored procedures for business logic
-- Requirements: 2.5, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7

-- ============================================================================
-- 1. sp_user_login
-- Authenticates a user and creates a session
-- Requirements: 19.1
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_user_login;
CREATE PROCEDURE sp_user_login(
    IN p_email VARCHAR(255),
    OUT p_user_id INT,
    OUT p_password_hash VARCHAR(255),
    OUT p_first_name VARCHAR(100),
    OUT p_last_name VARCHAR(100),
    OUT p_user_type VARCHAR(20),
    OUT p_is_active BOOLEAN
)
BEGIN
    SELECT 
        user_id,
        password_hash,
        first_name,
        last_name,
        user_type,
        is_active
    INTO 
        p_user_id,
        p_password_hash,
        p_first_name,
        p_last_name,
        p_user_type,
        p_is_active
    FROM users
    WHERE email = p_email;
    
    -- Update last_login timestamp if user found
    IF p_user_id IS NOT NULL THEN
        UPDATE users 
        SET last_login = NOW() 
        WHERE user_id = p_user_id;
    END IF;
END;

-- ============================================================================
-- 2. sp_user_logout
-- Invalidates a user session
-- Requirements: 19.2
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_user_logout;
CREATE PROCEDURE sp_user_logout(
    IN p_session_id VARCHAR(255)
)
BEGIN
    DELETE FROM sessions 
    WHERE session_id = p_session_id;
END;

-- ============================================================================
-- 3. sp_create_patient
-- Creates a new patient record with validation
-- Requirements: 19.3
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_create_patient;
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
        p_created_by
    );
    
    SET p_patient_id = LAST_INSERT_ID();
    
    COMMIT;
END;

-- ============================================================================
-- 4. sp_get_patient_by_id
-- Retrieves patient details by ID with appointment count and last visit
-- Requirements: 19.4
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_get_patient_by_id;
CREATE PROCEDURE sp_get_patient_by_id(
    IN p_patient_id INT
)
BEGIN
    SELECT 
        p.*,
        COUNT(DISTINCT a.appointment_id) as appointment_count,
        MAX(a.appointment_date) as last_visit_date
    FROM patients p
    LEFT JOIN appointments a ON p.patient_id = a.patient_id 
        AND a.status IN ('completed', 'confirmed')
    WHERE p.patient_id = p_patient_id
    GROUP BY p.patient_id;
END;

-- ============================================================================
-- 5. sp_get_patient_by_qr
-- Retrieves patient details by QR code scan
-- Requirements: 19.5
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_get_patient_by_qr;
CREATE PROCEDURE sp_get_patient_by_qr(
    IN p_patient_id INT
)
BEGIN
    -- Update QR code scan statistics
    UPDATE qr_codes 
    SET 
        scan_count = scan_count + 1,
        last_scanned_at = NOW()
    WHERE patient_id = p_patient_id;
    
    -- Return patient details
    SELECT 
        p.*,
        COUNT(DISTINCT a.appointment_id) as appointment_count,
        MAX(a.appointment_date) as last_visit_date,
        qr.scan_count,
        qr.last_scanned_at
    FROM patients p
    LEFT JOIN appointments a ON p.patient_id = a.patient_id 
        AND a.status IN ('completed', 'confirmed')
    LEFT JOIN qr_codes qr ON p.patient_id = qr.patient_id
    WHERE p.patient_id = p_patient_id
    GROUP BY p.patient_id;
END;

-- ============================================================================
-- 6. sp_create_appointment
-- Creates a new appointment with conflict checking
-- Requirements: 19.6
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_create_appointment;
CREATE PROCEDURE sp_create_appointment(
    IN p_appointment_code VARCHAR(20),
    IN p_patient_id INT,
    IN p_doctor_id INT,
    IN p_appointment_date DATE,
    IN p_appointment_time TIME,
    IN p_appointment_type VARCHAR(20),
    IN p_reason TEXT,
    IN p_duration_minutes INT,
    IN p_created_by INT,
    OUT p_appointment_id INT,
    OUT p_conflict_exists BOOLEAN
)
BEGIN
    DECLARE v_conflict_count INT DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_appointment_id = NULL;
    END;
    
    START TRANSACTION;
    
    -- Check for appointment conflicts
    SELECT COUNT(*) INTO v_conflict_count
    FROM appointments
    WHERE doctor_id = p_doctor_id
        AND appointment_date = p_appointment_date
        AND appointment_time = p_appointment_time
        AND status NOT IN ('cancelled', 'no-show');
    
    IF v_conflict_count > 0 THEN
        SET p_conflict_exists = TRUE;
        SET p_appointment_id = NULL;
        ROLLBACK;
    ELSE
        SET p_conflict_exists = FALSE;
        
        INSERT INTO appointments (
            appointment_code,
            patient_id,
            doctor_id,
            appointment_date,
            appointment_time,
            appointment_type,
            reason,
            duration_minutes,
            created_by
        ) VALUES (
            p_appointment_code,
            p_patient_id,
            p_doctor_id,
            p_appointment_date,
            p_appointment_time,
            p_appointment_type,
            p_reason,
            p_duration_minutes,
            p_created_by
        );
        
        SET p_appointment_id = LAST_INSERT_ID();
        
        COMMIT;
    END IF;
END;

-- ============================================================================
-- 7. sp_create_payment
-- Creates a new payment record with calculation
-- Requirements: 19.7
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_create_payment;
CREATE PROCEDURE sp_create_payment(
    IN p_invoice_number VARCHAR(20),
    IN p_patient_id INT,
    IN p_appointment_id INT,
    IN p_amount DECIMAL(10,2),
    IN p_tax_amount DECIMAL(10,2),
    IN p_discount_amount DECIMAL(10,2),
    IN p_payment_method VARCHAR(20),
    IN p_description TEXT,
    IN p_due_date DATE,
    IN p_created_by INT,
    OUT p_payment_id INT,
    OUT p_total_amount DECIMAL(10,2)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_payment_id = NULL;
    END;
    
    START TRANSACTION;
    
    -- Calculate total amount
    SET p_total_amount = p_amount + p_tax_amount - p_discount_amount;
    
    INSERT INTO payments (
        invoice_number,
        patient_id,
        appointment_id,
        amount,
        tax_amount,
        discount_amount,
        total_amount,
        payment_method,
        description,
        due_date,
        created_by
    ) VALUES (
        p_invoice_number,
        p_patient_id,
        p_appointment_id,
        p_amount,
        p_tax_amount,
        p_discount_amount,
        p_total_amount,
        p_payment_method,
        p_description,
        p_due_date,
        p_created_by
    );
    
    SET p_payment_id = LAST_INSERT_ID();
    
    COMMIT;
END;

-- ============================================================================
-- 8. sp_check_permission
-- Checks if a user has a specific permission
-- Requirements: 19.8
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_check_permission;
CREATE PROCEDURE sp_check_permission(
    IN p_user_id INT,
    IN p_resource VARCHAR(50),
    IN p_action VARCHAR(20),
    OUT p_has_permission BOOLEAN
)
BEGIN
    DECLARE v_permission_count INT DEFAULT 0;
    
    SELECT COUNT(*) INTO v_permission_count
    FROM user_roles ur
    INNER JOIN role_permissions rp ON ur.role_id = rp.role_id
    INNER JOIN permissions p ON rp.permission_id = p.permission_id
    WHERE ur.user_id = p_user_id
        AND p.resource = p_resource
        AND p.action = p_action;
    
    SET p_has_permission = (v_permission_count > 0);
END;

-- ============================================================================
-- 9. sp_get_dashboard_stats
-- Retrieves dashboard statistics
-- Requirements: 19.9
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_get_dashboard_stats;
CREATE PROCEDURE sp_get_dashboard_stats(
    OUT p_total_active_patients INT,
    OUT p_todays_appointments INT,
    OUT p_active_doctors INT,
    OUT p_current_month_revenue DECIMAL(10,2),
    OUT p_pending_leads INT
)
BEGIN
    -- Total active patients
    SELECT COUNT(*) INTO p_total_active_patients
    FROM patients
    WHERE is_active = TRUE;
    
    -- Today's appointments
    SELECT COUNT(*) INTO p_todays_appointments
    FROM appointments
    WHERE appointment_date = CURDATE()
        AND status IN ('pending', 'confirmed');
    
    -- Active doctors
    SELECT COUNT(*) INTO p_active_doctors
    FROM doctors
    WHERE is_available = TRUE;
    
    -- Current month revenue
    SELECT COALESCE(SUM(total_amount), 0) INTO p_current_month_revenue
    FROM payments
    WHERE payment_status = 'paid'
        AND MONTH(payment_date) = MONTH(CURDATE())
        AND YEAR(payment_date) = YEAR(CURDATE());
    
    -- Pending leads
    SELECT COUNT(*) INTO p_pending_leads
    FROM leads
    WHERE status IN ('new', 'contacted', 'qualified');
END;

-- ============================================================================
-- END OF STORED PROCEDURES
-- ============================================================================
