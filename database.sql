-- ============================================================================
-- EduTrack SMS - School Management System Complete MySQL Database Schema
-- Database Name: sms_db
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `sms_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sms_db`;

-- Disable Foreign Key checks for clean table initialization
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Core authentication user accounts for Admin, Teachers, and Students
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'TEACHER', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Admin User (admin@school.edu / admin123)
INSERT INTO users (username, email, password, role, status) VALUES
('admin', 'admin@school.edu', '$2b$10$wNlhf4zM6n5WjGqE1R9b0O5jY9eQ4mF0/h2c8lP1rK7gB6vA5d8yC', 'ADMIN', 'ACTIVE');

-- ----------------------------------------------------------------------------
-- 2. Table: departments
-- University Academic Departments / Majors
-- ----------------------------------------------------------------------------
CREATE TABLE departments (
  department_id INT AUTO_INCREMENT PRIMARY KEY,
  dept_code VARCHAR(50) NOT NULL UNIQUE,
  dept_name VARCHAR(150) NOT NULL,
  head_of_dept VARCHAR(100) DEFAULT NULL,
  building_location VARCHAR(150) DEFAULT NULL,
  total_students INT DEFAULT 0,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Table: faculties
-- University Faculties
-- ----------------------------------------------------------------------------
CREATE TABLE faculties (
  faculty_id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_code VARCHAR(50) NOT NULL UNIQUE,
  faculty_name VARCHAR(150) NOT NULL,
  dean_name VARCHAR(100) DEFAULT NULL,
  building VARCHAR(100) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Table: programs
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `programs`;
CREATE TABLE programs (
  program_id INT AUTO_INCREMENT PRIMARY KEY,
  program_code VARCHAR(50) NOT NULL UNIQUE,
  program_name VARCHAR(150) NOT NULL,
  degree VARCHAR(100) DEFAULT 'Bachelor Degree',
  department_id INT DEFAULT NULL,
  duration_years INT DEFAULT 4,
  total_credits INT DEFAULT 120,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments (department_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. Table: student_groups
-- Enrolled Class Groups / Sections (e.g. ASI4, SV34)
-- ----------------------------------------------------------------------------

CREATE TABLE student_groups (
  group_id INT AUTO_INCREMENT PRIMARY KEY,
  group_code VARCHAR(50) NOT NULL UNIQUE,
  group_name VARCHAR(100) NOT NULL,
  generation VARCHAR(50) DEFAULT 'Gen 9',
  shift VARCHAR(50) DEFAULT 'MORNING',
  program_id INT DEFAULT 1,
  max_capacity INT DEFAULT 40,
  current_semester INT DEFAULT 1,
  academic_year_level INT DEFAULT 1,
  semester_start_date DATE DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs (program_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ----------------------------------------------------------------------------
-- 6. Table: teachers
-- Faculty Teachers / Professors Information
-- ----------------------------------------------------------------------------

CREATE TABLE teachers (
  teacher_id INT AUTO_INCREMENT PRIMARY KEY,
  custom_teacher_id VARCHAR(50) NOT NULL UNIQUE,
  user_id INT DEFAULT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) DEFAULT 'MALE',
  dob DATE DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  department VARCHAR(100) DEFAULT 'Computer Science',
  faculty VARCHAR(100) DEFAULT 'Science & Tech',
  employment_type VARCHAR(50) DEFAULT 'Full-time',
  specialization VARCHAR(100) DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  assigned_subject_ids TEXT DEFAULT NULL,
  assigned_group_ids TEXT DEFAULT NULL,
  base_salary DECIMAL(10,2) DEFAULT 800.00,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Table: students
-- Enrolled Students Profile & Group Linkage
-- ----------------------------------------------------------------------------
CREATE TABLE students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  custom_student_id VARCHAR(50) NOT NULL UNIQUE,
  user_id INT DEFAULT NULL,
  group_id INT DEFAULT NULL,
  program_id INT DEFAULT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) DEFAULT 'MALE',
  dob DATE DEFAULT NULL,
  phone VARCHAR(50) DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  parent_name VARCHAR(100) DEFAULT NULL,
  parent_phone VARCHAR(50) DEFAULT NULL,
  previous_school VARCHAR(150) DEFAULT NULL,
  academic_year_level INT DEFAULT 1,
  current_semester INT DEFAULT 1,
  reexam_status VARCHAR(50) DEFAULT 'NONE',
  is_retained BOOLEAN DEFAULT FALSE,
  enrollment_date DATE DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE SET NULL,
  FOREIGN KEY (program_id) REFERENCES programs (program_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Table: subjects
-- Academic Subjects / Courses
-- ----------------------------------------------------------------------------
CREATE TABLE subjects (
  subject_id INT AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(50) NOT NULL UNIQUE,
  subject_name VARCHAR(150) NOT NULL,
  credits INT DEFAULT 3,
  semester INT DEFAULT 1,
  program_id INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs (program_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Table: curriculums
-- Program Curriculum Study Plans
-- ----------------------------------------------------------------------------

CREATE TABLE curriculums (
  curriculum_id INT AUTO_INCREMENT PRIMARY KEY,
  curriculum_code VARCHAR(50) DEFAULT NULL,
  program_id INT NOT NULL,
  academic_year_id INT DEFAULT NULL,
  title VARCHAR(255) DEFAULT 'Program Curriculum',
  year_level INT DEFAULT 1,
  semester INT DEFAULT 1,
  subject_id INT DEFAULT NULL,
  is_mandatory BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs (program_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 10. Table: rooms
-- Physical Classroom & Computer Lab Facilities
-- ----------------------------------------------------------------------------
CREATE TABLE rooms (
  room_id INT AUTO_INCREMENT PRIMARY KEY,
  room_number VARCHAR(50) NOT NULL UNIQUE,
  building VARCHAR(100) DEFAULT 'Main Block A',
  capacity INT DEFAULT 40,
  type VARCHAR(50) DEFAULT 'LECTURE',
  status VARCHAR(20) DEFAULT 'AVAILABLE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ----------------------------------------------------------------------------
-- 11. Table: time_slots
-- Master Class Timetable Schedule Slots
-- ----------------------------------------------------------------------------

CREATE TABLE time_slots (
  slot_id INT AUTO_INCREMENT PRIMARY KEY,
  slot_name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift VARCHAR(50) DEFAULT 'MORNING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 12. Table: timetables
-- Class Weekly Timetable Schedule Slots (Per Group, Teacher, Room, Slot, Semester)
-- ----------------------------------------------------------------------------
CREATE TABLE timetables (
  timetable_id INT AUTO_INCREMENT PRIMARY KEY,
  semester_id INT DEFAULT 1,
  group_id INT NOT NULL,
  subject_id INT NOT NULL,
  teacher_id INT NOT NULL,
  room_id INT NOT NULL,
  slot_id INT NOT NULL,
  day_of_week ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects (subject_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers (teacher_id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id) REFERENCES time_slots (slot_id) ON DELETE CASCADE,
  CONSTRAINT uk_tt_teacher UNIQUE (teacher_id, day_of_week, slot_id, semester_id),
  CONSTRAINT uk_tt_room UNIQUE (room_id, day_of_week, slot_id, semester_id),
  CONSTRAINT uk_tt_group UNIQUE (group_id, day_of_week, slot_id, semester_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 13. Table: exam_groups
-- Exam Group Management (Grouped Exams per Generation/Semester/Type)
-- ----------------------------------------------------------------------------
CREATE TABLE exam_groups (
  exam_group_id INT AUTO_INCREMENT PRIMARY KEY,
  exam_group_code VARCHAR(50) NOT NULL UNIQUE,
  exam_group_name VARCHAR(100) NOT NULL,
  generation VARCHAR(50) DEFAULT 'Gen 9',
  semester VARCHAR(50) DEFAULT 'Semester 1',
  exam_type VARCHAR(50) DEFAULT 'Midterm',
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  description TEXT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 14. Table: exam_group_classes
-- Linking Table between Exam Groups and Enrolled Student Groups
-- ----------------------------------------------------------------------------
CREATE TABLE exam_group_classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_group_id INT NOT NULL,
  group_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exam_group_id) REFERENCES exam_groups (exam_group_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE CASCADE,
  CONSTRAINT unique_eg_group UNIQUE (exam_group_id, group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 15. Table: exams
-- Exam Timetable Schedules
-- ----------------------------------------------------------------------------
CREATE TABLE exams (
  exam_id INT AUTO_INCREMENT PRIMARY KEY,
  exam_title VARCHAR(150) NOT NULL,
  category VARCHAR(50) DEFAULT 'Midterm',
  group_id INT DEFAULT NULL,
  exam_group_id INT DEFAULT NULL,
  subject_id INT NOT NULL,
  room_id INT DEFAULT NULL,
  exam_date DATE NOT NULL,
  start_time TIME DEFAULT '08:00:00',
  end_time TIME DEFAULT '09:30:00',
  duration_minutes INT DEFAULT 90,
  academic_year VARCHAR(20) DEFAULT '2025-2026',
  semester VARCHAR(50) DEFAULT 'Semester 1',
  status VARCHAR(20) DEFAULT 'SCHEDULED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE CASCADE,
  FOREIGN KEY (exam_group_id) REFERENCES exam_groups (exam_group_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects (subject_id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 16. Table: academic_results
-- Student Examination Scores & Letter Grades
-- ----------------------------------------------------------------------------
CREATE TABLE academic_results (
  result_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  exam_id INT DEFAULT NULL,
  exam_group_id INT DEFAULT NULL,
  assessment_type VARCHAR(50) DEFAULT 'Midterm',
  raw_score DECIMAL(5,2) DEFAULT 0.00,
  letter_grade VARCHAR(10) DEFAULT 'F',
  grade_point DECIMAL(3,2) DEFAULT 0.00,
  academic_year VARCHAR(20) DEFAULT '2025-2026',
  semester VARCHAR(50) DEFAULT 'Semester 1',
  recorded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects (subject_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_subject_assessment UNIQUE (student_id, subject_id, assessment_type, semester, academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 17. Table: student_attendance
-- Student Class Attendance Records
-- ----------------------------------------------------------------------------
CREATE TABLE student_attendance (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  group_id INT NOT NULL,
  date DATE NOT NULL,
  status ENUM('PRESENT', 'LATE', 'ABSENT', 'EXCUSED') DEFAULT 'PRESENT',
  recorded_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_date UNIQUE (student_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- ----------------------------------------------------------------------------
-- 18. Table: teacher_attendance
-- Teacher Check-in & Daily Attendance Logs (GPS & Wi-Fi Verified)
-- ----------------------------------------------------------------------------
CREATE TABLE teacher_attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  timetable_id INT DEFAULT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'PRESENT',
  time_slot VARCHAR(100) DEFAULT 'All Day',
  check_in_time DATETIME DEFAULT NULL,
  user_lat DECIMAL(10,8) DEFAULT NULL,
  user_lng DECIMAL(11,8) DEFAULT NULL,
  distance_meters INT DEFAULT NULL,
  client_ip VARCHAR(45) DEFAULT NULL,
  verification_method VARCHAR(50) DEFAULT 'GPS_AND_WIFI',
  note TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES teachers (teacher_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 19. Table: fee_schedules
-- Tuition Fee Billing Schedules & Payment Plans
-- ----------------------------------------------------------------------------
CREATE TABLE fee_schedules (
  fee_id INT AUTO_INCREMENT PRIMARY KEY,
  fee_title VARCHAR(150) NOT NULL,
  program_id INT DEFAULT NULL,
  academic_year VARCHAR(50) DEFAULT 'Year 1',
  term_cycle VARCHAR(50) DEFAULT 'Semester',
  semester_name VARCHAR(50) DEFAULT 'Semester 1',
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (program_id) REFERENCES programs (program_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 20. Table: fee_payments
-- Student Payment Transactions & Receipts
-- ----------------------------------------------------------------------------
CREATE TABLE fee_payments (
  payment_id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  student_id INT NOT NULL,
  fee_id INT DEFAULT NULL,
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(50) DEFAULT 'Bank Transfer',
  status VARCHAR(20) DEFAULT 'PAID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE,
  FOREIGN KEY (fee_id) REFERENCES fee_schedules (fee_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 21. Table: notifications
-- System Notifications & Announcements
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'GENERAL',
  priority VARCHAR(20) DEFAULT 'Normal',
  target_role VARCHAR(50) DEFAULT 'ALL',
  target_user_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 22. Table: group_semester_history
-- Class Group Semester Promotion History Archive
-- ----------------------------------------------------------------------------
CREATE TABLE group_semester_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  semester_number INT NOT NULL,
  academic_year_level INT NOT NULL,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES student_groups (group_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Re-enable Foreign Key checks
SET FOREIGN_KEY_CHECKS = 1;
  