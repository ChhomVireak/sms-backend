const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


// Save historical record of previous semester before advancing to a new semester
async function recordSemesterHistoryForGroup(groupId, currentSem, currentYear) {
  try {
    const students = await db.query('SELECT student_id, group_id, program_id FROM students WHERE group_id = ?', [groupId]);
    const todayStr = new Date().toISOString().slice(0, 10);
    const semLabel = `Year ${currentYear || 1} · Semester ${currentSem || 1}`;

    for (const stu of students) {
      const existing = await db.query(
        'SELECT history_id FROM student_semester_history WHERE student_id = ? AND semester_id = ?',
        [stu.student_id, currentSem]
      );
      if (existing.length === 0) {
        await db.query(
          `INSERT INTO student_semester_history 
            (student_id, group_id, program_id, academic_year_level, semester_id, semester_label, status, promotion_date)
           VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?)`,
          [stu.student_id, stu.group_id, stu.program_id, currentYear || 1, currentSem || 1, semLabel, todayStr]
        );
      }
    }
  } catch (e) {
    console.error('Record semester history error:', e.message);
  }
}

// Auto-advance semester if elapsed months >= program's semester_duration_months
async function checkAndAutoPromoteGroups() {
  try {
    const groups = await db.query(
      `SELECT g.group_id, g.group_code, g.current_semester, g.academic_year_level, g.created_at, g.semester_start_date,
              p.semester_duration_months, p.total_semesters
       FROM student_groups g
       JOIN programs p ON g.program_id = p.program_id
       WHERE g.status != 'GRADUATED' OR g.status IS NULL`
    );

    const now = new Date();

    for (const g of groups) {
      const startDate = g.semester_start_date ? new Date(g.semester_start_date) : new Date(g.created_at || now);
      const monthsDuration = g.semester_duration_months || 5;

      const elapsedMonths = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
      const expectedSemestersPassed = Math.floor(elapsedMonths / monthsDuration);

      if (expectedSemestersPassed > 0) {
        // 1. Preserve old semester history before promotion
        await recordSemesterHistoryForGroup(g.group_id, g.current_semester, g.academic_year_level);

        let newSem = (g.current_semester || 1) + expectedSemestersPassed;
        const maxSems = g.total_semesters || 8;

        if (newSem > maxSems) {
          await db.query("UPDATE student_groups SET status = 'GRADUATED' WHERE group_id = ?", [g.group_id]);
          notifyRealtime('group_updated', { group_id: g.group_id, status: 'GRADUATED' });
        } else {
          const newYear = Math.ceil(newSem / 2);
          const newStartDate = new Date(now).toISOString().slice(0, 10);
          await db.query(
            'UPDATE student_groups SET current_semester = ?, academic_year_level = ?, semester_start_date = ? WHERE group_id = ?',
            [newSem, newYear, newStartDate, g.group_id]
          );
          notifyRealtime('group_updated', { group_id: g.group_id, current_semester: newSem, academic_year_level: newYear });
        }
      }
    }
  } catch (e) {
    console.error('Auto promote check error:', e.message);
  }
}

async function getGroups(req, res, next) {
  try {
    await checkAndAutoPromoteGroups();

    const { program_id, teacher_only } = req.query;
    let whereClauses = [];
    let params = [];

    if (program_id) {
      whereClauses.push('g.program_id = ?');
      params.push(program_id);
    }

    const isTeacher = (req.user && req.user.role === 'TEACHER') || teacher_only === 'true';
    if (isTeacher) {
      let teacherId = req.user ? req.user.teacherId : null;
      let teacherRow = null;

      if (teacherId) {
        const rows = await db.query('SELECT teacher_id, assigned_group_ids FROM teachers WHERE teacher_id = ?', [teacherId]);
        if (rows.length > 0) teacherRow = rows[0];
      }

      if (!teacherRow && req.user && req.user.userId) {
        const rows = await db.query('SELECT teacher_id, assigned_group_ids FROM teachers WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0) {
          teacherRow = rows[0];
          teacherId = teacherRow.teacher_id;
        }
      }

      if (!teacherId) {
        const rows = await db.query('SELECT teacher_id, assigned_group_ids FROM teachers LIMIT 1');
        if (rows.length > 0) {
          teacherRow = rows[0];
          teacherId = teacherRow.teacher_id;
        }
      }

      let groupIds = [];
      if (teacherRow && teacherRow.assigned_group_ids) {
        try {
          const parsed = typeof teacherRow.assigned_group_ids === 'string'
            ? JSON.parse(teacherRow.assigned_group_ids)
            : teacherRow.assigned_group_ids;
          if (Array.isArray(parsed) && parsed.length > 0) groupIds = parsed.map(Number);
        } catch (e) {
          groupIds = String(teacherRow.assigned_group_ids).split(',').map(Number).filter(Boolean);
        }
      }

      if (teacherId) {
        const ttGroups = await db.query('SELECT DISTINCT group_id FROM timetables WHERE teacher_id = ?', [teacherId]);
        ttGroups.forEach(g => {
          if (g.group_id && !groupIds.includes(Number(g.group_id))) {
            groupIds.push(Number(g.group_id));
          }
        });
      }

      if (groupIds.length === 0) {
        const activeGroups = await db.query('SELECT group_id FROM student_groups LIMIT 4');
        if (activeGroups.length > 0) {
          groupIds = activeGroups.map(g => Number(g.group_id));
          if (teacherId) {
            await db.query('UPDATE teachers SET assigned_group_ids = ? WHERE teacher_id = ?', [JSON.stringify(groupIds), teacherId]);
          }
        }
      }

      if (groupIds.length > 0) {
        whereClauses.push(`g.group_id IN (${groupIds.join(',')})`);
      }
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const groups = await db.query(
      `SELECT g.*, 
        COALESCE(g.current_semester, 1) as current_semester,
        COALESCE(g.academic_year_level, CEIL(COALESCE(g.current_semester, 1) / 2)) as academic_year_level,
        p.program_code, p.program_name, p.degree, p.duration_years, p.total_semesters, p.tuition_fee_per_semester, p.semester_duration_months,
        COUNT(s.student_id) as student_count
       FROM student_groups g
       LEFT JOIN programs p ON g.program_id = p.program_id
       LEFT JOIN students s ON g.group_id = s.group_id
       ${whereSql}
       GROUP BY g.group_id
       ORDER BY g.group_code ASC`,
      params
    );

    for (let g of groups) {
      let subRows = [];
      if (isTeacher) {
        let tid = req.user ? req.user.teacherId : null;
        if (tid) {
          subRows = await db.query(
            `SELECT DISTINCT sub.subject_id, sub.subject_code, sub.subject_name
             FROM timetables tt
             JOIN subjects sub ON tt.subject_id = sub.subject_id
             WHERE tt.group_id = ? AND tt.teacher_id = ?`,
            [g.group_id, tid]
          );
        }
      }

      if (!subRows || subRows.length === 0) {
        subRows = await db.query(
          `SELECT DISTINCT sub.subject_id, sub.subject_code, sub.subject_name
           FROM timetables tt
           JOIN subjects sub ON tt.subject_id = sub.subject_id
           WHERE tt.group_id = ?`,
          [g.group_id]
        );
      }

      if (!subRows || subRows.length === 0) {
        subRows = await db.query(
          `SELECT subject_id, subject_code, subject_name FROM subjects LIMIT 1`
        );
      }

      g.taught_subjects = subRows;
      g.taught_subjects_text = subRows.map(s => `${s.subject_name} (${s.subject_code})`).join(', ');
    }

    return sendSuccess(res, 'Groups fetched', { groups });
  } catch (error) {
    next(error);
  }
}

async function createGroup(req, res, next) {
  try {
    const {
      group_code, group_name, shift, program_id, generation = 'Gen 9', max_capacity = 40,
      academic_year_level = 1, current_semester = 1, semester_start_date, semester_end_date
    } = req.body;

    if (!group_code || !group_name || !shift) {
      return sendError(res, 'Group code, name and shift are required', 400);
    }

    const startDate = semester_start_date || new Date().toISOString().slice(0, 10);
    const calculatedYear = Math.ceil(current_semester / 2);

    const result = await db.query(
      'INSERT INTO student_groups (group_code, group_name, shift, program_id, generation, max_capacity, academic_year_level, current_semester, semester_start_date, semester_end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [group_code, group_name, shift.toUpperCase(), program_id || null, generation, max_capacity, calculatedYear, current_semester, startDate, semester_end_date || null]
    );

    notifyRealtime('group_created', { group_id: result.insertId, group_code, group_name });

    return sendSuccess(res, 'Group created successfully', { group_id: result.insertId, group_code, group_name }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateGroup(req, res, next) {
  try {
    const { id } = req.params;
    const {
      group_code, group_name, shift, program_id, generation = 'Gen 9', max_capacity = 40,
      academic_year_level = 1, current_semester = 1, semester_start_date, semester_end_date
    } = req.body;

    const startDate = semester_start_date || new Date().toISOString().slice(0, 10);
    const calculatedYear = Math.ceil(current_semester / 2);

    await db.query(
      'UPDATE student_groups SET group_code = ?, group_name = ?, shift = ?, program_id = ?, generation = ?, max_capacity = ?, academic_year_level = ?, current_semester = ?, semester_start_date = ?, semester_end_date = ? WHERE group_id = ?',
      [group_code, group_name, shift.toUpperCase(), program_id || null, generation, max_capacity, calculatedYear, current_semester, startDate, semester_end_date || null, id]
    );

    notifyRealtime('group_updated', { group_id: id, group_code, group_name });

    return sendSuccess(res, 'Group updated successfully');
  } catch (error) {
    next(error);
  }
}

async function getPromotionAudit(req, res, next) {
  try {
    const { id } = req.params;
    const gRows = await db.query('SELECT * FROM student_groups WHERE group_id = ?', [id]);
    if (gRows.length === 0) return sendError(res, 'Class group not found', 404);

    const group = gRows[0];
    const currentSem = group.current_semester || 1;
    const currentYear = group.academic_year_level || Math.ceil(currentSem / 2);
    const nextSem = currentSem + 1;
    const nextYear = Math.ceil(nextSem / 2);

    // Fetch enrolled students and their exam results
    const students = await db.query(
      `SELECT s.student_id, s.custom_student_id, s.first_name, s.last_name, s.gender, s.group_id,
              COALESCE(s.academic_year_level, ?) as current_year_level,
              COALESCE(s.current_semester, ?) as current_student_semester,
              COALESCE(s.reexam_status, 'NONE') as reexam_status,
              s.is_retained,
              (
                SELECT COUNT(*) FROM academic_results ar 
                JOIN exams e ON ar.exam_id = e.exam_id 
                WHERE ar.student_id = s.student_id AND (ar.raw_score < 50 OR ar.letter_grade = 'F')
              ) as failed_exam_count,
              (
                SELECT MIN(ar.raw_score) FROM academic_results ar 
                WHERE ar.student_id = s.student_id
              ) as lowest_score
       FROM students s
       WHERE s.group_id = ?`,
      [currentYear, currentSem, id]
    );

    const auditList = students.map(s => {
      const hasFailedExam = s.failed_exam_count > 0 || (s.lowest_score !== null && Number(s.lowest_score) < 50);
      const isClearedForPromotion = !hasFailedExam || s.reexam_status === 'PASSED_REEXAM';

      let promotionStatus = 'ELIGIBLE_PASSED';
      let statusTextKh = 'Passed (Eligible for Promotion)';

      if (!isClearedForPromotion) {
        promotionStatus = 'RETAINED_FAILED';
        statusTextKh = 'Failed (Retained - Pending Re-Exam)';
      } else if (s.reexam_status === 'PASSED_REEXAM') {
        promotionStatus = 'ELIGIBLE_REEXAM_CLEARED';
        statusTextKh = 'Re-exam Cleared (Eligible for Promotion)';
      }

      return {
        ...s,
        has_failed_exam: hasFailedExam,
        is_cleared: isClearedForPromotion,
        promotion_status: promotionStatus,
        status_text_kh: statusTextKh
      };
    });

    const eligible = auditList.filter(s => s.is_cleared);
    const retained = auditList.filter(s => !s.is_cleared);

    return sendSuccess(res, 'Promotion audit calculated', {
      group: {
        ...group,
        next_semester: nextSem,
        next_year: nextYear
      },
      total_students: students.length,
      eligible_count: eligible.length,
      retained_count: retained.length,
      students: auditList
    });
  } catch (error) {
    next(error);
  }
}

async function resolveReexam(req, res, next) {
  try {
    const { student_id, status } = req.body;
    if (!student_id) return sendError(res, 'student_id is required', 400);

    const newReexamStatus = status || 'PASSED_REEXAM';
    const isRetained = newReexamStatus !== 'PASSED_REEXAM';

    await db.query(
      'UPDATE students SET reexam_status = ?, is_retained = ? WHERE student_id = ?',
      [newReexamStatus, isRetained, student_id]
    );

    notifyRealtime('student_updated', { student_id, reexam_status: newReexamStatus });

    return sendSuccess(res, `Updated Re-Exam status (${newReexamStatus}) successfully!`);
  } catch (error) {
    next(error);
  }
}

async function promoteGroup(req, res, next) {
  try {
    const { id } = req.params;
    const gRows = await db.query('SELECT * FROM student_groups WHERE group_id = ?', [id]);
    if (gRows.length === 0) return sendError(res, 'Class group not found', 404);

    const group = gRows[0];
    const currentSem = group.current_semester || 1;
    const currentYear = group.academic_year_level || Math.ceil(currentSem / 2);
    const newSem = currentSem + 1;
    const newYear = Math.ceil(newSem / 2);
    const todayStr = new Date().toISOString().slice(0, 10);

    if (newSem > 8) {
      await db.query('UPDATE student_groups SET status = \'GRADUATED\' WHERE group_id = ?', [id]);
      notifyRealtime('group_updated', { group_id: id, status: 'GRADUATED' });
      return sendSuccess(res, `Class group ${group.group_code} has successfully GRADUATED!`);
    }

    // 1. Preserve old semester history before advancing
    await recordSemesterHistoryForGroup(id, currentSem, currentYear);

    // 2. Fetch all group students and evaluate pass/fail exam status
    const groupStudents = await db.query(
      `SELECT s.student_id, s.reexam_status,
              (
                SELECT COUNT(*) FROM academic_results ar 
                WHERE ar.student_id = s.student_id AND (ar.raw_score < 50 OR ar.letter_grade = 'F')
              ) as failed_exam_count
       FROM students s WHERE s.group_id = ?`,
      [id]
    );

    let promotedStudentsCount = 0;
    let retainedStudentsCount = 0;

    for (const stu of groupStudents) {
      const hasFailed = stu.failed_exam_count > 0;
      const isCleared = !hasFailed || stu.reexam_status === 'PASSED_REEXAM';

      if (isCleared) {
        // Promote student to the new semester & year
        await db.query(
          `UPDATE students 
           SET academic_year_level = ?, current_semester = ?, reexam_status = 'NONE', is_retained = FALSE 
           WHERE student_id = ?`,
          [newYear, newSem, stu.student_id]
        );
        promotedStudentsCount++;
      } else {
        // Student retains current year and semester until Re-Exam!
        await db.query(
          `UPDATE students 
           SET academic_year_level = ?, current_semester = ?, reexam_status = 'FAILED_PENDING_REEXAM', is_retained = TRUE 
           WHERE student_id = ?`,
          [currentYear, currentSem, stu.student_id]
        );
        retainedStudentsCount++;
      }
    }

    // 3. Advance Group Semester & Year
    await db.query('UPDATE student_groups SET current_semester = ?, academic_year_level = ?, semester_start_date = ? WHERE group_id = ?', [newSem, newYear, todayStr, id]);

    notifyRealtime('group_updated', { group_id: id, current_semester: newSem, academic_year_level: newYear });

    return sendSuccess(res, `Class group ${group.group_code} promoted to Year ${newYear} Semester ${newSem}! (${promotedStudentsCount} students promoted, ${retainedStudentsCount} students retained for Re-Exam)`);
  } catch (error) {
    next(error);
  }
}

async function promoteAllGroups(req, res, next) {
  try {
    const groups = await db.query('SELECT * FROM student_groups');
    let promotedCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const g of groups) {
      const currentSem = g.current_semester || 1;
      const currentYear = g.academic_year_level || Math.ceil(currentSem / 2);

      // Preserve old semester record
      await recordSemesterHistoryForGroup(g.group_id, currentSem, currentYear);

      const newSem = currentSem + 1;
      if (newSem > 8) {
        await db.query("UPDATE student_groups SET status = 'GRADUATED' WHERE group_id = ?", [g.group_id]);
      } else {
        const newYear = Math.ceil(newSem / 2);
        await db.query('UPDATE student_groups SET current_semester = ?, academic_year_level = ?, semester_start_date = ? WHERE group_id = ?', [newSem, newYear, todayStr, g.group_id]);
      }
      promotedCount++;
    }

    notifyRealtime('groups_bulk_promoted', { total_promoted: promotedCount });

    return sendSuccess(res, `Bulk promoted ${promotedCount} class groups successfully!`);
  } catch (error) {
    next(error);
  }
}

async function deleteGroup(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM student_groups WHERE group_id = ?', [id]);

    notifyRealtime('group_deleted', { group_id: id });

    return sendSuccess(res, 'Group deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function assignStudents(req, res, next) {
  try {
    const { id } = req.params;
    const { student_ids } = req.body;

    if (!student_ids || !Array.isArray(student_ids)) {
      return sendError(res, 'student_ids array is required', 400);
    }

    const groupCheck = await db.query('SELECT max_capacity FROM student_groups WHERE group_id = ?', [id]);
    if (groupCheck.length === 0) {
      return sendError(res, 'Class group not found', 404);
    }

    const maxCap = groupCheck[0].max_capacity || 40;
    const currentEnrolled = await db.query('SELECT COUNT(*) as count FROM students WHERE group_id = ?', [id]);
    const enrolledCount = currentEnrolled[0].count || 0;

    if (enrolledCount + student_ids.length > maxCap) {
      return sendError(res, `Cannot assign ${student_ids.length} students. Class capacity limit reached (${enrolledCount}/${maxCap}).`, 409);
    }

    for (const stuId of student_ids) {
      await db.query('UPDATE students SET group_id = ? WHERE student_id = ?', [id, stuId]);
    }

    notifyRealtime('students_assigned_group', { group_id: id, total_students: student_ids.length });

    return sendSuccess(res, `Successfully assigned ${student_ids.length} students to class group`);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getGroups,
  createGroup,
  updateGroup,
  getPromotionAudit,
  resolveReexam,
  promoteGroup,
  promoteAllGroups,
  deleteGroup,
  assignStudents
};
