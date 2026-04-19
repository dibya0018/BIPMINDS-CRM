-- Hospital CRM API - Demo Data Seed
-- This file creates demo data for immediate system usability
-- Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10

-- ============================================================================
-- 1. CREATE DEFAULT ROLES
-- Requirements: 3.7
-- ============================================================================
INSERT INTO roles (role_name, description, is_active) VALUES
('super_admin', 'Super Administrator with full system access', TRUE),
('admin', 'Administrator with management access', TRUE),
('doctor', 'Medical doctor with patient care access', TRUE),
('nurse', 'Nurse with patient care support access', TRUE),
('receptionist', 'Front desk staff with appointment and patient management', TRUE),
('accountant', 'Financial staff with payment and billing access', TRUE)
ON DUPLICATE KEY UPDATE role_name = role_name;

-- ============================================================================
-- 2. CREATE PERMISSIONS FOR ALL RESOURCES
-- Requirements: 3.8
-- ============================================================================
INSERT INTO permissions (permission_name, resource, action, description) VALUES
-- Patient permissions
('patients:create', 'patients', 'create', 'Create new patient records'),
('patients:read', 'patients', 'read', 'View patient records'),
('patients:update', 'patients', 'update', 'Update patient records'),
('patients:delete', 'patients', 'delete', 'Delete patient records'),

-- Appointment permissions
('appointments:create', 'appointments', 'create', 'Create new appointments'),
('appointments:read', 'appointments', 'read', 'View appointments'),
('appointments:update', 'appointments', 'update', 'Update appointments'),
('appointments:delete', 'appointments', 'delete', 'Cancel appointments'),

-- Doctor permissions
('doctors:create', 'doctors', 'create', 'Create doctor profiles'),
('doctors:read', 'doctors', 'read', 'View doctor profiles'),
('doctors:update', 'doctors', 'update', 'Update doctor profiles'),
('doctors:delete', 'doctors', 'delete', 'Delete doctor profiles'),

-- Payment permissions
('payments:create', 'payments', 'create', 'Create payment records'),
('payments:read', 'payments', 'read', 'View payment records'),
('payments:update', 'payments', 'update', 'Update payment records'),
('payments:delete', 'payments', 'delete', 'Delete payment records'),

-- Lead permissions
('leads:create', 'leads', 'create', 'Create lead records'),
('leads:read', 'leads', 'read', 'View lead records'),
('leads:update', 'leads', 'update', 'Update lead records'),
('leads:delete', 'leads', 'delete', 'Delete lead records'),

-- User permissions
('users:create', 'users', 'create', 'Create user accounts'),
('users:read', 'users', 'read', 'View user accounts'),
('users:update', 'users', 'update', 'Update user accounts'),
('users:delete', 'users', 'delete', 'Delete user accounts'),

-- Settings permissions
('settings:create', 'settings', 'create', 'Create system settings'),
('settings:read', 'settings', 'read', 'View system settings'),
('settings:update', 'settings', 'update', 'Update system settings'),
('settings:delete', 'settings', 'delete', 'Delete system settings'),

-- Analytics permissions
('analytics:read', 'analytics', 'read', 'View analytics and reports'),

-- QR Code permissions
('qr:create', 'qr', 'create', 'Generate QR codes'),
('qr:read', 'qr', 'read', 'View QR codes'),
('qr:scan', 'qr', 'scan', 'Scan QR codes')
ON DUPLICATE KEY UPDATE permission_name = permission_name;

-- ============================================================================
-- 3. ASSIGN PERMISSIONS TO ROLES
-- Requirements: 3.9
-- ============================================================================

-- Super Admin: All permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'super_admin'
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- Admin: All permissions except system settings delete
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'admin'
    AND p.permission_name != 'settings:delete'
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- Doctor: Patient, appointment, and analytics access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'doctor'
    AND p.resource IN ('patients', 'appointments', 'analytics', 'qr')
    AND p.action IN ('read', 'update', 'scan')
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- Nurse: Patient and appointment read/update access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'nurse'
    AND p.resource IN ('patients', 'appointments', 'qr')
    AND p.action IN ('read', 'update', 'scan')
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- Receptionist: Patient, appointment, lead, and QR management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'receptionist'
    AND p.resource IN ('patients', 'appointments', 'leads', 'doctors', 'qr')
    AND p.action IN ('create', 'read', 'update', 'scan')
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- Accountant: Payment and analytics access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'accountant'
    AND (
        (p.resource = 'payments' AND p.action IN ('create', 'read', 'update'))
        OR (p.resource = 'analytics' AND p.action = 'read')
        OR (p.resource = 'patients' AND p.action = 'read')
        OR (p.resource = 'appointments' AND p.action = 'read')
    )
ON DUPLICATE KEY UPDATE role_permissions.role_id = role_permissions.role_id;

-- ============================================================================
-- 4. CREATE SUPER ADMIN USER
-- Requirements: 3.1, 3.2
-- Password: Admin@123 (hashed with bcrypt, 12 rounds)
-- ============================================================================
INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    phone,
    user_type,
    is_active
) VALUES (
    'admin@hospital.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7LjT.NSHoy',
    'System',
    'Administrator',
    '9876543210',
    'admin',
    TRUE
)
ON DUPLICATE KEY UPDATE email = email;

-- Assign super_admin role to admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'admin@hospital.com'
    AND r.role_name = 'super_admin'
ON DUPLICATE KEY UPDATE user_roles.user_id = user_roles.user_id;

-- ============================================================================
-- 5. CREATE DEMO DOCTOR USER AND PROFILE
-- Requirements: 3.3
-- ============================================================================
INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    phone,
    user_type,
    is_active
) VALUES (
    'dr.sharma@hospital.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7LjT.NSHoy',
    'Rajesh',
    'Sharma',
    '9876543211',
    'doctor',
    TRUE
)
ON DUPLICATE KEY UPDATE email = email;

-- Assign doctor role
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'dr.sharma@hospital.com'
    AND r.role_name = 'doctor'
ON DUPLICATE KEY UPDATE user_roles.user_id = user_roles.user_id;

-- Create doctor profile
INSERT INTO doctors (
    user_id,
    doctor_code,
    specialization,
    qualification,
    experience_years,
    license_number,
    consultation_fee,
    department,
    available_days,
    available_time_start,
    available_time_end,
    max_patients_per_day,
    rating,
    total_patients,
    bio,
    is_available
)
SELECT 
    u.user_id,
    'D-000001',
    'Cardiology',
    'MBBS, MD (Cardiology), Fellowship in Interventional Cardiology',
    15,
    'MCI-12345-2008',
    1500.00,
    'Cardiology',
    '["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]',
    '09:00:00',
    '17:00:00',
    20,
    4.75,
    0,
    'Dr. Rajesh Sharma is a highly experienced cardiologist with over 15 years of practice. He specializes in interventional cardiology and has performed over 5000 successful procedures.',
    TRUE
FROM users u
WHERE u.email = 'dr.sharma@hospital.com'
ON DUPLICATE KEY UPDATE doctor_code = doctor_code;

-- ============================================================================
-- 6. CREATE DEMO PATIENT
-- Requirements: 3.4
-- ============================================================================
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
    is_active,
    created_by
)
SELECT 
    'P-000001',
    'Priya',
    'Patel',
    '1985-06-15',
    'female',
    'O+',
    '9876543212',
    'priya.patel@email.com',
    '123 MG Road, Koramangala',
    'Bangalore',
    'Karnataka',
    '560034',
    'Amit Patel',
    '9876543213',
    'Husband',
    'Hypertension diagnosed in 2018. Regular checkups maintained.',
    'Penicillin',
    'Amlodipine 5mg once daily',
    'Star Health Insurance',
    'SHI-2023-456789',
    TRUE,
    u.user_id
FROM users u
WHERE u.email = 'admin@hospital.com'
ON DUPLICATE KEY UPDATE patient_code = patient_code;

-- ============================================================================
-- 7. CREATE QR CODE FOR DEMO PATIENT
-- Requirements: 3.4
-- ============================================================================
INSERT INTO qr_codes (
    patient_id,
    qr_code_data,
    qr_code_image_url,
    scan_count,
    is_active
)
SELECT 
    p.patient_id,
    'ENCRYPTED_QR_DATA_PLACEHOLDER',
    '/qr-codes/P-000001.png',
    0,
    TRUE
FROM patients p
WHERE p.patient_code = 'P-000001'
ON DUPLICATE KEY UPDATE qr_codes.patient_id = qr_codes.patient_id;

-- ============================================================================
-- 8. CREATE DEMO APPOINTMENT
-- Requirements: 3.5
-- ============================================================================
INSERT INTO appointments (
    appointment_code,
    patient_id,
    doctor_id,
    appointment_date,
    appointment_time,
    appointment_type,
    status,
    reason,
    duration_minutes,
    created_by
)
SELECT 
    'A-000001',
    p.patient_id,
    d.doctor_id,
    DATE_ADD(CURDATE(), INTERVAL 2 DAY),
    '10:00:00',
    'consultation',
    'confirmed',
    'Regular cardiac checkup and blood pressure monitoring',
    30,
    u.user_id
FROM patients p
CROSS JOIN doctors d
CROSS JOIN users u
WHERE p.patient_code = 'P-000001'
    AND d.doctor_code = 'D-000001'
    AND u.email = 'admin@hospital.com'
ON DUPLICATE KEY UPDATE appointment_code = appointment_code;

-- ============================================================================
-- 9. CREATE DEMO PAYMENT
-- Requirements: 3.6
-- ============================================================================
INSERT INTO payments (
    invoice_number,
    patient_id,
    appointment_id,
    amount,
    tax_amount,
    discount_amount,
    total_amount,
    payment_method,
    payment_status,
    payment_date,
    description,
    created_by
)
SELECT 
    'INV-000001',
    p.patient_id,
    a.appointment_id,
    1500.00,
    270.00,
    0.00,
    1770.00,
    'card',
    'paid',
    NOW(),
    'Consultation fee for cardiac checkup',
    u.user_id
FROM patients p
CROSS JOIN appointments a
CROSS JOIN users u
WHERE p.patient_code = 'P-000001'
    AND a.appointment_code = 'A-000001'
    AND u.email = 'admin@hospital.com'
ON DUPLICATE KEY UPDATE invoice_number = invoice_number;

-- ============================================================================
-- 10. CREATE DEMO LEAD
-- Requirements: 3.7
-- ============================================================================
INSERT INTO leads (
    lead_code,
    first_name,
    last_name,
    phone,
    email,
    source,
    status,
    priority,
    interested_in,
    notes,
    follow_up_date,
    assigned_to
)
SELECT 
    'L-000001',
    'Rahul',
    'Kumar',
    '9876543214',
    'rahul.kumar@email.com',
    'website',
    'new',
    'high',
    'Orthopedic consultation',
    'Interested in knee replacement surgery. Requested callback.',
    DATE_ADD(CURDATE(), INTERVAL 1 DAY),
    u.user_id
FROM users u
WHERE u.email = 'admin@hospital.com'
ON DUPLICATE KEY UPDATE lead_code = lead_code;

-- ============================================================================
-- 11. CREATE DEMO RECEPTIONIST USER
-- Requirements: 3.10
-- ============================================================================
INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    phone,
    user_type,
    is_active
) VALUES (
    'reception@hospital.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7LjT.NSHoy',
    'Anjali',
    'Reddy',
    '9876543215',
    'receptionist',
    TRUE
)
ON DUPLICATE KEY UPDATE email = email;

-- Assign receptionist role
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'reception@hospital.com'
    AND r.role_name = 'receptionist'
ON DUPLICATE KEY UPDATE user_roles.user_id = user_roles.user_id;

-- ============================================================================
-- 12. CREATE DEMO ACCOUNTANT USER
-- Requirements: 3.10
-- ============================================================================
INSERT INTO users (
    email,
    password_hash,
    first_name,
    last_name,
    phone,
    user_type,
    is_active
) VALUES (
    'accounts@hospital.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5NU7LjT.NSHoy',
    'Suresh',
    'Iyer',
    '9876543216',
    'staff',
    TRUE
)
ON DUPLICATE KEY UPDATE email = email;

-- Assign accountant role
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'accounts@hospital.com'
    AND r.role_name = 'accountant'
ON DUPLICATE KEY UPDATE user_roles.user_id = user_roles.user_id;

-- ============================================================================
-- END OF SEED DATA
-- ============================================================================

-- Summary of demo credentials:
-- Super Admin: admin@hospital.com / Admin@123
-- Doctor: dr.sharma@hospital.com / Admin@123
-- Receptionist: reception@hospital.com / Admin@123
-- Accountant: accounts@hospital.com / Admin@123
