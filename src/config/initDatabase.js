const db = require('./database');

async function safeQuery(sql, params = []) {
  try {
    return await db.query(sql, params);
  } catch (err) {
    // Ignore duplicate column / duplicate key / table exists errors
    if (
      err.code === 'ER_DUP_FIELDNAME' ||
      err.code === 'ER_DUP_KEYNAME' ||
      err.code === 'ER_TABLE_EXISTS_ERROR' ||
      err.message.includes('already exists') ||
      err.message.includes('Duplicate column') ||
      err.message.includes('Duplicate key')
    ) {
      return null;
    }
    // Log unexpected errors quietly
    console.error(`[DB Init Warning] ${err.message} | Query: ${sql.slice(0, 100)}...`);
    return null;
  }
}

async function initDatabaseSchema() {
  console.log('🔄 Starting complete sequential database schema synchronization...');

  // 1. Ensure all core & auxiliary tables exist
  await safeQuery(`
    CREATE TABLE IF NOT EXISTS faculties (
      faculty_id INT AUTO_INCREMENT PRIMARY KEY,
      faculty_code VARCHAR(50) NOT NULL UNIQUE,
      faculty_name VARCHAR(150) NOT NULL,
      dean_name VARCHAR(100) DEFAULT NULL,
      building VARCHAR(100) DEFAULT NULL,
      description TEXT DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS academic_years (
      academic_year_id INT AUTO_INCREMENT PRIMARY KEY,
      year_label VARCHAR(50) NOT NULL UNIQUE,
      start_date DATE DEFAULT NULL,
      end_date DATE DEFAULT NULL,
      is_current TINYINT(1) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS semesters (
      semester_id INT AUTO_INCREMENT PRIMARY KEY,
      semester_code VARCHAR(50) NOT NULL UNIQUE,
      semester_name VARCHAR(100) NOT NULL,
      semester_number INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS curriculum_subjects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      curriculum_id INT NOT NULL,
      semester_id INT NOT NULL,
      subject_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_curr_sem_sub (curriculum_id, semester_id, subject_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS attendance (
      attendance_id INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      group_id INT NULL,
      subject_id INT NULL,
      teacher_id INT NULL,
      date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'PRESENT',
      time_slot VARCHAR(100) DEFAULT 'All Day',
      flagged TINYINT(1) DEFAULT 0,
      note TEXT DEFAULT NULL,
      recorded_by INT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_id INT PRIMARY KEY AUTO_INCREMENT,
      school_name VARCHAR(255) DEFAULT 'EduTrack SMS Academy',
      school_code VARCHAR(50) DEFAULT 'ETA-2026-KH',
      email VARCHAR(255) DEFAULT 'admin@edutrack.edu.kh',
      phone VARCHAR(50) DEFAULT '+855 23 999 888',
      address VARCHAR(255) DEFAULT 'Phnom Penh, Cambodia',
      academic_year VARCHAR(50) DEFAULT '2025–2026',
      active_term VARCHAR(50) DEFAULT 'Term 2',
      two_factor_auth TINYINT(1) DEFAULT 1,
      auto_backup TINYINT(1) DEFAULT 1,
      theme_mode VARCHAR(20) DEFAULT 'Dark',
      accent_color VARCHAR(50) DEFAULT 'Emerald',
      session_timeout INT DEFAULT 60,
      password_policy VARCHAR(20) DEFAULT 'strong',
      school_lat DECIMAL(10,8) DEFAULT 11.5564000,
      school_lng DECIMAL(11,8) DEFAULT 104.9282000,
      allowed_radius_meters INT DEFAULT 100,
      authorized_wifi_ips TEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS fee_categories (
      category_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      default_amount DECIMAL(10,2) DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS fee_schedules (
      fee_schedule_id INT AUTO_INCREMENT PRIMARY KEY,
      fee_id INT NULL,
      group_id INT NULL,
      semester_id INT DEFAULT 1,
      fee_title VARCHAR(150) NOT NULL,
      program_id INT DEFAULT NULL,
      academic_year VARCHAR(50) DEFAULT 'Year 1',
      term_cycle VARCHAR(50) DEFAULT 'Semester 1',
      term VARCHAR(50) DEFAULT 'Semester 1',
      amount DECIMAL(10,2) NOT NULL,
      due_date DATE NOT NULL,
      late_penalty_rate DECIMAL(5,2) DEFAULT 5.00,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS payments (
      payment_id INT AUTO_INCREMENT PRIMARY KEY,
      receipt_number VARCHAR(50) NOT NULL UNIQUE,
      student_id INT NOT NULL,
      fee_schedule_id INT NULL,
      amount_paid DECIMAL(10,2) NOT NULL,
      penalty_paid DECIMAL(10,2) DEFAULT 0.00,
      payment_method VARCHAR(50) DEFAULT 'KHQR',
      payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) DEFAULT 'Paid',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS teacher_attendance (
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS exam_groups (
      exam_group_id INT AUTO_INCREMENT PRIMARY KEY,
      exam_group_code VARCHAR(50) NOT NULL UNIQUE,
      exam_group_name VARCHAR(100) NOT NULL,
      generation VARCHAR(50) DEFAULT 'Gen 9',
      semester VARCHAR(50) DEFAULT 'Semester 1',
      exam_type VARCHAR(50) DEFAULT 'Midterm',
      start_date DATE NULL,
      end_date DATE NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS exam_group_classes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      exam_group_id INT NOT NULL,
      group_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_eg_group (exam_group_id, group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS group_semester_history (
      history_id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      semester_number INT NOT NULL,
      academic_year_level INT NOT NULL,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS students (
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
      is_retained TINYINT(1) DEFAULT 0,
      enrollment_date DATE DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'ANNOUNCEMENT',
      priority VARCHAR(50) DEFAULT 'Medium',
      target_audience VARCHAR(100) DEFAULT 'All Users',
      target_user_id INT DEFAULT NULL,
      user_id INT DEFAULT NULL,
      status VARCHAR(50) DEFAULT 'Published',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await safeQuery(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      read_id INT AUTO_INCREMENT PRIMARY KEY,
      notification_id INT NOT NULL,
      user_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY user_notif_uniq (notification_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Sequential Column Migrations
  // programs table
  await safeQuery(`ALTER TABLE programs ADD COLUMN faculty_id INT NULL`);
  await safeQuery(`ALTER TABLE programs ADD COLUMN total_semesters INT DEFAULT 8`);
  await safeQuery(`ALTER TABLE programs ADD COLUMN tuition_fee_per_semester DECIMAL(10,2) DEFAULT 390.00`);
  await safeQuery(`ALTER TABLE programs ADD COLUMN total_tuition_fee DECIMAL(10,2) DEFAULT 3120.00`);
  await safeQuery(`ALTER TABLE programs ADD COLUMN semester_duration_months INT DEFAULT 5`);
  await safeQuery(`ALTER TABLE programs ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'`);
  await safeQuery(`UPDATE programs SET total_semesters = COALESCE(duration_years * 2, 8) WHERE total_semesters IS NULL OR total_semesters = 0`);

  // curriculums table
  await safeQuery(`ALTER TABLE curriculums ADD COLUMN title VARCHAR(255) DEFAULT 'Program Curriculum'`);
  await safeQuery(`ALTER TABLE curriculums ADD COLUMN academic_year_id INT NULL`);
  await safeQuery(`ALTER TABLE curriculums ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'`);
  await safeQuery(`ALTER TABLE curriculums MODIFY COLUMN curriculum_code VARCHAR(50) NULL DEFAULT NULL`);
  await safeQuery(`ALTER TABLE curriculums MODIFY COLUMN subject_id INT NULL DEFAULT NULL`);

  // academic_years table
  await safeQuery(`ALTER TABLE academic_years ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'`);
  await safeQuery(`ALTER TABLE academic_years ADD COLUMN is_current TINYINT(1) DEFAULT 0`);

  // subjects table
  await safeQuery(`ALTER TABLE subjects ADD COLUMN credit INT DEFAULT 3`);
  await safeQuery(`ALTER TABLE subjects ADD COLUMN theory_hours INT DEFAULT 30`);
  await safeQuery(`ALTER TABLE subjects ADD COLUMN practical_hours INT DEFAULT 15`);
  await safeQuery(`ALTER TABLE subjects ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'`);
  await safeQuery(`UPDATE subjects SET credit = credits WHERE credit IS NULL AND credits IS NOT NULL`);

  // teachers table
  await safeQuery(`ALTER TABLE teachers ADD COLUMN custom_teacher_id VARCHAR(50) NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN employee_id VARCHAR(50) NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN dob DATE NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN email VARCHAR(150) NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN address TEXT NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN nationality VARCHAR(100) DEFAULT 'Cambodian'`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN faculty VARCHAR(100) NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN department VARCHAR(100) NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN hire_date DATE NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN employment_type VARCHAR(50) DEFAULT 'Full-time'`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE'`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN payroll_status VARCHAR(20) DEFAULT 'PENDING'`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN assigned_subject_ids TEXT NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN assigned_group_ids TEXT NULL`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN salary_rate DECIMAL(10,2) DEFAULT 1200.00`);
  await safeQuery(`ALTER TABLE teachers ADD COLUMN teaching_hours INT DEFAULT 40`);

  // fee_schedules table
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN fee_schedule_id INT NULL`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN fee_id INT NULL`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN group_id INT NULL`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN due_date DATE NULL`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN semester_id INT NULL DEFAULT 1`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN term VARCHAR(50) NULL DEFAULT 'Semester 1'`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN academic_year VARCHAR(50) DEFAULT 'Year 1'`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN term_cycle VARCHAR(50) DEFAULT 'Semester 1'`);
  await safeQuery(`ALTER TABLE fee_schedules ADD COLUMN late_penalty_rate DECIMAL(5,2) DEFAULT 5.00`);
  await safeQuery(`UPDATE fee_schedules SET fee_schedule_id = fee_id WHERE fee_schedule_id IS NULL AND fee_id IS NOT NULL`);
  await safeQuery(`UPDATE fee_schedules SET fee_id = fee_schedule_id WHERE fee_id IS NULL AND fee_schedule_id IS NOT NULL`);

  // notifications table
  await safeQuery(`ALTER TABLE notifications ADD COLUMN user_id INT NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN target_user_id INT NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN target_audience VARCHAR(100) DEFAULT 'All Users'`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN target_group_ids TEXT NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN publish_date DATE NULL`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN priority VARCHAR(50) DEFAULT 'Medium'`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN status VARCHAR(50) DEFAULT 'Published'`);
  await safeQuery(`ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'ANNOUNCEMENT'`);

  // payments table
  await safeQuery(`ALTER TABLE payments ADD COLUMN fee_schedule_id INT NULL`);
  await safeQuery(`ALTER TABLE payments ADD COLUMN fee_id INT NULL`);
  await safeQuery(`ALTER TABLE payments ADD COLUMN penalty_paid DECIMAL(10,2) DEFAULT 0.00`);
  await safeQuery(`ALTER TABLE payments ADD COLUMN payment_method VARCHAR(50) DEFAULT 'KHQR'`);
  await safeQuery(`ALTER TABLE payments ADD COLUMN status VARCHAR(50) DEFAULT 'Paid'`);
  await safeQuery(`UPDATE payments SET fee_schedule_id = fee_id WHERE fee_schedule_id IS NULL AND fee_id IS NOT NULL`);
  await safeQuery(`UPDATE payments SET fee_id = fee_schedule_id WHERE fee_id IS NULL AND fee_id IS NOT NULL`);

  // student_groups table
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN program_id INT NULL`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN academic_year_level INT DEFAULT 1`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN current_semester INT DEFAULT 1`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN semester_start_date DATE NULL`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN semester_end_date DATE NULL`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE'`);
  await safeQuery(`ALTER TABLE student_groups ADD COLUMN generation VARCHAR(50) DEFAULT 'Gen 9'`);

  // students table
  await safeQuery(`ALTER TABLE students ADD COLUMN program_id INT NULL`);
  await safeQuery(`ALTER TABLE students ADD COLUMN academic_year_level INT DEFAULT 1`);
  await safeQuery(`ALTER TABLE students ADD COLUMN current_semester INT DEFAULT 1`);
  await safeQuery(`ALTER TABLE students ADD COLUMN reexam_status VARCHAR(50) DEFAULT 'NONE'`);
  await safeQuery(`ALTER TABLE students ADD COLUMN is_retained TINYINT(1) DEFAULT 0`);
  await safeQuery(`ALTER TABLE students ADD COLUMN phone_number VARCHAR(50) NULL`);

  // exams table
  await safeQuery(`ALTER TABLE exams ADD COLUMN category VARCHAR(50) DEFAULT 'Midterm'`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN semester VARCHAR(50) DEFAULT 'Semester 1'`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN academic_year VARCHAR(20) DEFAULT '2025-2026'`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN start_time TIME DEFAULT '08:00:00'`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN end_time TIME DEFAULT '09:30:00'`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN duration_minutes INT DEFAULT 90`);
  await safeQuery(`ALTER TABLE exams ADD COLUMN exam_group_id INT NULL`);

  // exam_groups table
  await safeQuery(`ALTER TABLE exam_groups ADD COLUMN generation VARCHAR(50) DEFAULT 'Gen 9'`);
  await safeQuery(`ALTER TABLE exam_groups ADD COLUMN semester VARCHAR(50) DEFAULT 'Semester 1'`);
  await safeQuery(`ALTER TABLE exam_groups ADD COLUMN exam_type VARCHAR(50) DEFAULT 'Midterm'`);
  await safeQuery(`ALTER TABLE exam_groups ADD COLUMN start_date DATE NULL`);
  await safeQuery(`ALTER TABLE exam_groups ADD COLUMN end_date DATE NULL`);

  // academic_results table
  await safeQuery(`ALTER TABLE academic_results ADD COLUMN remarks TEXT NULL`);
  await safeQuery(`ALTER TABLE academic_results ADD COLUMN is_published TINYINT(1) DEFAULT 0`);
  await safeQuery(`ALTER TABLE academic_results ADD UNIQUE KEY unique_student_exam (student_id, exam_id)`);

  // timetables table
  await safeQuery(`ALTER TABLE timetables ADD COLUMN semester_id INT DEFAULT 1`);
  await safeQuery(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_teacher UNIQUE KEY (teacher_id, day_of_week, slot_id, semester_id)`);
  await safeQuery(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_room UNIQUE KEY (room_id, day_of_week, slot_id, semester_id)`);
  await safeQuery(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_group UNIQUE KEY (group_id, day_of_week, slot_id, semester_id)`);

  // teacher_attendance table
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN timetable_id INT NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN check_in_time DATETIME NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN user_lat DECIMAL(10,8) NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN user_lng DECIMAL(11,8) NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN distance_meters INT NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN client_ip VARCHAR(45) NULL`);
  await safeQuery(`ALTER TABLE teacher_attendance ADD COLUMN verification_method VARCHAR(50) DEFAULT 'GPS_AND_WIFI'`);

  // attendance table
  await safeQuery(`ALTER TABLE attendance ADD COLUMN teacher_id INT NULL`);
  await safeQuery(`ALTER TABLE attendance ADD COLUMN time_slot VARCHAR(100) DEFAULT 'All Day'`);
  await safeQuery(`ALTER TABLE attendance ADD COLUMN flagged TINYINT(1) DEFAULT 0`);
  await safeQuery(`ALTER TABLE attendance ADD COLUMN note TEXT NULL`);

  // system_settings table
  await safeQuery(`ALTER TABLE system_settings ADD COLUMN school_lat DECIMAL(10,8) DEFAULT 11.5564000`);
  await safeQuery(`ALTER TABLE system_settings ADD COLUMN school_lng DECIMAL(11,8) DEFAULT 104.9282000`);
  await safeQuery(`ALTER TABLE system_settings ADD COLUMN allowed_radius_meters INT DEFAULT 100`);
  await safeQuery(`ALTER TABLE system_settings ADD COLUMN authorized_wifi_ips TEXT NULL`);

  // 3. Database Performance Indexes
  await safeQuery(`CREATE INDEX idx_students_custom_id ON students(custom_student_id)`);
  await safeQuery(`CREATE INDEX idx_students_user_group ON students(user_id, group_id)`);
  await safeQuery(`CREATE INDEX idx_teachers_custom_id ON teachers(custom_teacher_id)`);
  await safeQuery(`CREATE INDEX idx_teachers_user ON teachers(user_id)`);
  await safeQuery(`CREATE INDEX idx_groups_code ON student_groups(group_code)`);
  await safeQuery(`CREATE INDEX idx_timetables_lookup ON timetables(group_id, teacher_id, semester_id, day_of_week)`);
  await safeQuery(`CREATE INDEX idx_exams_lookup ON exams(group_id, exam_group_id, exam_date)`);
  await safeQuery(`CREATE INDEX idx_results_lookup ON academic_results(student_id, exam_id)`);
  await safeQuery(`CREATE INDEX idx_teacher_att_date ON teacher_attendance(teacher_id, date)`);

  // 4. Seed Essential Data Sequentially
  // Seed Faculties
  try {
    const fCheck = await db.query('SELECT COUNT(*) as count FROM faculties');
    if (fCheck[0]?.count === 0) {
      await safeQuery(`
        INSERT INTO faculties (faculty_code, faculty_name, description, status) VALUES
        ('FST', 'Faculty of Science & Technology', 'Computer Science, IT, Software Engineering', 'ACTIVE'),
        ('FBA', 'Faculty of Business Administration', 'Accounting, Management, Marketing', 'ACTIVE')
      `);
    }
    await safeQuery(`UPDATE programs SET faculty_id = 1 WHERE faculty_id IS NULL`);
  } catch (e) { }

  // Seed Academic Years
  try {
    const ayCheck = await db.query('SELECT COUNT(*) as count FROM academic_years');
    if (ayCheck[0]?.count === 0) {
      await safeQuery(`
        INSERT INTO academic_years (year_label, start_date, end_date, is_current) VALUES
        ('2025-2026', '2025-10-01', '2026-08-31', 1),
        ('2026-2027', '2026-10-01', '2027-08-31', 0)
      `);
    }
    await safeQuery(`UPDATE curriculums SET academic_year_id = 1 WHERE academic_year_id IS NULL`);
  } catch (e) { }

  // Seed Semesters
  try {
    const semCheck = await db.query('SELECT COUNT(*) as count FROM semesters');
    if (semCheck[0]?.count === 0) {
      await safeQuery(`
        INSERT INTO semesters (semester_code, semester_name, semester_number) VALUES
        ('SEM-1', 'Semester 1', 1),
        ('SEM-2', 'Semester 2', 2),
        ('SEM-3', 'Semester 3', 3),
        ('SEM-4', 'Semester 4', 4),
        ('SEM-5', 'Semester 5', 5),
        ('SEM-6', 'Semester 6', 6),
        ('SEM-7', 'Semester 7', 7),
        ('SEM-8', 'Semester 8', 8)
      `);
    }
  } catch (e) { }

  // Seed Fee Categories
  try {
    const catCheck = await db.query('SELECT COUNT(*) as count FROM fee_categories');
    if (catCheck[0]?.count === 0) {
      await safeQuery(`
        INSERT INTO fee_categories (title, description, default_amount) VALUES
        ('Semester Tuition Fee', 'Per semester (6 months) degree tuition', 390.00),
        ('Full Year Tuition Fee', 'Annual full year tuition ($390 x 2)', 780.00),
        ('Laboratory & Tech Fee', 'Computer lab & digital access fee', 50.00),
        ('Graduation & Thesis Fee', 'Year 4 graduation & defense fee', 120.00)
      `);
    }
  } catch (e) { }

  // Seed Fee Schedules
  try {
    const existingFees = await db.query('SELECT COUNT(*) as count FROM fee_schedules');
    if (existingFees[0]?.count === 0) {
      const groups = await db.query('SELECT group_id FROM student_groups LIMIT 10');
      const sampleGroupId = groups.length > 0 ? groups[0].group_id : 1;

      const defaultSchedules = [
        { title: 'Year 1 Semester 1 Tuition Fee', year: 'Year 1', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 1 Semester 2 Tuition Fee', year: 'Year 1', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 2 Semester 1 Tuition Fee', year: 'Year 2', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 2 Semester 2 Tuition Fee', year: 'Year 2', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 3 Semester 1 Tuition Fee', year: 'Year 3', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 3 Semester 2 Tuition Fee', year: 'Year 3', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 4 Semester 1 Tuition Fee', year: 'Year 4', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 4 Semester 2 Graduation & Tuition Fee', year: 'Year 4', term: 'Semester 2', amount: 450.00, date: '2027-02-15' }
      ];

      for (const item of defaultSchedules) {
        await safeQuery(
          `INSERT INTO fee_schedules (group_id, semester_id, fee_title, amount, due_date, late_penalty_rate, academic_year, term_cycle, term)
           VALUES (?, 1, ?, ?, ?, 5.00, ?, ?, ?)`,
          [sampleGroupId, item.title, item.amount, item.date, item.year, item.term, item.term]
        );
      }
    }
  } catch (e) { }

  // Seed Sample Payments
  try {
    const existingPayments = await db.query('SELECT COUNT(*) as count FROM payments');
    if (existingPayments[0]?.count === 0) {
      const students = await db.query('SELECT student_id FROM students LIMIT 5');
      const feeSchedules = await db.query('SELECT * FROM fee_schedules LIMIT 5');

      if (students.length > 0 && feeSchedules.length > 0) {
        const samplePayments = [
          { receipt: 'RCT-20260726-1001', student_id: students[0].student_id, fee_id: feeSchedules[0].fee_schedule_id || feeSchedules[0].fee_id, amount: feeSchedules[0].amount || 390.00, method: 'KHQR' },
          { receipt: 'RCT-20260725-1002', student_id: students[1 % students.length].student_id, fee_id: (feeSchedules[1 % feeSchedules.length] || {}).fee_schedule_id || (feeSchedules[1 % feeSchedules.length] || {}).fee_id, amount: (feeSchedules[1 % feeSchedules.length] || {}).amount || 390.00, method: 'CASH' },
          { receipt: 'RCT-20260724-1003', student_id: students[2 % students.length].student_id, fee_id: (feeSchedules[2 % feeSchedules.length] || {}).fee_schedule_id || (feeSchedules[2 % feeSchedules.length] || {}).fee_id, amount: (feeSchedules[2 % feeSchedules.length] || {}).amount || 390.00, method: 'BANK_TRANSFER' }
        ];

        for (const p of samplePayments) {
          await safeQuery(
            `INSERT INTO payments (receipt_number, student_id, fee_schedule_id, amount_paid, penalty_paid, payment_method, status)
             VALUES (?, ?, ?, ?, 0.00, ?, 'Paid')`,
            [p.receipt, p.student_id, p.fee_id, p.amount, p.method]
          );
        }
      }
    }
  } catch (e) { }

  // Seed Sample Teachers
  try {
    const countRes = await db.query('SELECT COUNT(*) as count FROM teachers');
    if (countRes[0]?.count === 0) {
      const sampleTeachers = [
        ['TCH-001', 'EMP-001', 'Dara', 'Sok', 'MALE', '012345678', 'dara.sok@university.edu.kh', 'Computer Science', 'Science', '2022-01-15'],
        ['TCH-002', 'EMP-002', 'Vanna', 'Chan', 'FEMALE', '012987654', 'vanna.chan@university.edu.kh', 'Information Technology', 'IT', '2021-09-01'],
        ['TCH-003', 'EMP-003', 'Somnang', 'Meas', 'MALE', '015112233', 'somnang.meas@university.edu.kh', 'Software Engineering', 'IT', '2023-03-10'],
        ['TCH-004', 'EMP-004', 'Sophea', 'Keo', 'FEMALE', '016445566', 'sophea.keo@university.edu.kh', 'Data Science & AI', 'Science', '2020-05-20'],
        ['TCH-005', 'EMP-005', 'Piseth', 'Heng', 'MALE', '017778899', 'piseth.heng@university.edu.kh', 'Web & Mobile Dev', 'IT', '2022-11-01']
      ];
      for (const t of sampleTeachers) {
        await safeQuery(
          `INSERT INTO teachers (custom_teacher_id, employee_id, first_name, last_name, gender, phone, email, specialization, faculty, hire_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          t
        );
      }
    }
  } catch (e) { }

  console.log('✅ Database schema synchronization complete.');
}

module.exports = { initDatabaseSchema };
