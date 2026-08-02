const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


async function getStudents(req, res, next) {
  try {
    const rawGroupId = req.query.groupId || req.query.group_id || '';
    const rawProgramId = req.query.programId || req.query.program_id || '';
    const { search = '', unassignedOnly = false, status = '', page = 1, limit = 1000 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.custom_student_id LIKE ? OR u.email LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (rawGroupId) {
      whereClauses.push('s.group_id = ?');
      params.push(rawGroupId);
    }

    if (rawProgramId) {
      whereClauses.push('s.program_id = ?');
      params.push(rawProgramId);
    }

    if (unassignedOnly === 'true' || unassignedOnly === true) {
      if (rawGroupId) {
        whereClauses.push('(s.group_id IS NULL OR s.group_id = ?)');
        params.push(rawGroupId);
      } else {
        whereClauses.push('s.group_id IS NULL');
      }
    }

    if (status) {
      whereClauses.push('s.status = ?');
      params.push(status);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRows = await db.query(
      `SELECT COUNT(*) as total FROM students s 
       LEFT JOIN users u ON s.user_id = u.user_id 
       ${whereSql}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const querySql = `
      SELECT s.*, 
        g.group_name, g.group_code, g.generation, g.current_semester, g.academic_year_level,
        p.program_code, p.program_name, p.degree,
        u.username, u.email,
        'Paid' as fee_status
      FROM students s
      LEFT JOIN student_groups g ON s.group_id = g.group_id
      LEFT JOIN programs p ON s.program_id = p.program_id
      LEFT JOIN users u ON s.user_id = u.user_id
      ${whereSql}
      ORDER BY s.student_id DESC
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, parseInt(limit), parseInt(offset)];
    const students = await db.query(querySql, queryParams);

    return sendSuccess(res, 'Students fetched successfully', {
      students,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getStudentById(req, res, next) {
  try {
    const { id } = req.params;
    const students = await db.query(
      `SELECT s.*, 
        g.group_name, g.group_code, g.generation, g.current_semester, g.academic_year_level,
        p.program_code, p.program_name, p.degree,
        u.username, u.email,
        COALESCE(
          (SELECT CASE 
                    WHEN pay.payment_id IS NOT NULL THEN 'Paid'
                    WHEN fs.due_date < CURDATE() THEN 'Overdue'
                    ELSE 'Pending'
                  END
           FROM fee_schedules fs
           LEFT JOIN payments pay ON pay.fee_schedule_id = fs.fee_schedule_id AND pay.student_id = s.student_id
           WHERE fs.group_id = s.group_id OR fs.group_id IS NULL
           ORDER BY pay.payment_id DESC, fs.due_date DESC LIMIT 1
          ), 'Paid'
        ) as fee_status
       FROM students s
       LEFT JOIN student_groups g ON s.group_id = g.group_id
       LEFT JOIN programs p ON s.program_id = p.program_id
       LEFT JOIN users u ON s.user_id = u.user_id
       WHERE s.student_id = ? OR s.custom_student_id = ?`,
      [id, id]
    );

    if (students.length === 0) {
      return sendError(res, 'Student not found', 404);
    }

    const student = students[0];

    const attStats = await db.query(
      `SELECT status, COUNT(*) as count FROM attendance WHERE student_id = ? GROUP BY status`,
      [student.student_id]
    );

    const grades = await db.query(
      `SELECT ar.*, e.exam_title, sub.subject_name 
       FROM academic_results ar
       JOIN exams e ON ar.exam_id = e.exam_id
       JOIN subjects sub ON e.subject_id = sub.subject_id
       WHERE ar.student_id = ?
       ORDER BY ar.recorded_at DESC LIMIT 10`,
      [student.student_id]
    );

    const payments = await db.query(
      `SELECT p.*, fs.fee_title 
       FROM payments p
       LEFT JOIN fee_schedules fs ON p.fee_schedule_id = fs.fee_schedule_id
       WHERE p.student_id = ?
       ORDER BY p.payment_date DESC`,
      [student.student_id]
    );

    const semesterFeesBreakdown = await db.query(
      `SELECT fs.*,
        p.payment_id, p.receipt_number, p.amount_paid, p.payment_method, p.payment_date,
        CASE 
          WHEN p.payment_id IS NOT NULL THEN 'PAID'
          WHEN fs.due_date < CURDATE() THEN 'OVERDUE'
          ELSE 'PENDING'
        END as semester_fee_status
       FROM fee_schedules fs
       LEFT JOIN payments p ON p.fee_schedule_id = fs.fee_schedule_id AND p.student_id = ?
       WHERE fs.group_id = ? OR fs.group_id IS NULL
       ORDER BY fs.fee_schedule_id ASC`,
      [student.student_id, student.group_id || 0]
    );

    return sendSuccess(res, 'Student details fetched', {
      student,
      attendanceStats: attStats,
      grades,
      payments,
      semesterFeesBreakdown
    });
  } catch (error) {
    next(error);
  }
}

async function createStudent(req, res, next) {
  try {
    const {
      first_name, last_name, gender, dob, phone,
      group_id, program_id, parent_name, parent_phone, previous_school,
      enrollment_date, custom_student_id, create_user = true,
      email, username, password
    } = req.body;

    if (!first_name || !last_name || !gender || !dob || !enrollment_date) {
      return sendError(res, 'First name, last name, gender, DOB, and enrollment date are required', 400);
    }

    // Capacity Limit Validation
    if (group_id) {
      const capRows = await db.query(
        `SELECT g.group_code, g.max_capacity, COUNT(s.student_id) as enrolled_count
         FROM student_groups g
         LEFT JOIN students s ON g.group_id = s.group_id
         WHERE g.group_id = ?
         GROUP BY g.group_id`,
        [group_id]
      );
      if (capRows.length > 0) {
        const gCode = capRows[0].group_code;
        const maxCap = parseInt(capRows[0].max_capacity || 40);
        const enrolled = parseInt(capRows[0].enrolled_count || 0);

        if (enrolled >= maxCap) {
          return sendError(
            res,
            `Class Capacity Full: Class group '${gCode}' has reached max capacity (${enrolled}/${maxCap}). Cannot add more students!`,
            409
          );
        }
      }
    }

    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    let customId = custom_student_id;
    if (!customId) {
      const year = new Date().getFullYear();
      let groupPrefix = 'STU';

      if (group_id) {
        const groupRows = await db.query('SELECT group_code, group_name FROM student_groups WHERE group_id = ?', [group_id]);
        if (groupRows.length > 0) {
          const rawCode = groupRows[0].group_code || groupRows[0].group_name;
          groupPrefix = rawCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        }
      }

      const maxRow = await db.query('SELECT MAX(student_id) as maxId FROM students');
      const nextId = (maxRow[0].maxId || 0) + 1;
      const seqStr = String(nextId).padStart(4, '0');
      customId = `${groupPrefix}-${year}-${seqStr}`;
    }

    // Auto-create User account in User Management when student registers
    let linkedUserId = null;
    if (create_user !== false) {
      const uName = username || customId;
      const uEmail = email || `${customId.toLowerCase()}@school.edu`;

      // Password formatted as DDMMYYYY from Date of Birth (e.g. 02042000 for 2nd April 2000)
      let defaultDobPass = '01012000';
      if (dob) {
        const parts = String(dob).slice(0, 10).split('-');
        if (parts.length === 3) {
          const yearStr = parts[0];
          const monthStr = parts[1].padStart(2, '0');
          const dayStr = parts[2].padStart(2, '0');
          defaultDobPass = `${dayStr}${monthStr}${yearStr}`;
        }
      }

      const pass = password || defaultDobPass;
      const hashedPass = await bcrypt.hash(pass, 10);

      const existingUser = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, uEmail]);
      if (existingUser.length > 0) {
        linkedUserId = existingUser[0].user_id;
      } else {
        const uResult = await db.query(
          "INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'STUDENT', 'ACTIVE')",
          [uName, uEmail, hashedPass]
        );
        linkedUserId = uResult.insertId;
      }
    }

    const result = await db.query(
      `INSERT INTO students (custom_student_id, user_id, group_id, program_id, first_name, last_name, gender, dob, phone, image, parent_name, parent_phone, previous_school, enrollment_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [customId, linkedUserId, group_id || null, program_id || 1, first_name, last_name, gender.toUpperCase(), dob, phone || null, imagePath, parent_name || null, parent_phone || null, previous_school || null, enrollment_date]
    );

    notifyRealtime('student_created', { student_id: result.insertId, custom_student_id: customId, first_name, last_name });

    return sendSuccess(res, 'Student created successfully', {
      student_id: result.insertId,
      custom_student_id: customId,
      first_name,
      last_name,
      image: imagePath
    }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateStudent(req, res, next) {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, gender, dob, phone,
      group_id, program_id, parent_name, parent_phone, previous_school,
      enrollment_date, status
    } = req.body;

    if (group_id) {
      // Check if student is changing group and destination group is full
      const currentStu = await db.query('SELECT group_id FROM students WHERE student_id = ?', [id]);
      if (currentStu.length > 0 && currentStu[0].group_id != group_id) {
        const capRows = await db.query(
          `SELECT g.group_code, g.max_capacity, COUNT(s.student_id) as enrolled_count
           FROM student_groups g
           LEFT JOIN students s ON g.group_id = s.group_id
           WHERE g.group_id = ?
           GROUP BY g.group_id`,
          [group_id]
        );
        if (capRows.length > 0) {
          const gCode = capRows[0].group_code;
          const maxCap = parseInt(capRows[0].max_capacity || 40);
          const enrolled = parseInt(capRows[0].enrolled_count || 0);

          if (enrolled >= maxCap) {
            return sendError(
              res,
              `Class Capacity Full: Class group '${gCode}' has reached max capacity (${enrolled}/${maxCap}). Cannot move student to this full class!`,
              409
            );
          }
        }
      }
    }

    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/${req.file.filename}`;
    }

    let updateFields = [];
    let params = [];

    if (first_name) { updateFields.push('first_name = ?'); params.push(first_name); }
    if (last_name) { updateFields.push('last_name = ?'); params.push(last_name); }
    if (gender) { updateFields.push('gender = ?'); params.push(gender.toUpperCase()); }
    if (dob) { updateFields.push('dob = ?'); params.push(dob); }
    if (phone !== undefined) { updateFields.push('phone = ?'); params.push(phone); }
    if (group_id !== undefined) { updateFields.push('group_id = ?'); params.push(group_id || null); }
    if (program_id !== undefined) { updateFields.push('program_id = ?'); params.push(program_id || null); }
    if (parent_name !== undefined) { updateFields.push('parent_name = ?'); params.push(parent_name); }
    if (parent_phone !== undefined) { updateFields.push('parent_phone = ?'); params.push(parent_phone); }
    if (previous_school !== undefined) { updateFields.push('previous_school = ?'); params.push(previous_school); }
    if (enrollment_date) { updateFields.push('enrollment_date = ?'); params.push(enrollment_date); }
    if (status) { updateFields.push('status = ?'); params.push(status); }
    if (imagePath) { updateFields.push('image = ?'); params.push(imagePath); }

    if (updateFields.length === 0) {
      return sendError(res, 'No fields provided for update', 400);
    }

    params.push(id);
    await db.query(`UPDATE students SET ${updateFields.join(', ')} WHERE student_id = ?`, params);

    notifyRealtime('student_updated', { student_id: id, first_name, last_name });

    return sendSuccess(res, 'Student updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteStudent(req, res, next) {
  try {
    const { id } = req.params;
    const student = await db.query('SELECT user_id FROM students WHERE student_id = ?', [id]);

    if (student.length === 0) {
      return sendError(res, 'Student not found', 404);
    }

    const userId = student[0].user_id;

    await db.query('DELETE FROM students WHERE student_id = ?', [id]);
    if (userId) {
      await db.query('DELETE FROM users WHERE user_id = ?', [userId]);
    }

    notifyRealtime('student_deleted', { student_id: id });

    return sendSuccess(res, 'Student deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function getStudentHistory(req, res, next) {
  try {
    const { id } = req.params;
    const history = await db.query(
      `SELECT h.*, g.group_code, p.program_code, p.program_name
       FROM student_semester_history h
       LEFT JOIN student_groups g ON h.group_id = g.group_id
       LEFT JOIN programs p ON h.program_id = p.program_id
       WHERE h.student_id = ?
       ORDER BY h.semester_id ASC`,
      [id]
    );

    return sendSuccess(res, 'Student semester history fetched', { history });
  } catch (error) {
    next(error);
  }
}

async function getStudentMe(req, res, next) {
  try {
    const userId = req.user?.userId;
    let studentId = req.user?.studentId;

    let params = [];
    let whereSql = '';

    if (studentId) {
      whereSql = 'WHERE s.student_id = ?';
      params.push(studentId);
    } else if (userId) {
      whereSql = 'WHERE s.user_id = ?';
      params.push(userId);
    } else {
      whereSql = 'ORDER BY s.student_id ASC LIMIT 1';
    }

    const students = await db.query(
      `SELECT s.*, 
        g.group_name, g.group_code, g.generation, g.current_semester, g.academic_year_level,
        COALESCE(p.program_code, (SELECT program_code FROM programs WHERE program_id = g.program_id LIMIT 1), 'BSCS') as program_code,
        COALESCE(p.program_name, (SELECT program_name FROM programs WHERE program_id = g.program_id LIMIT 1), 'Computer Science') as program_name,
        COALESCE(p.degree, 'Bachelor Degree') as degree,
        u.username, u.email
       FROM students s
       LEFT JOIN student_groups g ON s.group_id = g.group_id
       LEFT JOIN programs p ON s.program_id = p.program_id
       LEFT JOIN users u ON s.user_id = u.user_id
       ${whereSql}`,
      params
    );

    if (students.length === 0) {
      return sendError(res, 'Student profile not found', 404);
    }

    return sendSuccess(res, 'Student profile fetched from Student Management', { student: students[0] });
  } catch (error) {
    next(error);
  }
}

function formatCSVDate(dateStr, fallbackDate = '2005-01-01') {
  if (!dateStr) return fallbackDate;
  let str = String(dateStr).trim().replace(/^["']|["']$/g, '');
  if (!str || str === 'NONE' || str === 'N/A' || str === 'null' || str === 'undefined') return fallbackDate;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let p1 = parseInt(parts[0], 10);
    let p2 = parseInt(parts[1], 10);
    let p3 = parseInt(parts[2], 10);

    if (isNaN(p1) || isNaN(p2) || isNaN(p3)) return fallbackDate;

    let year = p3;
    if (year < 100) {
      year = year + (year > 50 ? 1900 : 2000);
    }

    let month = p2;
    let day = p1;

    if (p1 > 12) {
      day = p1;
      month = p2;
    } else if (p2 > 12) {
      day = p2;
      month = p1;
    }

    if (month > 12) month = 1;
    if (day > 31) day = 1;

    const yStr = String(year);
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
  }

  return fallbackDate;
}

async function importStudents(req, res, next) {
  try {
    const { students = [] } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return sendError(res, 'No student records provided for import', 400);
    }

    const groupsList = await db.query('SELECT group_id, group_code, group_name, program_id FROM student_groups');
    const programsList = await db.query('SELECT program_id, program_code, program_name FROM programs');

    let importedCount = 0;
    const year = new Date().getFullYear();
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const item of students) {
      const first_name = String(item.first_name || item.firstName || '').replace(/^["']|["']$/g, '').trim();
      const last_name = String(item.last_name || item.lastName || '').replace(/^["']|["']$/g, '').trim();

      if (!first_name || !last_name) continue;

      let gender = String(item.gender || 'MALE').replace(/^["']|["']$/g, '').toUpperCase().trim();
      if (gender !== 'FEMALE') gender = 'MALE';

      let dob = formatCSVDate(item.dob, '2005-01-01');
      let phone = item.phone ? String(item.phone).replace(/[^0-9\+]/g, '').trim() : null;
      let parent_name = item.parent_name || item.parentName || null;
      if (parent_name) parent_name = String(parent_name).replace(/^["']|["']$/g, '').trim();
      let parent_phone = item.parent_phone || item.parentPhone || null;
      if (parent_phone) parent_phone = String(parent_phone).replace(/[^0-9\+]/g, '').trim();
      let previous_school = item.previous_school || item.previousSchool || null;
      if (previous_school) previous_school = String(previous_school).replace(/^["']|["']$/g, '').trim();
      if (previous_school === 'NONE') previous_school = null;
      let enrollment_date = formatCSVDate(item.enrollment_date || item.enrollmentDate, todayStr);
      let status = String(item.status || 'ACTIVE').replace(/^["']|["']$/g, '').toUpperCase();

      // Resolve group_id and program_id
      let groupId = item.group_id ? Number(item.group_id) : (req.body.group_id || req.body.groupId || null);
      let programId = item.program_id ? Number(item.program_id) : (req.body.program_id || req.body.programId || null);

      if (!groupId && (item.group_code || item.group_name || item.class_group)) {
        const targetCode = String(item.group_code || item.group_name || item.class_group).trim().toLowerCase();
        const foundG = groupsList.find(g => 
          (g.group_code && g.group_code.toLowerCase() === targetCode) || 
          (g.group_name && g.group_name.toLowerCase() === targetCode)
        );
        if (foundG) {
          groupId = foundG.group_id;
          if (!programId) programId = foundG.program_id;
        }
      }

      if (!programId && (item.program_code || item.program_name || item.major)) {
        const targetProg = String(item.program_code || item.program_name || item.major).trim().toLowerCase();
        const foundP = programsList.find(p => 
          (p.program_code && p.program_code.toLowerCase() === targetProg) || 
          (p.program_name && p.program_name.toLowerCase() === targetProg)
        );
        if (foundP) programId = foundP.program_id;
      }

      if (!programId && groupId) {
        const foundG = groupsList.find(g => g.group_id === groupId);
        if (foundG && foundG.program_id) programId = foundG.program_id;
      }

      if (!programId && programsList.length > 0) {
        programId = programsList[0].program_id;
      }

      // Generate custom_student_id
      let groupPrefix = 'STU';
      if (groupId) {
        const foundG = groupsList.find(g => g.group_id === groupId);
        if (foundG) {
          const rawCode = foundG.group_code || foundG.group_name;
          groupPrefix = rawCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        }
      }

      const maxRow = await db.query('SELECT MAX(student_id) as maxId FROM students');
      const nextId = (maxRow[0].maxId || 0) + 1;
      const seqStr = String(nextId).padStart(4, '0');
      const customId = `${groupPrefix}-${year}-${seqStr}`;

      // Create linked user account
      const uName = customId;
      const uEmail = `${customId.toLowerCase()}@school.edu`;

      let defaultDobPass = '01012000';
      if (dob) {
        const parts = String(dob).slice(0, 10).split('-');
        if (parts.length === 3) {
          defaultDobPass = `${parts[2].padStart(2, '0')}${parts[1].padStart(2, '0')}${parts[0]}`;
        }
      }

      const hashedPass = await bcrypt.hash(defaultDobPass, 10);
      let linkedUserId = null;

      const existingUser = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, uEmail]);
      if (existingUser.length > 0) {
        linkedUserId = existingUser[0].user_id;
      } else {
        const uResult = await db.query(
          'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, \'STUDENT\', \'ACTIVE\')',
          [uName, uEmail, hashedPass]
        );
        linkedUserId = uResult.insertId;
      }

      // Insert student record
      const result = await db.query(
        `INSERT INTO students (custom_student_id, user_id, group_id, program_id, first_name, last_name, gender, dob, phone, image, parent_name, parent_phone, previous_school, enrollment_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [customId, linkedUserId, groupId, programId || 1, first_name, last_name, gender, dob, phone, parent_name, parent_phone, previous_school, enrollment_date, status]
      );

      importedCount++;
      notifyRealtime('student_created', { student_id: result.insertId, custom_student_id: customId, first_name, last_name });
    }

    return sendSuccess(res, `Successfully imported ${importedCount} student records with user accounts!`, { count: importedCount });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStudents,
  getStudentById,
  getStudentMe,
  getStudentHistory,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents
};
