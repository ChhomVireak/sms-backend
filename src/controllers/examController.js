const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');


async function getExamGroups(req, res, next) {
  try {
    const egRows = await db.query('SELECT * FROM exam_groups ORDER BY exam_group_id DESC');
    for (const eg of egRows) {
      const classes = await db.query(
        `SELECT egc.group_id, g.group_code, g.group_name, g.current_semester, g.generation, g.shift
         FROM exam_group_classes egc
         JOIN student_groups g ON egc.group_id = g.group_id
         WHERE egc.exam_group_id = ?`,
        [eg.exam_group_id]
      );
      eg.classes = classes;
      eg.class_count = classes.length;
    }
    return sendSuccess(res, 'Exam groups fetched successfully', { exam_groups: egRows });
  } catch (error) {
    next(error);
  }
}

async function createExamGroup(req, res, next) {
  try {
    let { exam_group_code, exam_group_name, generation = 'Gen 9', semester = 'Semester 1', exam_type = 'Midterm', start_date, end_date, description, class_ids = [] } = req.body;
    if (!exam_group_code || !exam_group_name) {
      return sendError(res, 'Exam group code and name are required', 400);
    }

    let finalCode = exam_group_code.trim();
    const existing = await db.query('SELECT exam_group_id FROM exam_groups WHERE exam_group_code = ?', [finalCode]);
    if (existing.length > 0) {
      finalCode = `${finalCode}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const result = await db.query(
      'INSERT INTO exam_groups (exam_group_code, exam_group_name, generation, semester, exam_type, start_date, end_date, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [finalCode, exam_group_name, generation, semester, exam_type, start_date || null, end_date || null, description || '']
    );

    const exam_group_id = result.insertId;

    if (Array.isArray(class_ids) && class_ids.length > 0) {
      for (const gid of class_ids) {
        await db.query(
          'INSERT IGNORE INTO exam_group_classes (exam_group_id, group_id) VALUES (?, ?)',
          [exam_group_id, gid]
        );
      }
    }

    return sendSuccess(res, 'Exam group created successfully', { exam_group_id, exam_group_code: finalCode, exam_group_name }, 201);
  } catch (error) {
    next(error);
  }
}

async function deleteExamGroup(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM exam_group_classes WHERE exam_group_id = ?', [id]);
    await db.query('DELETE FROM exam_groups WHERE exam_group_id = ?', [id]);
    return sendSuccess(res, 'Exam group deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function getExams(req, res, next) {
  try {
    const { group_id, exam_group_id, subject_id, status, teacher_only } = req.query;
    let whereClauses = [];
    let params = [];

    const isTeacher = (req.user && req.user.role === 'TEACHER') || teacher_only === 'true';
    if (isTeacher) {
      let filterTeacherId = req.user?.teacherId;
      if (!filterTeacherId && req.user?.userId) {
        const rows = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0) filterTeacherId = rows[0].teacher_id;
      }
      if (!filterTeacherId) {
        const rows = await db.query('SELECT teacher_id FROM teachers LIMIT 1');
        if (rows.length > 0) filterTeacherId = rows[0].teacher_id;
      }

      // Find teacher's assigned groups
      let groupIds = [];
      if (filterTeacherId) {
        const teacherRows = await db.query('SELECT assigned_group_ids FROM teachers WHERE teacher_id = ?', [filterTeacherId]);
        if (teacherRows.length > 0 && teacherRows[0].assigned_group_ids) {
          try {
            groupIds = typeof teacherRows[0].assigned_group_ids === 'string' ? JSON.parse(teacherRows[0].assigned_group_ids) : teacherRows[0].assigned_group_ids;
          } catch (e) {}
        }
        const ttGroups = await db.query('SELECT DISTINCT group_id FROM timetables WHERE teacher_id = ?', [filterTeacherId]);
        ttGroups.forEach(g => { if (!groupIds.includes(g.group_id)) groupIds.push(g.group_id); });
      }

      if (groupIds.length > 0) {
        whereClauses.push(`e.group_id IN (${groupIds.join(',')})`);
      }
    }

    if (group_id) { whereClauses.push('e.group_id = ?'); params.push(group_id); }
    if (exam_group_id) { whereClauses.push('e.exam_group_id = ?'); params.push(exam_group_id); }
    if (subject_id) { whereClauses.push('e.subject_id = ?'); params.push(subject_id); }
    if (status) { whereClauses.push('e.status = ?'); params.push(status); }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const exams = await db.query(
      `SELECT e.*, 
        sub.subject_name, sub.subject_code,
        g.group_name, g.group_code,
        eg.exam_group_code, eg.exam_group_name,
        COALESCE(r.room_number, 'Room 101') as room_number,
        COALESCE(r.building, 'Main Block A') as building
       FROM exams e
       JOIN subjects sub ON e.subject_id = sub.subject_id
       LEFT JOIN student_groups g ON e.group_id = g.group_id
       LEFT JOIN exam_groups eg ON e.exam_group_id = eg.exam_group_id
       LEFT JOIN rooms r ON e.room_id = r.room_id
       ${whereSql}
       ORDER BY e.exam_date ASC, e.start_time ASC`,
      params
    );

    return sendSuccess(res, 'Exams fetched successfully', { exams });
  } catch (error) {
    next(error);
  }
}

async function createExam(req, res, next) {
  try {
    const {
      exam_title, category = 'Midterm', semester = 'Semester 1', academic_year = '2025-2026',
      group_id, exam_group_id, subject_id, exam_date, start_time = '08:00:00', end_time = '09:30:00',
      duration_minutes = 90, room_id = 1, status = 'Active'
    } = req.body;

    if (!exam_title || !subject_id || (!group_id && !exam_group_id) || !exam_date) {
      return sendError(res, 'Exam title, subject, target group/exam group, and date are required', 400);
    }

    // If an Exam Group is selected, schedule exam entries for ALL assigned class groups in that Exam Group
    if (exam_group_id) {
      const egClasses = await db.query(
        'SELECT group_id FROM exam_group_classes WHERE exam_group_id = ?',
        [exam_group_id]
      );

      if (egClasses.length > 0) {
        for (const egc of egClasses) {
          await db.query(
            `INSERT INTO exams (exam_title, category, semester, academic_year, subject_id, group_id, exam_group_id, room_id, exam_date, start_time, end_time, duration_minutes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [exam_title, category, semester, academic_year, subject_id, egc.group_id, exam_group_id, room_id || 1, exam_date, start_time, end_time, duration_minutes, status]
          );
        }
        return sendSuccess(res, `Exam scheduled successfully for ${egClasses.length} class groups in Exam Group`, {}, 201);
      }
    }

    // Standard single group schedule
    const result = await db.query(
      `INSERT INTO exams (exam_title, category, semester, academic_year, subject_id, group_id, exam_group_id, room_id, exam_date, start_time, end_time, duration_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [exam_title, category, semester, academic_year, subject_id, group_id || null, exam_group_id || null, room_id || 1, exam_date, start_time, end_time, duration_minutes, status]
    );

    try {
      const { notifyRealtime } = require('../utils/socket');
      notifyRealtime('exam_created', { exam_id: result.insertId, exam_title });
    } catch (e) {}

    return sendSuccess(res, 'Exam scheduled successfully', { exam_id: result.insertId, exam_title }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateExam(req, res, next) {
  try {
    const { id } = req.params;
    const {
      exam_title, category, semester, academic_year, subject_id, group_id, exam_group_id,
      exam_date, start_time, end_time, duration_minutes, room_id, status
    } = req.body;

    let updateFields = [];
    let params = [];

    if (exam_title) { updateFields.push('exam_title = ?'); params.push(exam_title); }
    if (category) { updateFields.push('category = ?'); params.push(category); }
    if (semester) { updateFields.push('semester = ?'); params.push(semester); }
    if (academic_year) { updateFields.push('academic_year = ?'); params.push(academic_year); }
    if (subject_id) { updateFields.push('subject_id = ?'); params.push(subject_id); }
    if (group_id) { updateFields.push('group_id = ?'); params.push(group_id); }
    if (exam_group_id !== undefined) { updateFields.push('exam_group_id = ?'); params.push(exam_group_id || null); }
    if (exam_date) { updateFields.push('exam_date = ?'); params.push(exam_date); }
    if (start_time) { updateFields.push('start_time = ?'); params.push(start_time); }
    if (end_time) { updateFields.push('end_time = ?'); params.push(end_time); }
    if (duration_minutes) { updateFields.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (room_id !== undefined) { updateFields.push('room_id = ?'); params.push(room_id || null); }
    if (status) { updateFields.push('status = ?'); params.push(status); }

    if (updateFields.length === 0) {
      return sendError(res, 'No fields provided for update', 400);
    }

    params.push(id);
    await db.query(`UPDATE exams SET ${updateFields.join(', ')} WHERE exam_id = ?`, params);

    return sendSuccess(res, 'Exam updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteExam(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM exams WHERE exam_id = ?', [id]);
    return sendSuccess(res, 'Exam deleted successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = { getExams, createExam, updateExam, deleteExam, getExamGroups, createExamGroup, deleteExamGroup };
