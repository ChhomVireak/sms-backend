const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


const misMasterSubjects = [
  { code: 'MIS101', name: 'Introduction to Management Information Systems', credit: 3, th: 30, pr: 30 },
  { code: 'CS101', name: 'C++ Programming', credit: 3, th: 30, pr: 30 },
  { code: 'DB101', name: 'Database Management Systems', credit: 3, th: 30, pr: 30 },
  { code: 'WEB101', name: 'Web Development & Design', credit: 3, th: 30, pr: 30 },
  { code: 'NET101', name: 'Computer Networking Fundamentals', credit: 3, th: 30, pr: 30 },
  { code: 'MATH101', name: 'Discrete Mathematics', credit: 3, th: 45, pr: 15 }
];

async function seedTestSubjectsInternal() {
  try {
    if (typeof misMasterSubjects !== 'undefined' && Array.isArray(misMasterSubjects)) {
      for (const item of misMasterSubjects) {
        const existing = await db.query('SELECT subject_id FROM subjects WHERE subject_code = ?', [item.code]);
        if (existing.length === 0) {
          await db.query(
            `INSERT INTO subjects (subject_code, subject_name, credit, theory_hours, practical_hours, description, status)
             VALUES (?, ?, ?, ?, ?, ?, "ACTIVE")`,
            [item.code, item.name, item.credit, item.th, item.pr, `${item.name} for MIS Bachelor Degree`]
          );
        }
      }
    }
  } catch (err) {
    console.error('Seed test subjects error:', err.message);
  }
}

async function getSubjects(req, res, next) {
  try {
    await seedTestSubjectsInternal();

    const { status, search } = req.query;
    let whereClauses = [];
    let params = [];

    if (status) { whereClauses.push('status = ?'); params.push(status); }
    if (search) {
      whereClauses.push('(subject_code LIKE ? OR subject_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (req.user && String(req.user.role || '').toUpperCase() === 'STUDENT') {
      let stuId = req.user.studentId;
      if (!stuId) {
        const sRows = await db.query('SELECT student_id, group_id FROM students WHERE user_id = ?', [req.user.userId]);
        if (sRows.length > 0) stuId = sRows[0].student_id;
      }
      if (stuId) {
        const studentSubjects = await db.query(
          `SELECT DISTINCT s.*,
             tt.day_of_week, tt.slot_id,
             ts.start_time, ts.end_time,
             COALESCE(r.room_number, 'Room 1A') as room_name,
             t.first_name as teacher_fname, t.last_name as teacher_lname
           FROM subjects s
           JOIN timetables tt ON s.subject_id = tt.subject_id
           JOIN students stu ON tt.group_id = stu.group_id
           LEFT JOIN time_slots ts ON tt.slot_id = ts.slot_id
           LEFT JOIN rooms r ON tt.room_id = r.room_id
           LEFT JOIN teachers t ON tt.teacher_id = t.teacher_id
           WHERE stu.student_id = ?
           ORDER BY s.subject_code ASC`,
          [stuId]
        );
        if (studentSubjects.length > 0) {
          return sendSuccess(res, 'Student enrolled subjects fetched', { subjects: studentSubjects });
        }
      }
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const subjects = await db.query(
      `SELECT * FROM subjects ${whereSql} ORDER BY subject_code ASC`,
      params
    );

    return sendSuccess(res, 'Subjects fetched', { subjects });
  } catch (error) {
    next(error);
  }
}

async function getSubjectById(req, res, next) {
  try {
    const { id } = req.params;
    const subjects = await db.query('SELECT * FROM subjects WHERE subject_id = ?', [id]);

    if (subjects.length === 0) {
      return sendError(res, 'Subject not found', 404);
    }

    return sendSuccess(res, 'Subject fetched', { subject: subjects[0] });
  } catch (error) {
    next(error);
  }
}

async function createSubject(req, res, next) {
  try {
    const {
      subject_code, subject_name, credit = 3,
      theory_hours = 30, practical_hours = 30, description = '', status = 'ACTIVE'
    } = req.body;

    if (!subject_code || !subject_name) {
      return sendError(res, 'Subject code and subject name are required', 400);
    }

    const existing = await db.query('SELECT subject_id FROM subjects WHERE subject_code = ?', [subject_code]);
    if (existing.length > 0) {
      return sendError(res, `Subject code '${subject_code}' already exists`, 409);
    }

    const result = await db.query(
      `INSERT INTO subjects (subject_code, subject_name, credit, theory_hours, practical_hours, description, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subject_code.toUpperCase().trim(), subject_name.trim(), credit, theory_hours, practical_hours, description, status]
    );

    notifyRealtime('subject_created', { subject_id: result.insertId, subject_code, subject_name });

    return sendSuccess(res, 'Subject created successfully', { subject_id: result.insertId, subject_code }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateSubject(req, res, next) {
  try {
    const { id } = req.params;
    const { subject_code, subject_name, credit, theory_hours, practical_hours, description, status } = req.body;

    await db.query(
      `UPDATE subjects SET subject_code = ?, subject_name = ?, credit = ?, theory_hours = ?, practical_hours = ?, description = ?, status = ?
       WHERE subject_id = ?`,
      [subject_code.toUpperCase().trim(), subject_name.trim(), credit || 3, theory_hours || 30, practical_hours || 30, description || '', status || 'ACTIVE', id]
    );

    notifyRealtime('subject_updated', { subject_id: id, subject_code, subject_name });

    return sendSuccess(res, 'Subject updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteSubject(req, res, next) {
  try {
    const { id } = req.params;

    await db.query('DELETE FROM curriculum_subjects WHERE subject_id = ?', [id]);
    await db.query('DELETE FROM timetables WHERE subject_id = ?', [id]);
    await db.query('DELETE FROM subjects WHERE subject_id = ?', [id]);

    notifyRealtime('subject_deleted', { subject_id: id });

    return sendSuccess(res, 'Subject deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function seedTestSubjects(req, res, next) {
  try {
    await seedTestSubjectsInternal();
    notifyRealtime('subject_created', { action: 'test_subjects_seeded' });
    return sendSuccess(res, 'All 65 MIS Degree test subjects inserted into database successfully!');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
  seedTestSubjects
};
