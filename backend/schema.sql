CREATE TABLE IF NOT EXISTS app_records (
    collection_name VARCHAR(64) NOT NULL,
    record_id VARCHAR(191) NOT NULL,
    record_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_name, record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backend_migrations (
    migration_key VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS id_sequences (
    sequence_name VARCHAR(100) NOT NULL PRIMARY KEY,
    current_value INT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS appointments (
    appointment_id VARCHAR(32) NOT NULL PRIMARY KEY,
    reference_number VARCHAR(16) NULL,
    patient_id VARCHAR(32) NULL,
    clinic_id VARCHAR(32) NULL,
    staff_id VARCHAR(32) NULL,
    slot_id VARCHAR(32) NULL,
    appointment_date VARCHAR(10) NULL,
    appointment_time VARCHAR(16) NULL,
    service_name VARCHAR(255) NULL,
    appointment_status VARCHAR(64) NULL,
    booked_at VARCHAR(40) NULL,
    record_json JSON NOT NULL,
    INDEX idx_appointments_patient (patient_id),
    INDEX idx_appointments_clinic (clinic_id),
    INDEX idx_appointments_date (appointment_date),
    INDEX idx_appointments_status (appointment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW clinic_directory AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_name')) AS clinic_name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.representative_name')) AS representative_name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.email')) AS email,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.contact_number')) AS contact_number,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.address')) AS address,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.barangay')) AS barangay,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.city')) AS city,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.province')) AS province,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.approval_status')) AS approval_status,
    JSON_EXTRACT(record_json, '$.verified') AS verified,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_status')) AS clinic_status,
    created_at AS saved_at
FROM app_records
WHERE collection_name = 'clinics';

CREATE OR REPLACE VIEW user_accounts AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.user_id')) AS user_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.name')) AS name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.role')) AS role,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.email')) AS email,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.mobile_number')) AS mobile_number,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.account_status')) AS account_status,
    created_at AS saved_at
FROM app_records
WHERE collection_name = 'users';

CREATE OR REPLACE VIEW clinic_staff AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.staff_id')) AS staff_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.staff_name')) AS staff_name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.staff_role')) AS staff_role,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.specialty_name')) AS specialty_name,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.duty_status')) AS duty_status,
    JSON_EXTRACT(record_json, '$.active') AS active,
    JSON_EXTRACT(record_json, '$.assigned_services') AS assigned_services,
    created_at AS saved_at,
    record_json
FROM app_records
WHERE collection_name = 'staff';

CREATE OR REPLACE VIEW notifications AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.notification_id')) AS notification_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.recipient_id')) AS recipient_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.notification_type')) AS notification_type,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.message')) AS message,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.reference_type')) AS reference_type,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.reference_id')) AS reference_id,
    JSON_EXTRACT(record_json, '$.read') AS is_read,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.created_at')) AS created_at,
    record_json
FROM app_records
WHERE collection_name = 'notifications';

CREATE OR REPLACE VIEW feedback AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.feedback_id')) AS feedback_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.appointment_id')) AS appointment_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.patient_id')) AS patient_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_EXTRACT(record_json, '$.rating') AS rating,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.comment')) AS comment,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.created_at')) AS submitted_at,
    record_json
FROM app_records
WHERE collection_name = 'feedback';

CREATE OR REPLACE VIEW schedules AS
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.schedule_id')) AS schedule_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.clinic_id')) AS clinic_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.staff_id')) AS staff_id,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.weekday')) AS weekday,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.start_time')) AS start_time,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.end_time')) AS end_time,
    JSON_UNQUOTE(JSON_EXTRACT(record_json, '$.availability_status')) AS availability_status,
    record_json
FROM app_records
WHERE collection_name = 'schedules';
