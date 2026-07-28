const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

// Clean existing duplicate attendance entries & sync attendance subject_id with group timetable subject
(async () => {
  try {
    await db.query(`ALTER TABLE students ADD COLUMN phone_number VARCHAR(50) NULL`);
  } catch (e) {}

  try {
    await db.query(`
      DELETE a1 FROM attendance a1
      INNER JOIN attendance a2 
      ON a1.student_id = a2.student_id 
     AND a1.date = a2.date 
     AND a1.attendance_id < a2.attendance_id
    `);
  } catch (e) {}

  try {
    // Update all existing attendance records to match the timetable subject for that group
    await db.query(`
      UPDATE attendance a
      JOIN students s ON a.student_id = s.student_id
      JOIN timetables tt ON s.group_id = tt.group_id
      SET a.subject_id = tt.subject_id
      WHERE tt.subject_id IS NOT NULL
    `);
  } catch (e) {}

  try {
    // Replace any remaining ACCOUNTING default subject in attendance table with Computer/A+ subject
    const accSubjects = await db.query("SELECT subject_id FROM subjects WHERE UPPER(subject_name) LIKE '%ACCOUNTING%'");
    const repSubjects = await db.query("SELECT subject_id FROM subjects WHERE UPPER(subject_name) LIKE '%COMPUTER%' OR UPPER(subject_name) LIKE '%PROGRAMMING%' OR UPPER(subject_name) LIKE '%A+%' ORDER BY subject_id ASC LIMIT 1");
    
    if (accSubjects.length > 0 && repSubjects.length > 0) {
      for (const acc of accSubjects) {
        await db.query("UPDATE attendance SET subject_id = ? WHERE subject_id = ?", [repSubjects[0].subject_id, acc.subject_id]);
      }
    }
  } catch (e) {}
})();

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
      SELECT DISTINCT a.attendance_id, a.student_id, a.subject_id, a.teacher_id, a.date, a.status, a.flagged, a.note,
        s.custom_student_id, s.first_name, s.last_name, s.image,
        sub.subject_code, sub.subject_name,
        t.first_name as teacher_fname, t.last_name as teacher_lname
      FROM attendance a
      JOIN students s ON a.student_id = s.student_id
      LEFT JOIN subjects sub ON a.subject_id = sub.subject_id
      LEFT JOIN teachers t ON a.teacher_id = t.teacher_id
      ${whereSql}
      ORDER BY a.date DESC, a.attendance_id DESC
    `;

    const records = await db.query(querySql, params);
    return sendSuccess(res, 'Attendance fetched', { attendance: records });
  } catch (error) {
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

    for (const rec of finalRecords) {
      const { student_id, status, flagged = false, note = '', notes = '' } = rec;
      if (!student_id || !status) continue;
      const finalNote = note || notes || '';

      // Delete any previous record for this student on this date to guarantee ONLY 1 record per student per date
      await db.query('DELETE FROM attendance WHERE student_id = ? AND DATE(date) = DATE(?)', [student_id, date]);

      await db.query(
        `INSERT INTO attendance (student_id, subject_id, teacher_id, date, status, flagged, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [student_id, effectiveSubjectId, effectiveTeacherId, date, status, flagged ? 1 : 0, finalNote]
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
    const { student_id, start_date, end_date, reason, status = 'EXCUSED' } = req.body;
    if (!student_id || !start_date || !end_date) {
      return sendError(res, 'Student ID, start date, and end date are required', 400);
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    let curr = new Date(start);

    while (curr <= end) {
      const dateStr = curr.toISOString().slice(0, 10);
      await db.query('DELETE FROM attendance WHERE student_id = ? AND DATE(date) = DATE(?)', [student_id, dateStr]);
      await db.query(
        `INSERT INTO attendance (student_id, subject_id, teacher_id, date, status, flagged, note)
         VALUES (?, 1, 1, ?, ?, 0, ?)`,
        [student_id, dateStr, status, reason || 'Multi-day leave']
      );
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

module.exports = {
  getAttendance,
  markAttendance,
  markMultiDayLeave,
  deleteAttendance,
  getAttendanceStats
};
