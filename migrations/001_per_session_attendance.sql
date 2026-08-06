-- ============================================================================
-- Migration: 001_per_session_attendance.sql
-- Description: Transition student_attendance table to per-session tracking
-- System: EduTrack SMS
-- ============================================================================

-- UP MIGRATION

-- Add timetable_id column if not exists
SET @dbname = DATABASE();
SET @tablename = "student_attendance";
SET @columnname = "timetable_id";

SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE student_attendance ADD COLUMN timetable_id INT DEFAULT NULL AFTER group_id;"
));

PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add Foreign Key for timetable_id
SET @fkstatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND CONSTRAINT_NAME = "fk_student_attendance_timetable"
  ) > 0,
  "SELECT 1",
  "ALTER TABLE student_attendance ADD CONSTRAINT fk_student_attendance_timetable FOREIGN KEY (timetable_id) REFERENCES timetables(timetable_id) ON DELETE CASCADE;"
));

PREPARE addFk FROM @fkstatement;
EXECUTE addFk;
DEALLOCATE PREPARE addFk;

-- Drop legacy UNIQUE (student_id, date) constraint if exists
SET @dropConstraintStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND CONSTRAINT_NAME = "unique_student_date"
  ) > 0,
  "ALTER TABLE student_attendance DROP INDEX unique_student_date;",
  "SELECT 1"
));

PREPARE dropConstraint FROM @dropConstraintStatement;
EXECUTE dropConstraint;
DEALLOCATE PREPARE dropConstraint;

-- Add new UNIQUE (student_id, timetable_id, date) constraint if not exists
SET @addUniqueStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND CONSTRAINT_NAME = "unique_student_timetable_date"
  ) > 0,
  "SELECT 1",
  "ALTER TABLE student_attendance ADD CONSTRAINT unique_student_timetable_date UNIQUE (student_id, timetable_id, date);"
));

PREPARE addUnique FROM @addUniqueStatement;
EXECUTE addUnique;
DEALLOCATE PREPARE addUnique;

-- DOWN MIGRATION (ROLLBACK)
/*
ALTER TABLE student_attendance DROP INDEX unique_student_timetable_date;
ALTER TABLE student_attendance DROP FOREIGN KEY fk_student_attendance_timetable;
ALTER TABLE student_attendance DROP COLUMN timetable_id;
ALTER TABLE student_attendance ADD CONSTRAINT unique_student_date UNIQUE (student_id, date);
*/
