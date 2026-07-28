-- ============================================================================
-- EduTrack SMS - School Management System Complete MySQL Database Schema
-- Database Name: sms_db
-- Compatibility: MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+
-- Author: Google DeepMind Antigravity AI
-- Date: 2026-07-28
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `sms_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sms_db`;

-- Disable Foreign Key checks for clean table initialization
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Core authentication user accounts for Admin, Teachers, and Students
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'TEACHER', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Admin User (admin@school.edu / admin123)
INSERT INTO `users` (`username`, `email`, `password`, `role`, `status`) VALUES
('admin', 'admin@school.edu', '$2b$10$wNlhf4zM6n5WjGqE1R9b0O5jY9eQ4mF0/h2c8lP1rK7gB6vA5d8yC', 'ADMIN', 'ACTIVE');

-- ----------------------------------------------------------------------------
-- 2. Table: departments
-- University Academic Departments / Majors
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `department_id` INT AUTO_INCREMENT PRIMARY KEY,
  `dept_code` VARCHAR(50) NOT NULL UNIQUE,
  `dept_name` VARCHAR(150) NOT NULL,
  `head_of_dept` VARCHAR(100) DEFAULT NULL,
  `building_location` VARCHAR(150) DEFAULT NULL,
  `total_students` INT DEFAULT 0,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `departments` (`department_id`, `dept_code`, `dept_name`, `head_of_dept`, `building_location`, `total_students`, `description`) VALUES
(1, 'CS', 'Computer Science & IT', 'Dr. Chan Vanna', 'Science Wing - Floor 2', 142, 'Software Engineering, Web Development & Cybersecurity'),
(2, 'BA', 'Business Administration', 'Prof. Meng Sokha', 'Main Block - Floor 3', 198, 'Finance, Marketing, Management & International Business'),
(3, 'GD', 'Graphic Design & Multimedia', 'Ms. Keo Bopha', 'Art Center - Floor 1', 85, 'UI/UX Design, 3D Animation & Visual Communication'),
(4, 'ENG', 'Foreign Languages & English', 'Dr. John Smith', 'Language Building - Floor 2', 120, 'English Literature, Translation & TESOL Training'),
(5, 'EE', 'Electrical Engineering', 'Eng. Tep Samnang', 'Engineering Block - Floor 1', 76, 'Electronics, Power Systems & Robotics');

-- ----------------------------------------------------------------------------
-- 3. Table: faculties
-- University Faculties
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `faculties`;
CREATE TABLE `faculties` (
  `faculty_id` INT AUTO_INCREMENT PRIMARY KEY,
  `faculty_code` VARCHAR(50) NOT NULL UNIQUE,
  `faculty_name` VARCHAR(150) NOT NULL,
  `dean_name` VARCHAR(100) DEFAULT NULL,
  `building` VARCHAR(100) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `faculties` (`faculty_id`, `faculty_code`, `faculty_name`, `dean_name`, `building`, `description`) VALUES
(1, 'FST', 'Faculty of Science & Technology', 'Dr. Kim Rattana', 'Building A', 'Computer Science, IT & Engineering'),
(2, 'FBE', 'Faculty of Business & Economics', 'Prof. Sok Dara', 'Building B', 'Business Administration & Finance');

-- ----------------------------------------------------------------------------
-- 4. Table: programs
-- Degree Programs / Majors (e.g. BSCS - Computer Science)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `programs`;
CREATE TABLE `programs` (
  `program_id` INT AUTO_INCREMENT PRIMARY KEY,
  `program_code` VARCHAR(50) NOT NULL UNIQUE,
  `program_name` VARCHAR(150) NOT NULL,
  `degree` VARCHAR(100) DEFAULT 'Bachelor Degree',
  `department_id` INT DEFAULT NULL,
  `duration_years` INT DEFAULT 4,
  `total_credits` INT DEFAULT 120,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `programs` (`program_id`, `program_code`, `program_name`, `degree`, `department_id`, `duration_years`, `total_credits`, `description`) VALUES
(1, 'BSCS', 'Computer Science', 'Bachelor Degree', 1, 4, 120, 'Bachelor of Science in Computer Science & Software Engineering'),
(2, 'BSIT', 'Information Technology', 'Bachelor Degree', 1, 4, 120, 'Network Administration, Web Systems & IT Support'),
(3, 'BBA', 'Business Administration', 'Bachelor Degree', 2, 4, 120, 'Business Management, Finance & Marketing');

-- ----------------------------------------------------------------------------
-- 5. Table: student_groups
-- Enrolled Class Groups / Sections (e.g. ASI4, SV34)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `student_groups`;
CREATE TABLE `student_groups` (
  `group_id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_code` VARCHAR(50) NOT NULL UNIQUE,
  `group_name` VARCHAR(100) NOT NULL,
  `generation` VARCHAR(50) DEFAULT 'Gen 9',
  `shift` VARCHAR(50) DEFAULT 'MORNING',
  `program_id` INT DEFAULT 1,
  `max_capacity` INT DEFAULT 40,
  `current_semester` INT DEFAULT 1,
  `academic_year_level` INT DEFAULT 1,
  `semester_start_date` DATE DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`program_id`) REFERENCES `programs` (`program_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `student_groups` (`group_id`, `group_code`, `group_name`, `generation`, `shift`, `program_id`, `max_capacity`, `current_semester`, `academic_year_level`, `status`) VALUES
(1, 'ASI4', 'Class Group ASI4', 'Gen 9', 'MORNING', 1, 40, 1, 1, 'ACTIVE'),
(2, 'SV34', 'Class Group SV34', 'Gen 9', 'AFTERNOON', 1, 40, 1, 1, 'ACTIVE');

-- ----------------------------------------------------------------------------
-- 6. Table: teachers
-- Faculty Teachers / Professors Information
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `teachers`;
CREATE TABLE `teachers` (
  `teacher_id` INT AUTO_INCREMENT PRIMARY KEY,
  `custom_teacher_id` VARCHAR(50) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `gender` VARCHAR(20) DEFAULT 'MALE',
  `dob` DATE DEFAULT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `department` VARCHAR(100) DEFAULT 'Computer Science',
  `faculty` VARCHAR(100) DEFAULT 'Science & Tech',
  `employment_type` VARCHAR(50) DEFAULT 'Full-time',
  `specialization` VARCHAR(100) DEFAULT NULL,
  `image` VARCHAR(255) DEFAULT NULL,
  `assigned_subject_ids` TEXT DEFAULT NULL,
  `assigned_group_ids` TEXT DEFAULT NULL,
  `base_salary` DECIMAL(10,2) DEFAULT 800.00,
  `status` VARCHAR(20) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: students
-- Enrolled Students Profile & Group Linkage
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `student_id` INT AUTO_INCREMENT PRIMARY KEY,
  `custom_student_id` VARCHAR(50) NOT NULL UNIQUE,
  `user_id` INT DEFAULT NULL,
  `group_id` INT DEFAULT NULL,
  `program_id` INT DEFAULT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `gender` VARCHAR(20) DEFAULT 'MALE',
  `dob` DATE DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `image` VARCHAR(255) DEFAULT NULL,
  `parent_name` VARCHAR(100) DEFAULT NULL,
  `parent_phone` VARCHAR(50) DEFAULT NULL,
  `previous_school` VARCHAR(150) DEFAULT NULL,
  `academic_year_level` INT DEFAULT 1,
  `current_semester` INT DEFAULT 1,
  `reexam_status` VARCHAR(50) DEFAULT 'NONE',
  `is_retained` BOOLEAN DEFAULT FALSE,
  `enrollment_date` DATE DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE SET NULL,
  FOREIGN KEY (`program_id`) REFERENCES `programs` (`program_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: subjects
-- Academic Subjects / Courses
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `subjects`;
CREATE TABLE `subjects` (
  `subject_id` INT AUTO_INCREMENT PRIMARY KEY,
  `subject_code` VARCHAR(50) NOT NULL UNIQUE,
  `subject_name` VARCHAR(150) NOT NULL,
  `credits` INT DEFAULT 3,
  `semester` INT DEFAULT 1,
  `program_id` INT DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`program_id`) REFERENCES `programs` (`program_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subjects` (`subject_id`, `subject_code`, `subject_name`, `credits`, `semester`, `program_id`, `description`) VALUES
(1, 'CS101', 'C++ Programming Fundamentals', 3, 1, 1, 'Introduction to C++ syntax, pointers, structures and algorithms'),
(2, 'WEB102', 'Modern Web Development & HTML/CSS/JS', 3, 1, 1, 'Front-end web design and interactive UI development'),
(3, 'MATH103', 'Discrete Mathematics & Logic', 3, 1, 1, 'Set theory, logic gates, graph theory and proofs'),
(4, 'ENG104', 'Academic English & Communication', 3, 1, 1, 'Professional technical report writing and oral presentations'),
(5, 'CS201', 'Object-Oriented Programming (Java)', 3, 2, 1, 'OOP concepts, inheritance, polymorphism and exception handling'),
(6, 'DB202', 'Database Systems & Relational SQL', 3, 2, 1, 'ER diagrams, SQL queries, indexing and transaction management');

-- ----------------------------------------------------------------------------
-- 9. Table: curriculums
-- Program Curriculum Study Plans
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `curriculums`;
CREATE TABLE `curriculums` (
  `curriculum_id` INT AUTO_INCREMENT PRIMARY KEY,
  `curriculum_code` VARCHAR(50) NOT NULL UNIQUE,
  `program_id` INT NOT NULL,
  `year_level` INT DEFAULT 1,
  `semester` INT DEFAULT 1,
  `subject_id` INT NOT NULL,
  `is_mandatory` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`program_id`) REFERENCES `programs` (`program_id`) ON DELETE CASCADE,
  FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Table: rooms
-- Physical Classroom & Computer Lab Facilities
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `rooms`;
CREATE TABLE `rooms` (
  `room_id` INT AUTO_INCREMENT PRIMARY KEY,
  `room_number` VARCHAR(50) NOT NULL UNIQUE,
  `building` VARCHAR(100) DEFAULT 'Main Block A',
  `capacity` INT DEFAULT 40,
  `type` VARCHAR(50) DEFAULT 'LECTURE',
  `status` VARCHAR(20) DEFAULT 'AVAILABLE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `rooms` (`room_id`, `room_number`, `building`, `capacity`, `type`, `status`) VALUES
(1, 'Room 101', 'Main Block A', 40, 'LECTURE', 'AVAILABLE'),
(2, 'Room 102', 'Main Block A', 40, 'LECTURE', 'AVAILABLE'),
(3, 'Lab 201', 'Science Wing B', 35, 'COMPUTER_LAB', 'AVAILABLE');

-- ----------------------------------------------------------------------------
-- 11. Table: time_slots
-- Master Class Timetable Schedule Slots
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `time_slots`;
CREATE TABLE `time_slots` (
  `slot_id` INT AUTO_INCREMENT PRIMARY KEY,
  `slot_name` VARCHAR(100) NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `shift` VARCHAR(50) DEFAULT 'MORNING',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `time_slots` (`slot_id`, `slot_name`, `start_time`, `end_time`, `shift`) VALUES
(1, 'Time (07:15 - 08:30)', '07:15:00', '08:30:00', 'MORNING'),
(2, 'Time (08:30 - 09:15)', '08:30:00', '09:15:00', 'MORNING'),
(3, 'Time (09:15 - 10:15)', '09:15:00', '10:15:00', 'MORNING'),
(4, 'Time (10:15 - 11:15)', '10:15:00', '11:15:00', 'MORNING'),
(5, 'Time (13:00 - 14:15)', '13:00:00', '14:15:00', 'AFTERNOON'),
(6, 'Time (14:15 - 15:30)', '14:15:00', '15:30:00', 'AFTERNOON'),
(7, 'Time (17:30 - 18:45)', '17:30:00', '18:45:00', 'EVENING'),
(8, 'Time (18:45 - 20:00)', '18:45:00', '20:00:00', 'EVENING');

-- ----------------------------------------------------------------------------
-- 12. Table: timetables
-- Class Weekly Timetable Schedule Slots (Per Group, Teacher, Room, Slot, Semester)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `timetables`;
CREATE TABLE `timetables` (
  `timetable_id` INT AUTO_INCREMENT PRIMARY KEY,
  `semester_id` INT DEFAULT 1,
  `group_id` INT NOT NULL,
  `subject_id` INT NOT NULL,
  `teacher_id` INT NOT NULL,
  `room_id` INT NOT NULL,
  `slot_id` INT NOT NULL,
  `day_of_week` ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE CASCADE,
  FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`teacher_id`) ON DELETE CASCADE,
  FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE CASCADE,
  FOREIGN KEY (`slot_id`) REFERENCES `time_slots` (`slot_id`) ON DELETE CASCADE,
  CONSTRAINT `uk_tt_teacher` UNIQUE (`teacher_id`, `day_of_week`, `slot_id`, `semester_id`),
  CONSTRAINT `uk_tt_room` UNIQUE (`room_id`, `day_of_week`, `slot_id`, `semester_id`),
  CONSTRAINT `uk_tt_group` UNIQUE (`group_id`, `day_of_week`, `slot_id`, `semester_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. Table: exam_groups
-- Exam Group Management (Grouped Exams per Generation/Semester/Type)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `exam_groups`;
CREATE TABLE `exam_groups` (
  `exam_group_id` INT AUTO_INCREMENT PRIMARY KEY,
  `exam_group_code` VARCHAR(50) NOT NULL UNIQUE,
  `exam_group_name` VARCHAR(100) NOT NULL,
  `generation` VARCHAR(50) DEFAULT 'Gen 9',
  `semester` VARCHAR(50) DEFAULT 'Semester 1',
  `exam_type` VARCHAR(50) DEFAULT 'Midterm',
  `start_date` DATE DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. Table: exam_group_classes
-- Linking Table between Exam Groups and Enrolled Student Groups
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `exam_group_classes`;
CREATE TABLE `exam_group_classes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `exam_group_id` INT NOT NULL,
  `group_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`exam_group_id`) REFERENCES `exam_groups` (`exam_group_id`) ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `unique_eg_group` UNIQUE (`exam_group_id`, `group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. Table: exams
-- Exam Timetable Schedules
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `exams`;
CREATE TABLE `exams` (
  `exam_id` INT AUTO_INCREMENT PRIMARY KEY,
  `exam_title` VARCHAR(150) NOT NULL,
  `category` VARCHAR(50) DEFAULT 'Midterm',
  `group_id` INT DEFAULT NULL,
  `exam_group_id` INT DEFAULT NULL,
  `subject_id` INT NOT NULL,
  `room_id` INT DEFAULT NULL,
  `exam_date` DATE NOT NULL,
  `start_time` TIME DEFAULT '08:00:00',
  `end_time` TIME DEFAULT '09:30:00',
  `duration_minutes` INT DEFAULT 90,
  `academic_year` VARCHAR(20) DEFAULT '2025-2026',
  `semester` VARCHAR(50) DEFAULT 'Semester 1',
  `status` VARCHAR(20) DEFAULT 'SCHEDULED',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE CASCADE,
  FOREIGN KEY (`exam_group_id`) REFERENCES `exam_groups` (`exam_group_id`) ON DELETE CASCADE,
  FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  FOREIGN KEY (`room_id`) REFERENCES `rooms` (`room_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. Table: academic_results
-- Student Examination Scores & Letter Grades
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `academic_results`;
CREATE TABLE `academic_results` (
  `result_id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `subject_id` INT NOT NULL,
  `exam_id` INT DEFAULT NULL,
  `exam_group_id` INT DEFAULT NULL,
  `assessment_type` VARCHAR(50) DEFAULT 'Midterm',
  `raw_score` DECIMAL(5,2) DEFAULT 0.00,
  `letter_grade` VARCHAR(10) DEFAULT 'F',
  `grade_point` DECIMAL(3,2) DEFAULT 0.00,
  `academic_year` VARCHAR(20) DEFAULT '2025-2026',
  `semester` VARCHAR(50) DEFAULT 'Semester 1',
  `recorded_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `unique_student_subject_assessment` UNIQUE (`student_id`, `subject_id`, `assessment_type`, `semester`, `academic_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. Table: student_attendance
-- Student Class Attendance Records
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `student_attendance`;
CREATE TABLE `student_attendance` (
  `attendance_id` INT AUTO_INCREMENT PRIMARY KEY,
  `student_id` INT NOT NULL,
  `group_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `status` ENUM('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') DEFAULT 'PRESENT',
  `recorded_by` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE CASCADE,
  CONSTRAINT `unique_student_date` UNIQUE (`student_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 18. Table: teacher_attendance
-- Teacher Daily Attendance Logs
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `teacher_attendance`;
CREATE TABLE `teacher_attendance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `teacher_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `status` VARCHAR(20) DEFAULT 'PRESENT',
  `time_slot` VARCHAR(100) DEFAULT 'All Day',
  `note` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`teacher_id`) ON DELETE CASCADE,
  CONSTRAINT `unique_teacher_date` UNIQUE (`teacher_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 19. Table: fee_schedules
-- Tuition Fee Billing Schedules & Payment Plans
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `fee_schedules`;
CREATE TABLE `fee_schedules` (
  `fee_id` INT AUTO_INCREMENT PRIMARY KEY,
  `fee_title` VARCHAR(150) NOT NULL,
  `program_id` INT DEFAULT NULL,
  `academic_year` VARCHAR(50) DEFAULT 'Year 1',
  `term_cycle` VARCHAR(50) DEFAULT 'Semester',
  `semester_name` VARCHAR(50) DEFAULT 'Semester 1',
  `amount` DECIMAL(10,2) NOT NULL,
  `due_date` DATE NOT NULL,
  `status` VARCHAR(20) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`program_id`) REFERENCES `programs` (`program_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `fee_schedules` (`fee_id`, `fee_title`, `program_id`, `academic_year`, `term_cycle`, `semester_name`, `amount`, `due_date`, `status`) VALUES
(1, 'Tuition Fee - Year 1 Semester 1', 1, 'Year 1', 'Semester', 'Semester 1', 650.00, '2026-09-01', 'ACTIVE'),
(2, 'Tuition Fee - Year 1 Semester 2', 1, 'Year 1', 'Semester', 'Semester 2', 650.00, '2027-02-01', 'ACTIVE'),
(3, 'Full Academic Year Tuition Plan', 1, 'Year 1', 'Yearly', 'Full Year', 1200.00, '2026-09-01', 'ACTIVE');

-- ----------------------------------------------------------------------------
-- 20. Table: fee_payments
-- Student Payment Transactions & Receipts
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `fee_payments`;
CREATE TABLE `fee_payments` (
  `payment_id` INT AUTO_INCREMENT PRIMARY KEY,
  `receipt_number` VARCHAR(50) NOT NULL UNIQUE,
  `student_id` INT NOT NULL,
  `fee_id` INT DEFAULT NULL,
  `amount_paid` DECIMAL(10,2) NOT NULL,
  `payment_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `payment_method` VARCHAR(50) DEFAULT 'Bank Transfer',
  `status` VARCHAR(20) DEFAULT 'PAID',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE,
  FOREIGN KEY (`fee_id`) REFERENCES `fee_schedules` (`fee_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 21. Table: notifications
-- System Notifications & Announcements
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `notification_id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(50) DEFAULT 'GENERAL',
  `priority` VARCHAR(20) DEFAULT 'Normal',
  `target_role` VARCHAR(50) DEFAULT 'ALL',
  `target_user_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `notifications` (`notification_id`, `title`, `message`, `type`, `priority`, `target_role`) VALUES
(1, 'Welcome to EduTrack SMS', 'Welcome to the official EduTrack School Management System portal.', 'ANNOUNCEMENT', 'Normal', 'ALL'),
(2, 'Midterm Examination Schedule Published', 'Midterm examination dates and time slots are now available in your portal timetable.', 'EXAM', 'High', 'ALL');

-- ----------------------------------------------------------------------------
-- 22. Table: group_semester_history
-- Class Group Semester Promotion History Archive
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `group_semester_history`;
CREATE TABLE `group_semester_history` (
  `history_id` INT AUTO_INCREMENT PRIMARY KEY,
  `group_id` INT NOT NULL,
  `semester_number` INT NOT NULL,
  `academic_year_level` INT NOT NULL,
  `archived_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`group_id`) REFERENCES `student_groups` (`group_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable Foreign Key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- End of Script
-- ============================================================================
