const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

// Auto-migrate UNIQUE KEY constraints for database-level conflict prevention
(async () => {
  try {
    await db.query(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_teacher UNIQUE KEY (teacher_id, day_of_week, slot_id, semester_id)`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_room UNIQUE KEY (room_id, day_of_week, slot_id, semester_id)`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE timetables ADD CONSTRAINT uk_tt_group UNIQUE KEY (group_id, day_of_week, slot_id, semester_id)`);
  } catch (e) {}
})();

async function getTimeSlots(req, res, next) {
  try {
    const slots = await db.query('SELECT * FROM time_slots ORDER BY start_time ASC');
    return sendSuccess(res, 'Time slots fetched', { slots });
  } catch (error) {
    next(error);
  }
}

async function createTimeSlot(req, res, next) {
  try {
    const { slot_name, start_time, end_time, shift = 'MORNING' } = req.body;
    if (!slot_name || !start_time || !end_time) {
      return sendError(res, 'Slot name, start time, and end time are required', 400);
    }

    const sTime = start_time.length === 5 ? `${start_time}:00` : start_time;
    const eTime = end_time.length === 5 ? `${end_time}:00` : end_time;

    const result = await db.query(
      'INSERT INTO time_slots (slot_name, start_time, end_time, shift) VALUES (?, ?, ?, ?)',
      [slot_name, sTime, eTime, shift]
    );

    notifyRealtime('timetable_updated', { action: 'slot_created' });

    return sendSuccess(res, 'New time slot created successfully', {
      slot_id: result.insertId,
      slot_name,
      start_time: sTime,
      end_time: eTime,
      shift
    }, 201);
  } catch (error) {
    next(error);
  }
}

async function getTimetables(req, res, next) {
  try {
    const { group_id, teacher_id, room_id, semester_id, teacher_only } = req.query;
    let whereClauses = [];
    let params = [];

    const isTeacher = (req.user && req.user.role === 'TEACHER') || teacher_only === 'true';
    const isStudent = req.user && String(req.user.role || '').toUpperCase() === 'STUDENT';
    let filterTeacherId = teacher_id;
    let filterGroupId = group_id;

    if (isTeacher && !filterTeacherId) {
      if (req.user && req.user.teacherId) {
        filterTeacherId = req.user.teacherId;
      } else if (req.user && req.user.userId) {
        const rows = await db.query('SELECT teacher_id FROM teachers WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0) filterTeacherId = rows[0].teacher_id;
      }
      if (!filterTeacherId) {
        const rows = await db.query('SELECT teacher_id FROM teachers LIMIT 1');
        if (rows.length > 0) filterTeacherId = rows[0].teacher_id;
      }
    }

    if (isStudent && !filterGroupId) {
      if (req.user && req.user.studentId) {
        const rows = await db.query('SELECT group_id FROM students WHERE student_id = ?', [req.user.studentId]);
        if (rows.length > 0 && rows[0].group_id) filterGroupId = rows[0].group_id;
      }
      if (!filterGroupId && req.user && req.user.userId) {
        const rows = await db.query('SELECT group_id FROM students WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0 && rows[0].group_id) filterGroupId = rows[0].group_id;
      }
    }

    if (filterGroupId) { 
      const checkTt = await db.query('SELECT COUNT(*) as cnt FROM timetables WHERE group_id = ?', [filterGroupId]);
      if (checkTt[0]?.cnt > 0) {
        whereClauses.push('tt.group_id = ?'); 
        params.push(filterGroupId); 
      }
    }
    if (filterTeacherId) { whereClauses.push('tt.teacher_id = ?'); params.push(filterTeacherId); }
    if (room_id) { whereClauses.push('tt.room_id = ?'); params.push(room_id); }
    
    if (semester_id) { 
      whereClauses.push('tt.semester_id = ?'); 
      params.push(semester_id); 
    } else if (filterGroupId && !filterTeacherId) {
      // Default to current semester of the group if no explicit semester_id requested
      const gRows = await db.query('SELECT current_semester FROM student_groups WHERE group_id = ?', [filterGroupId]);
      if (gRows.length > 0 && gRows[0].current_semester) {
        whereClauses.push('tt.semester_id = ?');
        params.push(gRows[0].current_semester);
      }
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT tt.*,
        sub.subject_code, sub.subject_name,
        t.first_name as teacher_fname, t.last_name as teacher_lname,
        g.group_name, g.group_code, g.shift as group_shift,
        r.room_number, r.building,
        ts.slot_name, ts.start_time, ts.end_time, ts.shift as slot_shift
      FROM timetables tt
      JOIN subjects sub ON tt.subject_id = sub.subject_id
      JOIN teachers t ON tt.teacher_id = t.teacher_id
      JOIN student_groups g ON tt.group_id = g.group_id
      JOIN rooms r ON tt.room_id = r.room_id
      JOIN time_slots ts ON tt.slot_id = ts.slot_id
      ${whereSql}
      ORDER BY tt.day_of_week ASC, ts.start_time ASC
    `;

    const entries = await db.query(querySql, params);
    return sendSuccess(res, 'Timetable entries fetched', { timetables: entries });
  } catch (error) {
    next(error);
  }
}

async function createTimetableSlot(req, res, next) {
  try {
    const { semester_id, group_id, subject_id, teacher_id, room_id, slot_id, day_of_week } = req.body;

    if (!group_id || !subject_id || !teacher_id || !room_id || !slot_id || !day_of_week) {
      return sendError(res, 'Group, subject, teacher, room, time slot, and day of week are required', 400);
    }

    const dayUpper = day_of_week.toUpperCase();

    // Dynamically resolve effectiveSemesterId from class group if not provided
    const groupRows = await db.query('SELECT shift, current_semester FROM student_groups WHERE group_id = ?', [group_id]);
    const effectiveSemesterId = semester_id || (groupRows.length > 0 ? (groupRows[0].current_semester || 1) : 1);

    const slotRows = await db.query('SELECT shift FROM time_slots WHERE slot_id = ?', [slot_id]);

    if (groupRows.length > 0 && slotRows.length > 0) {
      const groupShift = (groupRows[0].shift || 'MORNING').toUpperCase();
      const slotShift = (slotRows[0].shift || 'MORNING').toUpperCase();

      if (groupShift !== slotShift) {
        return sendError(res, `Shift Conflict: Class group is enrolled in ${groupShift} shift and cannot be scheduled in a ${slotShift} time slot!`, 409);
      }
    }

    // Constraint Rule: A teacher CAN teach multiple subjects across different groups, BUT CANNOT teach 2 different subjects in the SAME class group
    const existingGroupSubject = await db.query(
      'SELECT DISTINCT subject_id FROM timetables WHERE teacher_id = ? AND group_id = ? AND semester_id = ?',
      [teacher_id, group_id, effectiveSemesterId]
    );

    if (existingGroupSubject.length > 0 && existingGroupSubject[0].subject_id != subject_id) {
      return sendError(res, 'Teacher Subject Constraint: A teacher cannot teach more than one subject in the same class group!', 409);
    }

    // Check teacher time conflict
    const teacherConflict = await db.query(
      'SELECT timetable_id FROM timetables WHERE teacher_id = ? AND day_of_week = ? AND slot_id = ? AND semester_id = ?',
      [teacher_id, dayUpper, slot_id, effectiveSemesterId]
    );
    if (teacherConflict.length > 0) {
      return sendError(res, 'Teacher scheduling conflict: Teacher is already assigned to another class at this time', 409);
    }

    // Check room conflict
    const roomConflict = await db.query(
      'SELECT timetable_id FROM timetables WHERE room_id = ? AND day_of_week = ? AND slot_id = ? AND semester_id = ?',
      [room_id, dayUpper, slot_id, effectiveSemesterId]
    );
    if (roomConflict.length > 0) {
      return sendError(res, 'Room scheduling conflict: Room is already occupied by another class at this time', 409);
    }

    // Check group conflict
    const groupConflict = await db.query(
      'SELECT timetable_id FROM timetables WHERE group_id = ? AND day_of_week = ? AND slot_id = ? AND semester_id = ?',
      [group_id, dayUpper, slot_id, effectiveSemesterId]
    );
    if (groupConflict.length > 0) {
      return sendError(res, 'Group scheduling conflict: Class group already has a subject scheduled at this time', 409);
    }

    const result = await db.query(
      `INSERT INTO timetables (semester_id, group_id, subject_id, teacher_id, room_id, slot_id, day_of_week)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [effectiveSemesterId, group_id, subject_id, teacher_id, room_id, slot_id, dayUpper]
    );

    notifyRealtime('timetable_updated', { timetable_id: result.insertId, group_id, day_of_week: dayUpper });

    return sendSuccess(res, 'Timetable slot assigned successfully', { timetable_id: result.insertId }, 201);
  } catch (error) {
    next(error);
  }
}

async function deleteTimetableSlot(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM timetables WHERE timetable_id = ?', [id]);

    notifyRealtime('timetable_updated', { timetable_id: id, action: 'deleted' });

    return sendSuccess(res, 'Timetable slot deleted');
  } catch (error) {
    next(error);
  }
}

async function clearGroupTimetable(req, res, next) {
  try {
    const { group_id } = req.query;
    if (!group_id) {
      return sendError(res, 'Group ID is required to clear class timetable', 400);
    }

    await db.query('DELETE FROM timetables WHERE group_id = ?', [group_id]);
    notifyRealtime('timetable_updated', { group_id, action: 'cleared' });

    return sendSuccess(res, 'Class timetable cleared successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteTimeSlot(req, res, next) {
  try {
    const { id } = req.params;
    // First remove any timetable slots associated with this time slot
    await db.query('DELETE FROM timetables WHERE slot_id = ?', [id]);
    await db.query('DELETE FROM time_slots WHERE slot_id = ?', [id]);

    notifyRealtime('timetable_updated', { slot_id: id, action: 'time_slot_deleted' });

    return sendSuccess(res, 'Time slot deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function updateTimetableSlot(req, res, next) {
  try {
    const { id } = req.params;
    const { semester_id = 2, group_id, subject_id, teacher_id, room_id, slot_id, day_of_week } = req.body;

    if (!group_id || !subject_id || !teacher_id || !room_id || !slot_id || !day_of_week) {
      return sendError(res, 'Group, subject, teacher, room, time slot, and day of week are required', 400);
    }

    const dayUpper = day_of_week.toUpperCase();

    // Check teacher time conflict (excluding current timetable_id)
    const teacherConflict = await db.query(
      'SELECT timetable_id FROM timetables WHERE teacher_id = ? AND day_of_week = ? AND slot_id = ? AND semester_id = ? AND timetable_id != ?',
      [teacher_id, dayUpper, slot_id, semester_id, id]
    );
    if (teacherConflict.length > 0) {
      return sendError(res, 'Teacher scheduling conflict: Teacher is already assigned to another class at this time', 409);
    }

    // Check room conflict (excluding current timetable_id)
    const roomConflict = await db.query(
      'SELECT timetable_id FROM timetables WHERE room_id = ? AND day_of_week = ? AND slot_id = ? AND semester_id = ? AND timetable_id != ?',
      [room_id, dayUpper, slot_id, semester_id, id]
    );
    if (roomConflict.length > 0) {
      return sendError(res, 'Room scheduling conflict: Room is already occupied by another class at this time', 409);
    }

    await db.query(
      `UPDATE timetables SET semester_id = ?, group_id = ?, subject_id = ?, teacher_id = ?, room_id = ?, slot_id = ?, day_of_week = ?
       WHERE timetable_id = ?`,
      [semester_id, group_id, subject_id, teacher_id, room_id, slot_id, dayUpper, id]
    );

    notifyRealtime('timetable_updated', { timetable_id: id, group_id, day_of_week: dayUpper, action: 'updated' });

    return sendSuccess(res, 'Timetable slot updated successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getTimeSlots,
  createTimeSlot,
  deleteTimeSlot,
  getTimetables,
  createTimetableSlot,
  updateTimetableSlot,
  deleteTimetableSlot,
  clearGroupTimetable
};
