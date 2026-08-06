const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Utility helper to build dynamic SQL WHERE clauses cleanly
function buildWhereClause(filters = []) {
  let clauses = [];
  let params = [];

  for (const filter of filters) {
    const { field, value, operator = '=' } = filter;
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
      if (operator.toUpperCase() === 'LIKE') {
        clauses.push(`${field} LIKE ?`);
        params.push(`%${value}%`);
      } else {
        clauses.push(`${field} ${operator} ?`);
        params.push(value);
      }
    }
  }

  const whereSql = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
  return { whereSql, params };
}

// ============================================================================
// A. ACADEMIC REPORTS
// ============================================================================

async function getStudentTranscriptReport(req, res, next) {
  try {
    const { student_id, semester = 'ALL', academic_year = 'ALL' } = req.query;

    let targetStudentId = student_id;
    if (req.user && req.user.role === 'STUDENT') {
      targetStudentId = req.user.studentId || req.user.student_id;
    }

    if (!targetStudentId) {
      return sendError(res, 'Student ID parameter is required', 400);
    }

    const query = `
      SELECT 
        ar.result_id,
        ar.student_id,
        s.custom_student_id,
        s.first_name,
        s.last_name,
        s.current_semester,
        sub.subject_id,
        sub.subject_code,
        sub.subject_name,
        COALESCE(sub.credit, 3) AS credits,
        ar.raw_score,
        ar.letter_grade,
        COALESCE(ar.grade_point, ar.gpa_point, 0.0) AS grade_point,
        e.exam_title,
        e.academic_year,
        e.semester,
        ar.is_published
      FROM academic_results ar
      JOIN students s ON ar.student_id = s.student_id
      JOIN exams e ON ar.exam_id = e.exam_id
      JOIN subjects sub ON e.subject_id = sub.subject_id
      WHERE s.student_id = ?
        AND (? = 'ALL' OR e.semester = ?)
        AND (? = 'ALL' OR e.academic_year = ?)
      ORDER BY e.academic_year DESC, e.semester ASC, sub.subject_code ASC;
    `;

    const results = await db.query(query, [
      targetStudentId, 
      semester, semester, 
      academic_year, academic_year
    ]);

    let totalWeightedPoints = 0;
    let totalCredits = 0;
    results.forEach(r => {
      const pts = parseFloat(r.grade_point || 0);
      const crd = parseInt(r.credits || 3);
      totalWeightedPoints += pts * crd;
      totalCredits += crd;
    });

    const cumulativeGpa = totalCredits > 0 ? (totalWeightedPoints / totalCredits).toFixed(2) : '0.00';

    return sendSuccess(res, 'Student transcript report fetched', {
      student_id: targetStudentId,
      cumulative_gpa: parseFloat(cumulativeGpa),
      total_credits: totalCredits,
      results
    });
  } catch (error) {
    next(error);
  }
}

async function getGpaReport(req, res, next) {
  try {
    const { group_id = 'ALL', program_id = 'ALL', semester = 'ALL', academic_year = 'ALL' } = req.query;

    const query = `
      SELECT 
        s.student_id,
        s.custom_student_id,
        s.first_name,
        s.last_name,
        s.group_id,
        sg.group_code,
        sg.group_name,
        p.program_code,
        p.program_name,
        COUNT(ar.result_id) AS total_subjects_evaluated,
        COALESCE(SUM(COALESCE(sub.credit, 3)), 0) AS total_credits_earned,
        ROUND(
          COALESCE(
            SUM(COALESCE(ar.grade_point, ar.gpa_point, 0.0) * COALESCE(sub.credit, 3)) / 
            NULLIF(SUM(COALESCE(sub.credit, 3)), 0), 
            0.0
          ), 2
        ) AS weighted_gpa
      FROM students s
      LEFT JOIN student_groups sg ON s.group_id = sg.group_id
      LEFT JOIN programs p ON s.program_id = p.program_id
      JOIN academic_results ar ON ar.student_id = s.student_id
      JOIN exams e ON ar.exam_id = e.exam_id
      JOIN subjects sub ON e.subject_id = sub.subject_id
      WHERE (? = 'ALL' OR s.group_id = ?)
        AND (? = 'ALL' OR s.program_id = ?)
        AND (? = 'ALL' OR e.semester = ?)
        AND (? = 'ALL' OR e.academic_year = ?)
      GROUP BY s.student_id, s.custom_student_id, s.first_name, s.last_name, s.group_id, sg.group_code, sg.group_name, p.program_code, p.program_name
      ORDER BY weighted_gpa DESC;
    `;

    const report = await db.query(query, [
      group_id, group_id,
      program_id, program_id,
      semester, semester,
      academic_year, academic_year
    ]);

    return sendSuccess(res, 'GPA Report fetched successfully', { report });
  } catch (error) {
    next(error);
  }
}

async function getClassRankingReport(req, res, next) {
  try {
    const { group_id, semester = 'ALL' } = req.query;

    if (!group_id || group_id === 'ALL') {
      return sendError(res, 'Group ID parameter is required for class ranking', 400);
    }

    const query = `
      SELECT 
        DENSE_RANK() OVER (ORDER BY weighted_gpa DESC) AS class_rank,
        student_id,
        custom_student_id,
        first_name,
        last_name,
        group_code,
        group_name,
        total_credits,
        weighted_gpa
      FROM (
        SELECT 
          s.student_id,
          s.custom_student_id,
          s.first_name,
          s.last_name,
          sg.group_code,
          sg.group_name,
          COALESCE(SUM(COALESCE(sub.credit, 3)), 0) AS total_credits,
          ROUND(
            COALESCE(
              SUM(COALESCE(ar.grade_point, ar.gpa_point, 0.0) * COALESCE(sub.credit, 3)) / 
              NULLIF(SUM(COALESCE(sub.credit, 3)), 0), 0.0
            ), 2
          ) AS weighted_gpa
        FROM students s
        JOIN student_groups sg ON s.group_id = sg.group_id
        LEFT JOIN academic_results ar ON ar.student_id = s.student_id
        LEFT JOIN exams e ON ar.exam_id = e.exam_id
        LEFT JOIN subjects sub ON e.subject_id = sub.subject_id
        WHERE s.group_id = ?
          AND (? = 'ALL' OR e.semester = ?)
        GROUP BY s.student_id, s.custom_student_id, s.first_name, s.last_name, sg.group_code, sg.group_name
      ) AS gpa_table
      ORDER BY class_rank ASC, custom_student_id ASC;
    `;

    const report = await db.query(query, [group_id, semester, semester]);
    return sendSuccess(res, 'Class Ranking Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getReexamReport(req, res, next) {
  try {
    const { group_id = 'ALL', program_id = 'ALL' } = req.query;

    const query = `
      SELECT 
        s.student_id,
        s.custom_student_id,
        s.first_name,
        s.last_name,
        s.gender,
        s.reexam_status,
        s.is_retained,
        sg.group_code,
        sg.group_name,
        p.program_code,
        p.program_name,
        s.status
      FROM students s
      LEFT JOIN student_groups sg ON s.group_id = sg.group_id
      LEFT JOIN programs p ON s.program_id = p.program_id
      WHERE (s.reexam_status != 'NONE' OR s.is_retained = 1)
        AND (? = 'ALL' OR s.group_id = ?)
        AND (? = 'ALL' OR s.program_id = ?)
      ORDER BY s.is_retained DESC, s.custom_student_id ASC;
    `;

    const report = await db.query(query, [group_id, group_id, program_id, program_id]);
    return sendSuccess(res, 'Re-exam / Retained Students List fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getSubjectPassFailReport(req, res, next) {
  try {
    const { semester = 'ALL', academic_year = 'ALL' } = req.query;

    const query = `
      SELECT 
        sub.subject_id,
        sub.subject_code,
        sub.subject_name,
        COUNT(ar.result_id) AS total_students_evaluated,
        COUNT(CASE WHEN ar.letter_grade != 'F' AND ar.raw_score >= 50 THEN 1 END) AS total_passed,
        COUNT(CASE WHEN ar.letter_grade = 'F' OR ar.raw_score < 50 THEN 1 END) AS total_failed,
        ROUND(
          COUNT(CASE WHEN ar.letter_grade != 'F' AND ar.raw_score >= 50 THEN 1 END) * 100.0 / 
          NULLIF(COUNT(ar.result_id), 0), 1
        ) AS pass_rate_pct,
        ROUND(
          COUNT(CASE WHEN ar.letter_grade = 'F' OR ar.raw_score < 50 THEN 1 END) * 100.0 / 
          NULLIF(COUNT(ar.result_id), 0), 1
        ) AS fail_rate_pct
      FROM subjects sub
      LEFT JOIN exams e ON e.subject_id = sub.subject_id
      LEFT JOIN academic_results ar ON ar.exam_id = e.exam_id
      WHERE (? = 'ALL' OR e.semester = ?)
        AND (? = 'ALL' OR e.academic_year = ?)
      GROUP BY sub.subject_id, sub.subject_code, sub.subject_name
      ORDER BY fail_rate_pct DESC, sub.subject_code ASC;
    `;

    const report = await db.query(query, [semester, semester, academic_year, academic_year]);
    return sendSuccess(res, 'Subject Pass/Fail Rate Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// B. ATTENDANCE REPORTS
// ============================================================================

async function getStudentAttendanceSummaryReport(req, res, next) {
  try {
    const { group_id = 'ALL', start_date, end_date } = req.query;

    let whereClauses = ["(? = 'ALL' OR s.group_id = ?)"];
    let params = [group_id, group_id];

    if (start_date) {
      whereClauses.push("sa.date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push("sa.date <= ?");
      params.push(end_date);
    }

    const whereSql = 'WHERE ' + whereClauses.join(' AND ');

    const query = `
      SELECT 
        s.student_id,
        s.custom_student_id,
        s.first_name,
        s.last_name,
        sg.group_code,
        sg.group_name,
        COUNT(sa.attendance_id) AS total_sessions,
        COUNT(CASE WHEN sa.status = 'PRESENT' THEN 1 END) AS present_count,
        COUNT(CASE WHEN sa.status = 'LATE' THEN 1 END) AS late_count,
        COUNT(CASE WHEN sa.status = 'ABSENT' THEN 1 END) AS absent_count,
        COUNT(CASE WHEN sa.status = 'EXCUSED' THEN 1 END) AS excused_count,
        ROUND(
          COUNT(CASE WHEN sa.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0 / NULLIF(COUNT(sa.attendance_id), 0),
          1
        ) AS attendance_rate_pct
      FROM students s
      JOIN student_groups sg ON s.group_id = sg.group_id
      LEFT JOIN student_attendance sa ON sa.student_id = s.student_id
      ${whereSql}
      GROUP BY s.student_id, s.custom_student_id, s.first_name, s.last_name, sg.group_code, sg.group_name
      ORDER BY attendance_rate_pct ASC, s.custom_student_id ASC;
    `;

    const report = await db.query(query, params);
    return sendSuccess(res, 'Student Attendance Summary fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getClassAttendanceRateReport(req, res, next) {
  try {
    const { start_date, end_date } = req.query;

    let whereClauses = [];
    let params = [];

    if (start_date) {
      whereClauses.push("sa.date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push("sa.date <= ?");
      params.push(end_date);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const query = `
      SELECT 
        sg.group_id,
        sg.group_code,
        sg.group_name,
        p.program_code,
        COUNT(sa.attendance_id) AS total_marked_records,
        COUNT(CASE WHEN sa.status = 'PRESENT' THEN 1 END) AS total_present,
        COUNT(CASE WHEN sa.status = 'LATE' THEN 1 END) AS total_late,
        COUNT(CASE WHEN sa.status = 'ABSENT' THEN 1 END) AS total_absent,
        ROUND(
          COUNT(CASE WHEN sa.status IN ('PRESENT', 'LATE') THEN 1 END) * 100.0 / NULLIF(COUNT(sa.attendance_id), 0),
          1
        ) AS class_attendance_rate
      FROM student_groups sg
      LEFT JOIN programs p ON sg.program_id = p.program_id
      LEFT JOIN student_attendance sa ON sa.group_id = sg.group_id
      ${whereSql}
      GROUP BY sg.group_id, sg.group_code, sg.group_name, p.program_code
      ORDER BY class_attendance_rate DESC;
    `;

    const report = await db.query(query, params);
    return sendSuccess(res, 'Class Attendance Rate fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getTeacherCheckinReport(req, res, next) {
  try {
    const { teacher_id = 'ALL', start_date, end_date } = req.query;

    let whereClauses = ["(? = 'ALL' OR ta.teacher_id = ?)"];
    let params = [teacher_id, teacher_id];

    if (start_date) {
      whereClauses.push("ta.date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push("ta.date <= ?");
      params.push(end_date);
    }

    const whereSql = 'WHERE ' + whereClauses.join(' AND ');

    let report = [];
    try {
      const query = `
        SELECT 
          ta.id as checkin_id,
          ta.date,
          ta.check_in_time,
          ta.check_out_time,
          ta.status,
          ta.verification_method,
          ta.distance_meters,
          t.custom_teacher_id,
          t.first_name,
          t.last_name,
          t.department
        FROM teacher_attendance ta
        JOIN teachers t ON ta.teacher_id = t.teacher_id
        ${whereSql}
        ORDER BY ta.date DESC;
      `;
      report = await db.query(query, params);
    } catch (err) {
      const fallbackQuery = `
        SELECT 
          ta.id as checkin_id,
          ta.date,
          ta.status,
          t.custom_teacher_id,
          t.first_name,
          t.last_name,
          t.department
        FROM teacher_attendance ta
        JOIN teachers t ON ta.teacher_id = t.teacher_id
        ${whereSql}
        ORDER BY ta.date DESC;
      `;
      report = await db.query(fallbackQuery, params);
    }

    return sendSuccess(res, 'Teacher Check-in Report fetched', { report: Array.isArray(report) ? report : [] });
  } catch (error) {
    return sendSuccess(res, 'Teacher Check-in Report fetched', { report: [] });
  }
}

// ============================================================================
// C. FINANCIAL REPORTS
// ============================================================================

async function getOutstandingBalanceReport(req, res, next) {
  try {
    const { program_id = 'ALL', group_id = 'ALL' } = req.query;

    let report = [];
    try {
      const query = `
        SELECT v.student_id, v.custom_student_id, v.first_name, v.last_name, 
               v.student_payment_plan as payment_plan,
               v.billing_plan_group, v.covered_by,
               v.total_owed as total_fee, v.total_paid as amount_paid,
               v.outstanding_balance,
               g.group_code, g.group_name,
               p.program_code, p.program_name,
               CASE 
                 WHEN v.outstanding_balance <= 0 THEN 'Paid'
                 WHEN v.total_paid > 0 THEN 'Partial'
                 ELSE 'Unpaid'
               END as payment_status
        FROM v_student_billing_status v
        LEFT JOIN student_groups g ON v.group_id = g.group_id
        LEFT JOIN programs p ON v.program_id = p.program_id
        WHERE (? = 'ALL' OR v.group_id = ?)
          AND (? = 'ALL' OR v.program_id = ?)
          AND v.outstanding_balance > 0
        ORDER BY v.custom_student_id ASC;
      `;
      report = await db.query(query, [group_id, group_id, program_id, program_id]);
    } catch (err) {
      const fallbackQuery = `
        SELECT s.student_id, s.custom_student_id, s.first_name, s.last_name, 
               s.payment_plan,
               0 as total_fee, COALESCE(SUM(pay.amount_paid), 0) as amount_paid,
               0 as outstanding_balance,
               g.group_code, g.group_name,
               p.program_code, p.program_name,
               'Unpaid' as payment_status
        FROM students s
        LEFT JOIN student_groups g ON s.group_id = g.group_id
        LEFT JOIN programs p ON s.program_id = p.program_id
        LEFT JOIN payments pay ON s.student_id = pay.student_id
        WHERE (? = 'ALL' OR s.group_id = ?)
          AND (? = 'ALL' OR s.program_id = ?)
        GROUP BY s.student_id, s.custom_student_id, s.first_name, s.last_name, s.payment_plan, g.group_code, g.group_name, p.program_code, p.program_name
        ORDER BY s.custom_student_id ASC;
      `;
      report = await db.query(fallbackQuery, [group_id, group_id, program_id, program_id]);
    }

    return sendSuccess(res, 'Outstanding Balance Report fetched', { report: Array.isArray(report) ? report : [] });
  } catch (error) {
    return sendSuccess(res, 'Outstanding Balance Report fetched', { report: [] });
  }
}

async function getPaymentCollectionReport(req, res, next) {
  try {
    const { start_date, end_date } = req.query;

    let whereClauses = [];
    let params = [];

    if (start_date) {
      whereClauses.push("p.payment_date >= ?");
      params.push(start_date);
    }
    if (end_date) {
      whereClauses.push("p.payment_date <= ?");
      params.push(end_date);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const query = `
      SELECT 
        DATE_FORMAT(p.payment_date, '%Y-%m') AS payment_month,
        COALESCE(p.payment_method, 'CASH') AS payment_method,
        COUNT(p.payment_id) AS total_transactions,
        SUM(p.amount_paid) AS total_amount_collected
      FROM payments p
      ${whereSql}
      GROUP BY payment_month, payment_method
      ORDER BY payment_month DESC, payment_method ASC;
    `;

    const report = await db.query(query, params);
    return sendSuccess(res, 'Payment Collection Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getRevenueByProgramReport(req, res, next) {
  try {
    const { faculty_id = 'ALL' } = req.query;

    let report = [];
    try {
      const query = `
        SELECT 
          p.program_id, p.program_code, p.program_name,
          COUNT(DISTINCT s.student_id) as total_students,
          COALESCE(SUM(v.total_owed), 0) as total_scheduled,
          COALESCE(SUM(v.total_paid), 0) as total_paid,
          COALESCE(SUM(v.outstanding_balance), 0) as total_outstanding,
          ROUND(
            CASE 
              WHEN COALESCE(SUM(v.total_owed), 0) > 0 
                THEN (COALESCE(SUM(v.total_paid), 0) * 100.0 / SUM(v.total_owed))
              ELSE 0 
            END, 
            1
          ) as collection_rate_pct
        FROM programs p
        LEFT JOIN students s ON s.program_id = p.program_id AND s.status = 'ACTIVE'
        LEFT JOIN v_student_billing_status v ON v.student_id = s.student_id
        WHERE (? = 'ALL' OR p.faculty_id = ?)
        GROUP BY p.program_id, p.program_code, p.program_name
        ORDER BY total_paid DESC;
      `;
      report = await db.query(query, [faculty_id, faculty_id]);
    } catch (err) {
      const fallbackQuery = `
        SELECT 
          p.program_id, p.program_code, p.program_name,
          COUNT(DISTINCT s.student_id) as total_students,
          0 as total_scheduled,
          COALESCE(SUM(pay.amount_paid), 0) as total_paid,
          0 as total_outstanding,
          100.0 as collection_rate_pct
        FROM programs p
        LEFT JOIN students s ON s.program_id = p.program_id AND s.status = 'ACTIVE'
        LEFT JOIN payments pay ON pay.student_id = s.student_id
        WHERE (? = 'ALL' OR p.faculty_id = ?)
        GROUP BY p.program_id, p.program_code, p.program_name
        ORDER BY total_paid DESC;
      `;
      report = await db.query(fallbackQuery, [faculty_id, faculty_id]);
    }

    return sendSuccess(res, 'Revenue by Program Report fetched', { report: Array.isArray(report) ? report : [] });
  } catch (error) {
    return sendSuccess(res, 'Revenue by Program Report fetched', { report: [] });
  }
}

// ============================================================================
// D. ENROLLMENT / STRUCTURE REPORTS
// ============================================================================

async function getClassGroupSummaryReport(req, res, next) {
  try {
    const query = `
      SELECT 
        sg.group_id,
        sg.group_code,
        sg.group_name,
        sg.generation,
        sg.academic_year_level,
        sg.current_semester,
        COALESCE(sg.max_capacity, 40) AS max_capacity,
        COUNT(s.student_id) AS current_student_count,
        (COALESCE(sg.max_capacity, 40) - COUNT(s.student_id)) AS available_seats
      FROM student_groups sg
      LEFT JOIN students s ON s.group_id = sg.group_id AND s.status = 'ACTIVE'
      GROUP BY sg.group_id, sg.group_code, sg.group_name, sg.generation, sg.academic_year_level, sg.current_semester, sg.max_capacity
      ORDER BY sg.group_code ASC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Class/Group Summary fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getProgramEnrollmentReport(req, res, next) {
  try {
    const query = `
      SELECT 
        p.program_id,
        p.program_code,
        p.program_name,
        p.degree,
        f.faculty_name,
        COUNT(s.student_id) AS active_students_count
      FROM programs p
      LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
      LEFT JOIN students s ON s.program_id = p.program_id AND s.status = 'ACTIVE'
      GROUP BY p.program_id, p.program_code, p.program_name, p.degree, f.faculty_name
      ORDER BY active_students_count DESC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Program Enrollment Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getCurriculumCompletionReport(req, res, next) {
  try {
    const { student_id } = req.query;

    if (!student_id) {
      return sendError(res, 'Student ID parameter is required', 400);
    }

    const query = `
      SELECT 
        sub.subject_id,
        sub.subject_code,
        sub.subject_name,
        sub.credit,
        CASE WHEN ar.result_id IS NOT NULL AND ar.raw_score >= 50 THEN 'COMPLETED' ELSE 'PENDING' END AS completion_status,
        ar.letter_grade,
        ar.raw_score
      FROM students s
      JOIN programs p ON s.program_id = p.program_id
      JOIN subjects sub ON sub.program_id = p.program_id
      LEFT JOIN exams e ON e.subject_id = sub.subject_id
      LEFT JOIN academic_results ar ON ar.exam_id = e.exam_id AND ar.student_id = s.student_id
      WHERE s.student_id = ?
      ORDER BY sub.subject_code ASC;
    `;

    const report = await db.query(query, [student_id]);
    return sendSuccess(res, 'Curriculum Completion Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getDepartmentFacultySummaryReport(req, res, next) {
  try {
    const query = `
      SELECT 
        f.faculty_id,
        f.faculty_name,
        COUNT(DISTINCT p.program_id) AS total_programs,
        COUNT(DISTINCT s.student_id) AS total_students,
        COUNT(DISTINCT t.teacher_id) AS total_teachers
      FROM faculties f
      LEFT JOIN programs p ON p.faculty_id = f.faculty_id
      LEFT JOIN students s ON s.program_id = p.program_id AND s.status = 'ACTIVE'
      LEFT JOIN teachers t ON t.faculty = f.faculty_name
      GROUP BY f.faculty_id, f.faculty_name
      ORDER BY total_students DESC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Department/Faculty Summary Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// E. EXAM REPORTS
// ============================================================================

async function getExamScheduleReport(req, res, next) {
  try {
    const { semester = 'ALL', academic_year = 'ALL' } = req.query;

    const query = `
      SELECT 
        e.exam_id,
        e.exam_title,
        e.exam_date,
        e.category,
        e.semester,
        e.academic_year,
        sub.subject_code,
        sub.subject_name,
        r.room_number,
        r.building
      FROM exams e
      JOIN subjects sub ON e.subject_id = sub.subject_id
      LEFT JOIN rooms r ON e.room_id = r.room_id
      WHERE (? = 'ALL' OR e.semester = ?)
        AND (? = 'ALL' OR e.academic_year = ?)
      ORDER BY e.exam_date ASC;
    `;

    const report = await db.query(query, [semester, semester, academic_year, academic_year]);
    return sendSuccess(res, 'Exam Schedule Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getRoomUtilizationReport(req, res, next) {
  try {
    const query = `
      SELECT r.room_id, r.room_number, r.building, r.capacity,
             COUNT(tt.timetable_id) as total_scheduled_slots,
             COUNT(DISTINCT tt.group_id) as distinct_groups_hosted
      FROM rooms r
      LEFT JOIN timetables tt ON r.room_id = tt.room_id
      GROUP BY r.room_id, r.room_number, r.building, r.capacity
      ORDER BY total_scheduled_slots DESC, r.room_number ASC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Room Utilization Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// F. TEACHER REPORTS
// ============================================================================

async function getTeacherWorkloadReport(req, res, next) {
  try {
    const query = `
      SELECT t.teacher_id, t.custom_teacher_id, t.first_name, t.last_name, t.department,
             COUNT(DISTINCT tt.timetable_id) as total_classes,
             COUNT(DISTINCT tt.subject_id) as assigned_subjects_count,
             COUNT(DISTINCT tt.group_id) as assigned_groups_count
      FROM teachers t
      LEFT JOIN timetables tt ON t.teacher_id = tt.teacher_id
      GROUP BY t.teacher_id, t.custom_teacher_id, t.first_name, t.last_name, t.department
      ORDER BY total_classes DESC, t.custom_teacher_id ASC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Teacher Workload Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

async function getPayrollSummaryReport(req, res, next) {
  try {
    const query = `
      SELECT t.teacher_id, t.custom_teacher_id, t.first_name, t.last_name, t.department, t.employment_type,
             COALESCE(t.base_salary, 500) as base_salary,
             t.status
      FROM teachers t
      ORDER BY t.custom_teacher_id ASC;
    `;

    const report = await db.query(query);
    return sendSuccess(res, 'Payroll Summary Report fetched', { report });
  } catch (error) {
    next(error);
  }
}

// ============================================================================
// G. EXECUTIVE DASHBOARD SUMMARY
// ============================================================================

async function getDashboardSummary(req, res, next) {
  try {
    const [studentsCount] = await db.query(`SELECT COUNT(*) as total FROM students WHERE status = 'ACTIVE'`).catch(() => [{ total: 0 }]);
    const [teachersCount] = await db.query(`SELECT COUNT(*) as total FROM teachers WHERE status = 'ACTIVE'`).catch(() => [{ total: 0 }]);
    const [programsCount] = await db.query(`SELECT COUNT(*) as total FROM programs`).catch(() => [{ total: 0 }]);
    const [groupsCount] = await db.query(`SELECT COUNT(*) as total FROM student_groups`).catch(() => [{ total: 0 }]);
    const [revenue] = await db.query(`SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments`).catch(() => [{ total: 0 }]);

    return sendSuccess(res, 'Dashboard summary fetched', {
      total_students: studentsCount?.total || 0,
      total_teachers: teachersCount?.total || 0,
      total_programs: programsCount?.total || 0,
      total_groups: groupsCount?.total || 0,
      total_revenue: revenue?.total || 0
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStudentTranscriptReport,
  getGpaReport,
  getClassRankingReport,
  getReexamReport,
  getSubjectPassFailReport,
  getStudentAttendanceSummaryReport,
  getClassAttendanceRateReport,
  getTeacherCheckinReport,
  getOutstandingBalanceReport,
  getPaymentCollectionReport,
  getRevenueByProgramReport,
  getClassGroupSummaryReport,
  getProgramEnrollmentReport,
  getCurriculumCompletionReport,
  getDepartmentFacultySummaryReport,
  getExamScheduleReport,
  getRoomUtilizationReport,
  getTeacherWorkloadReport,
  getPayrollSummaryReport,
  getDashboardSummary
};
