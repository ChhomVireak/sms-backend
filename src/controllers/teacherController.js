const db = require('../config/database');
const bcrypt = require('bcrypt');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function ensureTeacherColumns() {
  const columns = [
    "ALTER TABLE teachers ADD COLUMN employee_id VARCHAR(50) AFTER custom_teacher_id",
    "ALTER TABLE teachers ADD COLUMN dob DATE AFTER gender",
    "ALTER TABLE teachers ADD COLUMN email VARCHAR(150) AFTER phone",
    "ALTER TABLE teachers ADD COLUMN address TEXT AFTER email",
    "ALTER TABLE teachers ADD COLUMN nationality VARCHAR(100) DEFAULT 'Cambodian' AFTER address",
    "ALTER TABLE teachers ADD COLUMN faculty VARCHAR(100) AFTER specialization",
    "ALTER TABLE teachers ADD COLUMN department VARCHAR(100) AFTER faculty",
    "ALTER TABLE teachers ADD COLUMN employment_type VARCHAR(50) DEFAULT 'Full-time' AFTER hire_date",
    "ALTER TABLE teachers ADD COLUMN status VARCHAR(20) DEFAULT 'ACTIVE' AFTER employment_type",
    "ALTER TABLE teachers ADD COLUMN payroll_status VARCHAR(20) DEFAULT 'PENDING' AFTER status",
    "ALTER TABLE teachers ADD COLUMN assigned_subject_ids TEXT AFTER payroll_status",
    "ALTER TABLE teachers ADD COLUMN assigned_group_ids TEXT AFTER assigned_subject_ids",
    "ALTER TABLE teachers ADD COLUMN salary_rate DECIMAL(10,2) DEFAULT 1200.00 AFTER assigned_group_ids",
    "ALTER TABLE teachers ADD COLUMN teaching_hours INT DEFAULT 40 AFTER salary_rate"
  ];
  for (const sql of columns) {
    try { await db.query(sql); } catch (e) { /* ignore existing column */ }
  }

  try {
    const countRes = await db.query('SELECT COUNT(*) as count FROM teachers');
    if (countRes[0].count === 0) {
      const sampleTeachers = [
        ['TCH-001', 'EMP-001', 'Dara', 'Sok', 'MALE', '012345678', 'dara.sok@university.edu.kh', 'Computer Science', 'Science', '2022-01-15'],
        ['TCH-002', 'EMP-002', 'Vanna', 'Chan', 'FEMALE', '012987654', 'vanna.chan@university.edu.kh', 'Information Technology', 'IT', '2021-09-01'],
        ['TCH-003', 'EMP-003', 'Somnang', 'Meas', 'MALE', '015112233', 'somnang.meas@university.edu.kh', 'Software Engineering', 'IT', '2023-03-10'],
        ['TCH-004', 'EMP-004', 'Sophea', 'Keo', 'FEMALE', '016445566', 'sophea.keo@university.edu.kh', 'Data Science & AI', 'Science', '2020-05-20'],
        ['TCH-005', 'EMP-005', 'Piseth', 'Heng', 'MALE', '017778899', 'piseth.heng@university.edu.kh', 'Web & Mobile Dev', 'IT', '2022-11-01']
      ];
      for (const t of sampleTeachers) {
        await db.query(
          `INSERT INTO teachers (custom_teacher_id, employee_id, first_name, last_name, gender, phone, email, specialization, faculty, hire_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          t
        );
      }
    }
  } catch (e) {
    console.error('Error seeding sample teachers:', e);
  }

  try {
    const subRows = await db.query('SELECT subject_id FROM subjects LIMIT 10');
    const grpRows = await db.query('SELECT group_id FROM student_groups LIMIT 10');

    if (subRows.length > 0 && grpRows.length > 0) {
      const sIds = subRows.map(s => s.subject_id);
      const gIds = grpRows.map(g => g.group_id);

      const allTeachers = await db.query('SELECT teacher_id, assigned_subject_ids, assigned_group_ids FROM teachers');
      for (let i = 0; i < allTeachers.length; i++) {
        const t = allTeachers[i];
        if (!t.assigned_subject_ids || t.assigned_subject_ids === '[]' || t.assigned_subject_ids === '') {
          const assignedS = Array.from(new Set([sIds[i % sIds.length], sIds[(i + 1) % sIds.length]])).filter(Boolean);
          await db.query('UPDATE teachers SET assigned_subject_ids = ? WHERE teacher_id = ?', [JSON.stringify(assignedS), t.teacher_id]);
        }
        if (!t.assigned_group_ids || t.assigned_group_ids === '[]' || t.assigned_group_ids === '') {
          const assignedG = Array.from(new Set([gIds[i % gIds.length], gIds[(i + 1) % gIds.length]])).filter(Boolean);
          await db.query('UPDATE teachers SET assigned_group_ids = ? WHERE teacher_id = ?', [JSON.stringify(assignedG), t.teacher_id]);
        }
      }
    }
  } catch (e) {
    console.error('Error auto-assigning sample subjects and groups to teachers:', e);
  }
}

// Auto-run schema setup at startup
ensureTeacherColumns().catch(err => console.error(err));
ensureTeacherAttendanceTable().catch(err => console.error(err));

async function getTeachers(req, res, next) {
  try {
    const { search = '', department = '' } = req.query;
    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(t.first_name LIKE ? OR t.last_name LIKE ? OR t.custom_teacher_id LIKE ? OR t.employee_id LIKE ? OR u.email LIKE ? OR t.email LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term);
    }

    if (department) {
      whereClauses.push('(t.specialization = ? OR t.department = ?)');
      params.push(department, department);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT t.*, 
        u.username, COALESCE(t.email, u.email) as email, u.status as account_status,
        (SELECT COUNT(DISTINCT group_id) FROM timetables WHERE teacher_id = t.teacher_id) as class_count
      FROM teachers t
      LEFT JOIN users u ON t.user_id = u.user_id
      ${whereSql}
      ORDER BY t.teacher_id DESC
    `;

    const teachers = await db.query(querySql, params);
    return sendSuccess(res, 'Teachers fetched', { teachers });
  } catch (error) {
    next(error);
  }
}

async function getTeacherById(req, res, next) {
  try {
    const { id } = req.params;
    const teachers = await db.query(
      `SELECT t.*, u.username, COALESCE(t.email, u.email) as email, u.status as account_status
       FROM teachers t
       LEFT JOIN users u ON t.user_id = u.user_id
       WHERE t.teacher_id = ? OR t.custom_teacher_id = ?`,
      [id, id]
    );

    if (teachers.length === 0) {
      return sendError(res, 'Teacher not found', 404);
    }

    const teacher = teachers[0];
    const timetable = await db.query(
      `SELECT tt.*, sub.subject_name, g.group_name, r.room_number, ts.start_time, ts.end_time
       FROM timetables tt
       JOIN subjects sub ON tt.subject_id = sub.subject_id
       JOIN student_groups g ON tt.group_id = g.group_id
       JOIN rooms r ON tt.room_id = r.room_id
       JOIN time_slots ts ON tt.slot_id = ts.slot_id
       WHERE tt.teacher_id = ?`,
      [teacher.teacher_id]
    );

    return sendSuccess(res, 'Teacher details fetched', { teacher, timetable });
  } catch (error) {
    next(error);
  }
}

async function createTeacher(req, res, next) {
  try {

    const {
      custom_teacher_id, employee_id, first_name, last_name, gender, dob, phone,
      email, address, nationality, specialization, faculty, department, hire_date,
      employment_type, status = 'ACTIVE', password, create_user = true, image, username
    } = req.body;

    if (!first_name || !last_name || !gender || !phone || !hire_date) {
      return sendError(res, 'First name, last name, gender, phone and hire date are required', 400);
    }

    let imagePath = req.file ? `/uploads/${req.file.filename}` : (image || null);

    let customId = custom_teacher_id;
    if (!customId) {
      const countRes = await db.query('SELECT COUNT(*) as cnt FROM teachers');
      const nextNum = (countRes[0]?.cnt || 0) + 1;
      customId = `TCH-${String(nextNum).padStart(3, '0')}`;
    }

    let empId = employee_id || `EMP-${customId.replace('TCH-', '')}`;

    let linkedUserId = null;
    const uEmail = email || `${first_name.toLowerCase()}.${last_name.toLowerCase()}@school.edu`;
    const uName = username || (uEmail.includes('@') ? uEmail.split('@')[0] : uEmail);

    // Default password extracted from email before @ symbol (e.g. dara.sok if email is dara.sok@university.edu.kh)
    let defaultEmailPass = 'teacher123';
    if (uEmail && uEmail.includes('@')) {
      defaultEmailPass = uEmail.split('@')[0];
    }

    const pass = password || defaultEmailPass;
    const hashedPass = await bcrypt.hash(pass, 10);
    const userStatus = (status || 'ACTIVE').toUpperCase();

    const existingUser = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, uEmail]);
    if (existingUser.length > 0) {
      linkedUserId = existingUser[0].user_id;
    } else {
      const uResult = await db.query(
        'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, "TEACHER", ?)',
        [uName, uEmail, hashedPass, userStatus]
      );
      linkedUserId = uResult.insertId;
    }

    const result = await db.query(
      `INSERT INTO teachers (
        custom_teacher_id, employee_id, user_id, first_name, last_name, gender, dob, phone,
        email, address, nationality, specialization, faculty, department, hire_date,
        employment_type, status, image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customId, empId, linkedUserId, first_name, last_name, gender.toUpperCase(), dob || null, phone,
        uEmail, address || null, nationality || 'Cambodian', specialization || null, faculty || null, department || null, hire_date,
        employment_type || 'Full-time', status || 'ACTIVE', imagePath
      ]
    );

    return sendSuccess(res, 'Teacher created successfully', {
      teacher_id: result.insertId,
      custom_teacher_id: customId,
      employee_id: empId,
      first_name,
      last_name,
      image: imagePath
    }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateTeacher(req, res, next) {
  try {
    const { id } = req.params;
    const {
      employee_id, first_name, last_name, gender, dob, phone, email, address,
      nationality, specialization, faculty, department, hire_date, employment_type,
      status, payroll_status, assigned_subject_ids, assigned_group_ids,
      salary_rate, teaching_hours, image
    } = req.body;

    let imagePath = req.file ? `/uploads/${req.file.filename}` : (image || null);

    let updateFields = [];
    let params = [];

    if (employee_id) { updateFields.push('employee_id = ?'); params.push(employee_id); }
    if (first_name) { updateFields.push('first_name = ?'); params.push(first_name); }
    if (last_name) { updateFields.push('last_name = ?'); params.push(last_name); }
    if (gender) { updateFields.push('gender = ?'); params.push(gender.toUpperCase()); }
    if (dob) { updateFields.push('dob = ?'); params.push(dob); }
    if (phone) { updateFields.push('phone = ?'); params.push(phone); }
    if (email) { updateFields.push('email = ?'); params.push(email); }
    if (address) { updateFields.push('address = ?'); params.push(address); }
    if (nationality) { updateFields.push('nationality = ?'); params.push(nationality); }
    if (specialization) { updateFields.push('specialization = ?'); params.push(specialization); }
    if (faculty) { updateFields.push('faculty = ?'); params.push(faculty); }
    if (department) { updateFields.push('department = ?'); params.push(department); }
    if (hire_date) { updateFields.push('hire_date = ?'); params.push(hire_date); }
    if (employment_type) { updateFields.push('employment_type = ?'); params.push(employment_type); }
    if (status) { updateFields.push('status = ?'); params.push(status); }
    if (payroll_status) { updateFields.push('payroll_status = ?'); params.push(payroll_status); }
    if (salary_rate !== undefined) { updateFields.push('salary_rate = ?'); params.push(salary_rate); }
    if (teaching_hours !== undefined) { updateFields.push('teaching_hours = ?'); params.push(teaching_hours); }
    if (assigned_subject_ids !== undefined) {
      updateFields.push('assigned_subject_ids = ?');
      params.push(typeof assigned_subject_ids === 'object' ? JSON.stringify(assigned_subject_ids) : assigned_subject_ids);
    }
    if (assigned_group_ids !== undefined) {
      updateFields.push('assigned_group_ids = ?');
      params.push(typeof assigned_group_ids === 'object' ? JSON.stringify(assigned_group_ids) : assigned_group_ids);
    }
    if (imagePath) { updateFields.push('image = ?'); params.push(imagePath); }

    if (updateFields.length > 0) {
      params.push(id);
      await db.query(`UPDATE teachers SET ${updateFields.join(', ')} WHERE teacher_id = ?`, params);
    }

    return sendSuccess(res, 'Teacher updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteTeacher(req, res, next) {
  try {
    const { id } = req.params;
    const teacher = await db.query('SELECT user_id FROM teachers WHERE teacher_id = ?', [id]);

    if (teacher.length === 0) {
      return sendError(res, 'Teacher not found', 404);
    }

    const userId = teacher[0].user_id;

    await db.query('DELETE FROM teachers WHERE teacher_id = ?', [id]);
    if (userId) {
      await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
    }

    return sendSuccess(res, 'Teacher deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function ensureTeacherAttendanceTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS teacher_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      teacher_id INT NOT NULL,
      date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'PRESENT',
      time_slot VARCHAR(100) DEFAULT 'All Day',
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_teacher_date (teacher_id, date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  try {
    await db.query(sql);
    try {
      await db.query(`ALTER TABLE teacher_attendance ADD COLUMN time_slot VARCHAR(100) DEFAULT 'All Day'`);
    } catch (e) { /* column exists */ }
  } catch (e) { console.error('Teacher attendance table error:', e.message); }
}

async function getTeacherAttendance(req, res, next) {
  try {
    const { date = new Date().toISOString().slice(0, 10) } = req.query;
    const records = await db.query(
      `SELECT ta.*, t.custom_teacher_id, t.first_name, t.last_name, t.department, t.faculty, t.employment_type 
       FROM teacher_attendance ta 
       JOIN teachers t ON ta.teacher_id = t.teacher_id 
       WHERE ta.date = ?`,
      [date]
    );
    return sendSuccess(res, 'Teacher attendance fetched', { attendance: records });
  } catch (error) {
    next(error);
  }
}

async function saveTeacherAttendance(req, res, next) {
  try {
    const { attendance, date = new Date().toISOString().slice(0, 10) } = req.body;

    if (!Array.isArray(attendance)) {
      return sendError(res, 'Attendance data must be an array', 400);
    }

    for (const item of attendance) {
      await db.query(
        `INSERT INTO teacher_attendance (teacher_id, date, status, time_slot, note)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), time_slot = VALUES(time_slot), note = VALUES(note)`,
        [item.teacher_id, date, item.status || 'PRESENT', item.time_slot || 'All Day', item.note || '']
      );
    }

    return sendSuccess(res, 'Teacher attendance saved successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherAttendance,
  saveTeacherAttendance
};
