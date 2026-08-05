const db = require('../config/database');
const bcrypt = require('bcryptjs');
const os = require('os');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

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
}

// Schema migration and seeding moved to src/config/initDatabase.js

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
        (SELECT COUNT(DISTINCT group_id) FROM timetables WHERE teacher_id = t.teacher_id) as class_count,
        (SELECT COUNT(*) FROM teacher_attendance WHERE teacher_id = t.teacher_id AND (status IN ('PRESENT', 'LATE') OR check_in_time IS NOT NULL)) as checked_in_sessions_count
      FROM teachers t
      LEFT JOIN users u ON t.user_id = u.user_id
      ${whereSql}
      ORDER BY t.teacher_id DESC
    `;

    const teachers = await db.query(querySql, params);
    teachers.forEach(t => {
      t.checked_in_sessions_count = Number(t.checked_in_sessions_count || 0);
      t.checked_in_hours = t.checked_in_sessions_count * 1.5; // 1.5 hrs per session
    });
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

    const checkInRows = await db.query(
      `SELECT id, date, time_slot, status, check_in_time, distance_meters, client_ip, verification_method 
       FROM teacher_attendance 
       WHERE teacher_id = ? AND (status IN ('PRESENT', 'LATE') OR check_in_time IS NOT NULL)
       ORDER BY date DESC, check_in_time DESC`,
      [teacher.teacher_id]
    );

    const checkedInSessionsCount = checkInRows.length;
    const checkedInHours = checkedInSessionsCount * 1.5;

    return sendSuccess(res, 'Teacher details fetched', {
      teacher,
      timetable,
      checkInSummary: {
        checked_in_sessions_count: checkedInSessionsCount,
        checked_in_hours: checkedInHours,
        recent_check_ins: checkInRows
      }
    });
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
        "INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'TEACHER', ?)",
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
      timetable_id INT NULL,
      date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'PRESENT',
      time_slot VARCHAR(100) DEFAULT 'All Day',
      check_in_time DATETIME NULL,
      user_lat DECIMAL(10,8) NULL,
      user_lng DECIMAL(11,8) NULL,
      distance_meters INT NULL,
      client_ip VARCHAR(45) NULL,
      verification_method VARCHAR(50) DEFAULT 'GPS_AND_WIFI',
      note TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  try {
    await db.query(sql);

    // Drop old restrictive single-attendance-per-day unique index
    try { await db.query('ALTER TABLE teacher_attendance DROP INDEX unique_teacher_date'); } catch (e) {}

    const columns = [
      "ALTER TABLE teacher_attendance ADD COLUMN timetable_id INT NULL AFTER teacher_id",
      "ALTER TABLE teacher_attendance ADD COLUMN check_in_time DATETIME NULL AFTER time_slot",
      "ALTER TABLE teacher_attendance ADD COLUMN user_lat DECIMAL(10,8) NULL AFTER check_in_time",
      "ALTER TABLE teacher_attendance ADD COLUMN user_lng DECIMAL(11,8) NULL AFTER user_lat",
      "ALTER TABLE teacher_attendance ADD COLUMN distance_meters INT NULL AFTER user_lng",
      "ALTER TABLE teacher_attendance ADD COLUMN client_ip VARCHAR(45) NULL AFTER distance_meters",
      "ALTER TABLE teacher_attendance ADD COLUMN verification_method VARCHAR(50) DEFAULT 'GPS_AND_WIFI' AFTER client_ip"
    ];
    for (const c of columns) {
      try { await db.query(c); } catch (e) {}
    }
  } catch (e) { console.error('Teacher attendance table error:', e.message); }
}

async function getTeacherAttendance(req, res, next) {
  try {
    const { date = new Date().toISOString().slice(0, 10) } = req.query;

    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const queryDate = new Date(date);
    const dayName = dayNames[queryDate.getDay()];

    const records = await db.query(
      `SELECT ta.*, t.custom_teacher_id, t.first_name, t.last_name, t.department, t.faculty, t.employment_type, t.image
       FROM teacher_attendance ta 
       JOIN teachers t ON ta.teacher_id = t.teacher_id 
       WHERE ta.date = ?`,
      [date]
    );

    // Fetch all assigned class sessions for this day of week
    const timetableSessions = await db.query(
      `SELECT tt.timetable_id, tt.teacher_id, tt.group_id, g.group_code, g.group_name, sub.subject_name, r.room_number, ts.start_time, ts.end_time
       FROM timetables tt
       JOIN student_groups g ON tt.group_id = g.group_id
       JOIN subjects sub ON tt.subject_id = sub.subject_id
       JOIN rooms r ON tt.room_id = r.room_id
       JOIN time_slots ts ON tt.slot_id = ts.slot_id
       WHERE tt.day_of_week = ?
       ORDER BY ts.start_time ASC`,
      [dayName]
    );

    return sendSuccess(res, 'Teacher attendance fetched', {
      attendance: records,
      timetableSessions
    });
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
      const existing = await db.query(
        `SELECT id FROM teacher_attendance WHERE teacher_id = ? AND date = ? AND (timetable_id = ? OR time_slot = ?)`,
        [item.teacher_id, date, item.timetable_id || null, item.time_slot || 'All Day']
      );
      if (existing.length > 0) {
        await db.query(
          `UPDATE teacher_attendance SET status = ?, time_slot = ?, note = ? WHERE id = ?`,
          [item.status || 'PRESENT', item.time_slot || 'All Day', item.note || '', existing[0].id]
        );
      } else {
        await db.query(
          `INSERT INTO teacher_attendance (teacher_id, timetable_id, date, status, time_slot, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [item.teacher_id, item.timetable_id || null, date, item.status || 'PRESENT', item.time_slot || 'All Day', item.note || '']
        );
      }
    }

    return sendSuccess(res, 'Teacher attendance saved successfully');
  } catch (error) {
    next(error);
  }
}

function formatCSVDate(dateStr, fallbackStr = '1990-01-01') {
  if (!dateStr) return fallbackStr;
  const str = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const parts = str.split('-');
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return fallbackStr;
}

async function importTeachers(req, res, next) {
  try {
    const { teachers = [] } = req.body;
    if (!Array.isArray(teachers) || teachers.length === 0) {
      return sendError(res, 'No teacher records provided for import', 400);
    }

    let importedCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const item of teachers) {
      const first_name = String(item.first_name || item.firstName || '').replace(/^["']|["']$/g, '').trim();
      const last_name = String(item.last_name || item.lastName || '').replace(/^["']|["']$/g, '').trim();

      if (!first_name || !last_name) continue;

      let gender = String(item.gender || 'MALE').replace(/^["']|["']$/g, '').toUpperCase().trim();
      if (gender !== 'FEMALE') gender = 'MALE';

      let dob = formatCSVDate(item.dob, '1990-01-01');
      let phone = item.phone ? String(item.phone).replace(/[^0-9\+]/g, '').trim() : '012345678';
      let email = item.email ? String(item.email).replace(/^["']|["']$/g, '').trim() : `${first_name.toLowerCase()}.${last_name.toLowerCase()}@university.edu.kh`;
      let address = item.address ? String(item.address).replace(/^["']|["']$/g, '').trim() : null;
      let nationality = item.nationality ? String(item.nationality).replace(/^["']|["']$/g, '').trim() : 'Cambodian';
      let specialization = item.specialization || item.department || 'Computer Science';
      let faculty = item.faculty || 'Science';
      let department = item.department || specialization;
      let hire_date = formatCSVDate(item.hire_date || item.hireDate, todayStr);
      let employment_type = String(item.employment_type || item.employmentType || 'Full-time').replace(/^["']|["']$/g, '').trim();
      let status = String(item.status || 'ACTIVE').replace(/^["']|["']$/g, '').toUpperCase().trim();

      // Custom teacher ID & Employee ID
      let customId = item.custom_teacher_id || item.teacher_id;
      if (!customId) {
        const countRes = await db.query('SELECT COUNT(*) as cnt FROM teachers');
        const nextNum = (countRes[0]?.cnt || 0) + 1;
        customId = `TCH-${String(nextNum).padStart(3, '0')}`;
      }

      let empId = item.employee_id || `EMP-${customId.replace('TCH-', '')}`;

      // Create linked user account
      const uName = item.username || (email.includes('@') ? email.split('@')[0] : customId);
      const uEmail = email;

      let defaultPass = 'teacher123';
      if (uEmail && uEmail.includes('@')) {
        defaultPass = uEmail.split('@')[0];
      }

      const hashedPass = await bcrypt.hash(defaultPass, 10);
      let linkedUserId = null;

      const existingUser = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, uEmail]);
      if (existingUser.length > 0) {
        linkedUserId = existingUser[0].user_id;
      } else {
        const uResult = await db.query(
          "INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'TEACHER', ?)",
          [uName, uEmail, hashedPass, status]
        );
        linkedUserId = uResult.insertId;
      }

      // Insert teacher record
      await db.query(
        `INSERT INTO teachers (
          custom_teacher_id, employee_id, user_id, first_name, last_name, gender, dob, phone,
          email, address, nationality, specialization, faculty, department, hire_date,
          employment_type, status, image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          customId, empId, linkedUserId, first_name, last_name, gender, dob, phone,
          uEmail, address, nationality, specialization, faculty, department, hire_date,
          employment_type, status
        ]
      );

      importedCount++;
    }

    return sendSuccess(res, `Successfully imported ${importedCount} teacher records with user accounts!`, { count: importedCount });
  } catch (error) {
    next(error);
  }
}

// Haversine formula calculation for distance in meters between two GPS lat/lng points
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth mean radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function getClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || req.ip || '';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  let cleanIp = String(ip).replace(/^::ffff:/, '').trim();

  // If request comes via localhost loopback during local development/testing,
  // resolve the active Wi-Fi / Ethernet interface IPv4 address of the local computer
  if ((cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') && (process.env.NODE_ENV !== 'production')) {
    try {
      const interfaces = os.networkInterfaces();
      for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
          const alias = iface[i];
          if (alias.family === 'IPv4' && !alias.internal && alias.address !== '127.0.0.1') {
            return alias.address;
          }
        }
      }
    } catch (e) {}
  }
  return cleanIp;
}

function isAuthorizedSchoolWifi(ip, authorizedIpsString = '') {
  if (!ip) return false;
  const cleanIp = String(ip).replace(/^::ffff:/, '').trim();

  // IPs configured in process.env.ALLOWED_SCHOOL_IPS
  const envIps = String(process.env.ALLOWED_SCHOOL_IPS || '')
    .split(/,|\n/)
    .map(x => x.trim().replace(/^::ffff:/, ''))
    .filter(Boolean);

  // IPs configured in Database system_settings
  const dbIps = String(authorizedIpsString || '')
    .split(/,|\n/)
    .map(x => x.trim().replace(/^::ffff:/, ''))
    .filter(Boolean);

  const allAuthorized = [...envIps, ...dbIps];

  if (allAuthorized.length === 0) {
    // If no explicit IPs configured, allow local dev subnets
    return cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.') || cleanIp === '127.0.0.1';
  }

  for (const item of allAuthorized) {
    if (item === '*' || item === '0.0.0.0') return true;
    if (cleanIp === item) return true;
    if (item.endsWith('*') && cleanIp.startsWith(item.replace(/\*$/, ''))) return true;
  }

  return false;
}

async function checkInTeacherAttendance(req, res, next) {
  try {
    let { teacher_id, timetable_id, user_lat, user_lng } = req.body;

    // Resolve teacher_id from req.user if omitted
    if (!teacher_id) {
      if (req.user?.teacherId) {
        teacher_id = req.user.teacherId;
      } else if (req.user?.userId) {
        const rows = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0) teacher_id = rows[0].teacher_id;
      }
    }

    if (!timetable_id) {
      return sendError(res, 'Timetable ID is required for check-in', 400);
    }

    if (user_lat === undefined || user_lng === undefined || user_lat === null || user_lng === null) {
      return sendError(res, 'GPS Geolocation coordinates (user_lat, user_lng) are required for check-in', 400);
    }

    const uLat = parseFloat(user_lat);
    const uLng = parseFloat(user_lng);

    if (isNaN(uLat) || isNaN(uLng)) {
      return sendError(res, 'Invalid GPS coordinates received', 400);
    }

    // 1. Fetch timetable session details
    const timetableRows = await db.query(
      `SELECT tt.timetable_id, tt.teacher_id, tt.group_id, sub.subject_name, g.group_code, r.room_number, ts.start_time, ts.end_time
       FROM timetables tt
       JOIN subjects sub ON tt.subject_id = sub.subject_id
       JOIN student_groups g ON tt.group_id = g.group_id
       JOIN rooms r ON tt.room_id = r.room_id
       JOIN time_slots ts ON tt.slot_id = ts.slot_id
       WHERE tt.timetable_id = ?`,
      [timetable_id]
    );

    if (timetableRows.length === 0) {
      return sendError(res, 'Class timetable session not found', 404);
    }

    const session = timetableRows[0];
    const targetTeacherId = teacher_id || session.teacher_id;

    // 2. Validate Class Time Window (Opens AT class start time, closes 15 minutes after start time)
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const startTimeParts = String(session.start_time || '08:00:00').split(':');

    const classStart = new Date(now);
    classStart.setHours(parseInt(startTimeParts[0], 10), parseInt(startTimeParts[1], 10), 0, 0);

    const classCheckInClose = new Date(classStart.getTime() + 15 * 60 * 1000); // 15 mins after start time

    if (now < classStart) {
      const startTimeFormatted = classStart.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return sendError(res, `Check-in is too early. Check-in opens at class start time (${startTimeFormatted}).`, 400);
    }

    if (now > classCheckInClose) {
      const closeTimeFormatted = classCheckInClose.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return sendError(res, `Check-in window closed (at ${closeTimeFormatted}). The 15-minute check-in period has passed and you are marked ABSENT for this session.`, 400);
    }

    // 3. Check if already checked in today for this timetable session
    const existingCheckIn = await db.query(
      `SELECT * FROM teacher_attendance WHERE teacher_id = ? AND date = ? AND (timetable_id = ? OR time_slot = ?)`,
      [targetTeacherId, todayStr, timetable_id, `${session.subject_name} (${session.group_code}) [${session.start_time.slice(0,5)}-${session.end_time.slice(0,5)}]`]
    );

    if (existingCheckIn.length > 0 && existingCheckIn[0].check_in_time) {
      const formattedTime = new Date(existingCheckIn[0].check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return sendError(res, `Already checked in for this session at ${formattedTime}.`, 400);
    }

    // 4. Verification Factor A: Dynamic GPS Geolocation Radius (DB settings with .env fallbacks)
    let schoolLat = parseFloat(process.env.SCHOOL_LAT) || 11.5564000;
    let schoolLng = parseFloat(process.env.SCHOOL_LNG) || 104.9282000;
    let allowedRadiusMeters = parseInt(process.env.ALLOWED_RADIUS_METERS, 10) || 100;
    let authorizedWifiIpsStr = process.env.ALLOWED_SCHOOL_IPS || '';

    try {
      const settingRows = await db.query('SELECT school_lat, school_lng, allowed_radius_meters, authorized_wifi_ips FROM system_settings LIMIT 1');
      if (settingRows.length > 0) {
        const s = settingRows[0];
        if (s.school_lat !== null && s.school_lat !== undefined) schoolLat = parseFloat(s.school_lat);
        if (s.school_lng !== null && s.school_lng !== undefined) schoolLng = parseFloat(s.school_lng);
        if (s.allowed_radius_meters !== null && s.allowed_radius_meters !== undefined) allowedRadiusMeters = parseInt(s.allowed_radius_meters, 10);
        if (s.authorized_wifi_ips) {
          authorizedWifiIpsStr = authorizedWifiIpsStr ? `${authorizedWifiIpsStr},${s.authorized_wifi_ips}` : s.authorized_wifi_ips;
        }
      }
    } catch (e) { }

    const distanceMeters = calculateHaversineDistance(uLat, uLng, schoolLat, schoolLng);

    if (distanceMeters > allowedRadiusMeters) {
      return sendError(res, `You are ${distanceMeters}m away from campus. Allowed limit is ${allowedRadiusMeters}m.`, 403);
    }

    // 5. Verification Factor B: Authorized Wi-Fi Network IP
    const clientIp = getClientIp(req);
    const wifiAuthorized = isAuthorizedSchoolWifi(clientIp, authorizedWifiIpsStr);

    if (!wifiAuthorized) {
      return sendError(res, `Connected Wi-Fi IP (${clientIp}) is not recognized as an authorized school network.`, 403);
    }

    // Determine status (PRESENT if checked in before/at start time, LATE if checked in after start time)
    const status = now <= classStart ? 'PRESENT' : 'LATE';
    const checkInTimeStr = now.toISOString().slice(0, 19).replace('T', ' ');
    const formattedCheckInTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const slotLabel = `${session.subject_name} (${session.group_code}) [${session.start_time.slice(0,5)}-${session.end_time.slice(0,5)}]`;

    // Save attendance record
    let attendanceId = null;
    if (existingCheckIn.length > 0) {
      attendanceId = existingCheckIn[0].id;
      await db.query(
        `UPDATE teacher_attendance 
         SET timetable_id = ?, status = ?, check_in_time = ?, user_lat = ?, user_lng = ?, distance_meters = ?, client_ip = ?, verification_method = 'GPS_AND_WIFI', time_slot = ?
         WHERE id = ?`,
        [timetable_id, status, checkInTimeStr, uLat, uLng, distanceMeters, clientIp, slotLabel, attendanceId]
      );
    } else {
      const insRes = await db.query(
        `INSERT INTO teacher_attendance 
         (teacher_id, timetable_id, date, status, time_slot, check_in_time, user_lat, user_lng, distance_meters, client_ip, verification_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GPS_AND_WIFI')`,
        [targetTeacherId, timetable_id, todayStr, status, slotLabel, checkInTimeStr, uLat, uLng, distanceMeters, clientIp]
      );
      attendanceId = insRes.insertId;
    }

    notifyRealtime('teacher_attendance_updated', {
      teacher_id: targetTeacherId,
      timetable_id,
      status,
      check_in_time: formattedCheckInTime
    });

    return sendSuccess(res, `Check-in successful! Marked ${status} at ${formattedCheckInTime}`, {
      attendance_id: attendanceId,
      timetable_id,
      teacher_id: targetTeacherId,
      status,
      check_in_time: formattedCheckInTime,
      distance_meters: distanceMeters,
      client_ip: clientIp,
      subject_name: session.subject_name
    });

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
  saveTeacherAttendance,
  importTeachers,
  checkInTeacherAttendance
};

