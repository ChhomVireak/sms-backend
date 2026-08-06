-- ============================================================================
-- Migration: 002_fee_schedules_billing_plan.sql
-- Description: Group fee_schedules alternative billing options & add student payment_plan
-- System: EduTrack SMS (MySQL / sms_db)
-- ============================================================================

SET @dbname = DATABASE();

-- Step A: Add billing_plan_group column to fee_schedules
SET @preparedStatement1 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = "fee_schedules" AND COLUMN_NAME = "billing_plan_group"
  ) > 0,
  "SELECT 1",
  "ALTER TABLE fee_schedules ADD COLUMN billing_plan_group VARCHAR(50) DEFAULT NULL AFTER program_id;"
));
PREPARE stmt1 FROM @preparedStatement1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- Step B: Add plan_type column to fee_schedules
SET @preparedStatement2 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = "fee_schedules" AND COLUMN_NAME = "plan_type"
  ) > 0,
  "SELECT 1",
  "ALTER TABLE fee_schedules ADD COLUMN plan_type ENUM('SEMESTER','FULL_YEAR') DEFAULT 'SEMESTER' AFTER billing_plan_group;"
));
PREPARE stmt2 FROM @preparedStatement2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Step C: Add payment_plan column to students
SET @preparedStatement3 = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = "students" AND COLUMN_NAME = "payment_plan"
  ) > 0,
  "SELECT 1",
  "ALTER TABLE students ADD COLUMN payment_plan ENUM('SEMESTER','FULL_YEAR') DEFAULT 'SEMESTER' AFTER program_id;"
));
PREPARE stmt3 FROM @preparedStatement3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- Step D: BACKFILL existing fee_schedules rows
UPDATE fee_schedules
SET plan_type = CASE 
  WHEN LOWER(term_cycle) LIKE '%year%' OR LOWER(fee_title) LIKE '%full year%' OR LOWER(semester_name) LIKE '%full year%' THEN 'FULL_YEAR'
  ELSE 'SEMESTER'
END;

UPDATE fee_schedules
SET billing_plan_group = CONCAT(
  'GROUP-', 
  COALESCE(program_id, 'ALL'), 
  '-', 
  REPLACE(COALESCE(academic_year, 'Y1'), ' ', '')
)
WHERE billing_plan_group IS NULL;

-- Step E: BACKFILL existing students payment_plan
UPDATE students 
SET payment_plan = 'SEMESTER' 
WHERE payment_plan IS NULL;
