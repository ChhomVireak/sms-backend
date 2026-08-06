const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


async function getAttendance(req, res, next) {
  try {
    const { group_id, subject_id, date, student_id } = req.query;
    let whereClauses = [];
    let params = [];

    if (group_id) {
      whereClauses.push('s.group_id = ?');
      params.push(group_id);
    }
    if (subject_id) {
      whereClauses.push('a.subject_id = ?');
      params.push(subject_id);
    }
    if (date) {
      whereClauses.push('DATE(a.date) = DATE(?)');
      params.push(date);
    }
    if (student_id) {
      whereClauses.push('a.student_id = ?');
      params.push(student_id);
    }

    if (req.user && String(req.user.role || '').toUpperCase() === 'STUDENT') {
      let stuId = req.user.studentId;
      if (!stuId) {
        const sRows = await db.query('SELECT student_id FROM students WHERE user_id = ?', [req.user.userId]);
        if (sRows.length > 0) stuId = sRows[0].student_id;
      }
      if (stuId) {
        whereClauses.push('a.student_id = ?');
        params.push(stuId);
        whereClauses.push('a.teacher_id IS NOT NULL');
      } else {
        whereClauses.push('1 = 0');
      }
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT DISTINCT a.attendance_id, a.student_id, a.subject_id, a.teacher_id, a.date, a.time_slot, a.status, a.flagged, a.note,
        s.custom_student_id, s.first_name, s.last_name, s.image,
        sub.subject_code, sub.subject_name,
        t.first_name as teacher_fname, t.last_name as teacher_lname
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      LEFT JOIN subjects sub ON a.subject_id = sub.subject_id
      LEFT JOIN teachers t ON a.teacher_id = t.teacher_id
      ${whereSql}
      ORDER BY a.date DESC, a.time_slot ASC, a.attendance_id DESC
    `;

    const records = await db.query(querySql, params);
    return sendSuccess(res, 'Attendance fetched', { attendance: records });
  } catch (error) {
    console.error('GET ATTENDANCE ERROR:', error);
    next(error);
  }
}

async function markAttendance(req, res, next) {
  try {
    const { group_id, subject_id, teacher_id, date, records, attendance } = req.body;
    const finalRecords = records || attendance;

    if (!date || !finalRecords || !Array.isArray(finalRecords)) {
      return sendError(res, 'Date and array of student attendance records are required', 400);
    }

    // Resolve teacher_id from req.user if teacher
    let effectiveTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER') {
      const teachers = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
      if (teachers.length > 0) effectiveTeacherId = teachers[0].teacher_id;
    }
    if (!effectiveTeacherId) {
      const teachers = await db.query('SELECT teacher_id FROM teachers LIMIT 1');
      if (teachers.length > 0) effectiveTeacherId = teachers[0].teacher_id;
      else effectiveTeacherId = 1;
    }

    // Resolve subject_id from timetables for group_id if missing or generic
    let effectiveSubjectId = subject_id;
    if (group_id) {
      const ttSubject = await db.query('SELECT subject_id FROM timetables WHERE group_id = ? LIMIT 1', [group_id]);
      if (ttSubject.length > 0) effectiveSubjectId = ttSubject[0].subject_id;
    }
    if (!effectiveSubjectId) {
      const masterSub = await db.query("SELECT subject_id FROM subjects WHERE UPPER(subject_name) NOT LIKE '%ACCOUNTING%' ORDER BY subject_id ASC LIMIT 1");
      if (masterSub.length > 0) effectiveSubjectId = masterSub[0].subject_id;
      else effectiveSubjectId = 1;
    }

    const defaultTimeSlot = req.body.time_slot || req.body.timeSlot || '07:30 - 09:00 AM';

    for (const rec of finalRecords) {
      const { student_id, status, flagged = false, note = '', notes = '' } = rec;
      if (!student_id || !status) continue;
      const finalNote = note || notes || '';
      const recTimeSlot = rec.time_slot || defaultTimeSlot;

      // Delete previous attendance record ONLY for this specific student, date, and time slot
      await db.query(
        'DELETE FROM attendance WHERE student_id = ? AND DATE(date) = DATE(?) AND (time_slot = ? OR time_slot IS NULL)',
        [student_id, date, recTimeSlot]
      );

      await db.query(
        `INSERT INTO attendance (student_id, subject_id, teacher_id, date, time_slot, status, flagged, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [student_id, effectiveSubjectId, effectiveTeacherId, date, recTimeSlot, status, flagged ? 1 : 0, finalNote]
      );
    }

    try {
      notifyRealtime('attendance_marked', { group_id, date });
      notifyRealtime('ATTENDANCE_UPDATED', { group_id, date });
    } catch (e) {}

    return sendSuccess(res, 'Attendance recorded successfully');
  } catch (error) {
    next(error);
  }
}

async function markMultiDayLeave(req, res, next) {
  try {
    const { student_id, start_date, end_date, reason, status = 'EXCUSED', subject_id, teacher_id } = req.body;
    if (!student_id || !start_date || !end_date) {
      return sendError(res, 'Student ID, start date, and end date are required', 400);
    }

    // Resolve student's class group_id
    const studentRows = await db.query('SELECT group_id FROM students WHERE student_id = ?', [student_id]);
    const groupId = studentRows.length > 0 ? studentRows[0].group_id : null;

    // Resolve valid effectiveTeacherId from DB
    let effectiveTeacherId = teacher_id;
    if (req.user && req.user.role === 'TEACHER') {
      const teachers = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
      if (teachers.length > 0) effectiveTeacherId = teachers[0].teacher_id;
    }
    if (!effectiveTeacherId) {
      const teachers = await db.query('SELECT teacher_id FROM teachers LIMIT 1');
      if (teachers.length > 0) effectiveTeacherId = teachers[0].teacher_id;
      else effectiveTeacherId = null;
    }

    // Resolve valid effectiveSubjectId from DB
    let effectiveSubjectId = subject_id;
    if (!effectiveSubjectId && groupId) {
      const ttSubject = await db.query('SELECT subject_id FROM timetables WHERE group_id = ? LIMIT 1', [groupId]);
      if (ttSubject.length > 0) effectiveSubjectId = ttSubject[0].subject_id;
    }
    if (!effectiveSubjectId) {
      const masterSub = await db.query("SELECT subject_id FROM subjects ORDER BY subject_id ASC LIMIT 1");
      if (masterSub.length > 0) effectiveSubjectId = masterSub[0].subject_id;
      else effectiveSubjectId = null;
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    let curr = new Date(start);

    while (curr <= end) {
      const dateStr = curr.toISOString().slice(0, 10);
      await db.query('DELETE FROM attendance WHERE student_id = ? AND DATE(date) = DATE(?)', [student_id, dateStr]);
      await db.query(
        `INSERT INTO attendance (student_id, subject_id, teacher_id, date, status, flagged, note)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [student_id, effectiveSubjectId, effectiveTeacherId, dateStr, status, reason || 'Multi-day leave']
      );

      if (groupId) {
        const groupTt = await db.query('SELECT timetable_id FROM timetables WHERE group_id = ?', [groupId]);
        for (const tt of groupTt) {
          await db.query(
            `INSERT INTO student_attendance (student_id, group_id, timetable_id, date, status, recorded_by)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), recorded_by = VALUES(recorded_by)`,
            [student_id, groupId, tt.timetable_id, dateStr, status, req.user ? req.user.userId : null]
          );
        }
      }

      curr.setDate(curr.getDate() + 1);
    }

    try {
      notifyRealtime('attendance_marked', { student_id, start_date, end_date });
      notifyRealtime('ATTENDANCE_UPDATED', { student_id, start_date, end_date });
    } catch (e) {}

    return sendSuccess(res, 'Multi-day leave recorded successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteAttendance(req, res, next) {
  try {
    const { attendance_id, student_id, date } = req.query;
    if (attendance_id) {
      await db.query('DELETE FROM attendance WHERE attendance_id = ?', [attendance_id]);
    } else if (student_id && date) {
      await db.query('DELETE FROM attendance WHERE student_id = ? AND date = ?', [student_id, date]);
    } else {
      return sendError(res, 'Attendance ID or student_id and date are required', 400);
    }
    return sendSuccess(res, 'Attendance record deleted');
  } catch (error) {
    next(error);
  }
}

async function getAttendanceStats(req, res, next) {
  try {
    const totalRecords = await db.query('SELECT COUNT(*) as count FROM attendance');
    const presentRecords = await db.query("SELECT COUNT(*) as count FROM attendance WHERE UPPER(status) = 'PRESENT'");
    const absentRecords = await db.query("SELECT COUNT(*) as count FROM attendance WHERE UPPER(status) = 'ABSENT'");

    const total = totalRecords[0].count;
    const present = presentRecords[0].count;
    const absent = absentRecords[0].count;
    const rate = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    return sendSuccess(res, 'Attendance stats fetched', {
      total,
      present,
      absent,
      rate: parseFloat(rate)
    });
  } catch (error) {
    next(error);
  }
}

async function getSessionAttendance(req, res, next) {
  try {
    const { timetable_id, date } = req.query;
    if (!timetable_id || !date) {
      return sendError(res, 'timetable_id and date are required', 400);
    }

    const ttRows = await db.query(
      `SELECT tt.*, g.group_code, g.group_name, sub.subject_code, sub.subject_name,
              ts.slot_name, ts.start_time, ts.end_time, ts.shift, r.room_number, r.building,
              t.first_name as teacher_fname, t.last_name as teacher_lname
       FROM timetables tt
       JOIN student_groups g ON tt.group_id = g.group_id
       JOIN subjects sub ON tt.subject_id = sub.subject_id
       JOIN time_slots ts ON tt.slot_id = ts.slot_id
       LEFT JOIN rooms r ON tt.room_id = r.room_id
       LEFT JOIN teachers t ON tt.teacher_id = t.teacher_id
       WHERE tt.timetable_id = ?`,
      [timetable_id]
    );

    if (ttRows.length === 0) {
      return sendError(res, 'Session timetable record not found', 404);
    }

    const sessionInfo = ttRows[0];

    const students = await db.query(
      `SELECT s.student_id, s.custom_student_id, s.first_name, s.last_name, s.gender, s.image,
              COALESCE(sa.status, att.status, 'PRESENT') as status,
              COALESCE(att.note, '') as note,
              COALESCE(sa.attendance_id, att.attendance_id) as attendance_id,
              sa.created_at as marked_at,
              CASE WHEN sa.attendance_id IS NOT NULL OR att.attendance_id IS NOT NULL THEN 1 ELSE 0 END as is_marked
       FROM students s
       LEFT JOIN student_attendance sa ON sa.student_id = s.student_id AND sa.timetable_id = ? AND DATE(sa.date) = DATE(?)
       LEFT JOIN attendance att ON att.student_id = s.student_id AND DATE(att.date) = DATE(?) AND (att.subject_id = ? OR att.subject_id IS NULL)
       WHERE s.group_id = ? AND s.status = 'ACTIVE'
       ORDER BY s.custom_student_id ASC, s.last_name ASC`,
      [timetable_id, date, date, sessionInfo.subject_id, sessionInfo.group_id]
    );

    return sendSuccess(res, 'Session attendance roster fetched', {
      session: sessionInfo,
      date,
      students
    });
  } catch (error) {
    next(error);
  }
}

async function markSessionAttendance(req, res, next) {
  try {
    const { timetable_id, date, records } = req.body;

    if (!timetable_id || !date || !records || !Array.isArray(records)) {
      return sendError(res, 'timetable_id, date, and records array are required', 400);
    }

    const ttRows = await db.query('SELECT * FROM timetables WHERE timetable_id = ?', [timetable_id]);
    if (ttRows.length === 0) {
      return sendError(res, 'Invalid timetable_id', 400);
    }
    const sessionInfo = ttRows[0];

    if (req.user && req.user.role === 'TEACHER') {
      let teacherId = req.user.teacherId;
      if (!teacherId) {
        const tRows = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
        if (tRows.length > 0) teacherId = tRows[0].teacher_id;
      }
      if (teacherId && parseInt(sessionInfo.teacher_id) !== parseInt(teacherId)) {
        return sendError(res, 'Access denied. You can only mark attendance for your own assigned classes.', 403);
      }
    }

    for (const rec of records) {
      const { student_id, status = 'PRESENT', note = '' } = rec;
      if (!student_id) continue;

      await db.query(
        `INSERT INTO student_attendance (student_id, group_id, timetable_id, date, status, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           status = VALUES(status),
           recorded_by = VALUES(recorded_by)`,
        [student_id, sessionInfo.group_id, timetable_id, date, status, req.user ? req.user.userId : null]
      );

      try {
        await db.query(
          `DELETE FROM attendance WHERE student_id = ? AND DATE(date) = DATE(?) AND subject_id = ?`,
          [student_id, date, sessionInfo.subject_id]
        );
        await db.query(
          `INSERT INTO attendance (student_id, subject_id, teacher_id, date, status, note)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [student_id, sessionInfo.subject_id, sessionInfo.teacher_id, date, status, note]
        );
      } catch (legacyErr) {}
    }

    try {
      notifyRealtime('attendance_marked', { timetable_id, group_id: sessionInfo.group_id, date });
      notifyRealtime('ATTENDANCE_UPDATED', { timetable_id, date });
    } catch (e) {}

    return sendSuccess(res, 'Session attendance submitted successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAttendance,
  markAttendance,
  markMultiDayLeave,
  deleteAttendance,
  getAttendanceStats,
  getSessionAttendance,
  markSessionAttendance
};
