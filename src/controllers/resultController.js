const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


function calculateGrade(score) {
  const num = parseFloat(score) || 0;
  // Scale out of 50
  if (num <= 50) {
    if (num >= 45) return { letter: 'A', point: 4.0, remarks: 'Excellent' };
    if (num >= 40) return { letter: 'B+', point: 3.5, remarks: 'Good' };
    if (num >= 35) return { letter: 'B', point: 3.0, remarks: 'Good' };
    if (num >= 30) return { letter: 'C+', point: 2.5, remarks: 'Average' };
    if (num >= 20) return { letter: 'C', point: 2.0, remarks: 'Pass' };
    return { letter: 'F', point: 0.0, remarks: 'Needs Improvement' };
  }
  // Scale out of 100
  if (num >= 90) return { letter: 'A', point: 4.0, remarks: 'Excellent' };
  if (num >= 80) return { letter: 'B+', point: 3.5, remarks: 'Good' };
  if (num >= 70) return { letter: 'B', point: 3.0, remarks: 'Good' };
  if (num >= 60) return { letter: 'C+', point: 2.5, remarks: 'Average' };
  if (num >= 50) return { letter: 'C', point: 2.0, remarks: 'Pass' };
  return { letter: 'F', point: 0.0, remarks: 'Needs Improvement' };
}

async function getResults(req, res, next) {
  try {
    const { exam_id, student_id, group_id, exam_group_id } = req.query;
    let whereClauses = [];
    let params = [];

    if (exam_id) { whereClauses.push('ar.exam_id = ?'); params.push(exam_id); }
    if (student_id) { whereClauses.push('ar.student_id = ?'); params.push(student_id); }
    if (group_id) { whereClauses.push('s.group_id = ?'); params.push(group_id); }
    if (exam_group_id) { whereClauses.push('e.exam_group_id = ?'); params.push(exam_group_id); }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT ar.*,
        COALESCE(ar.gpa_point, ar.grade_point, 3.5) as grade_point,
        s.custom_student_id, s.first_name, s.last_name, s.group_id,
        sg.group_code, sg.group_name,
        e.exam_title, e.exam_date, e.category, e.exam_group_id,
        eg.exam_group_name, eg.exam_group_code, eg.generation as eg_generation, eg.semester as eg_semester, eg.start_date as eg_start_date, eg.end_date as eg_end_date,
        sub.subject_id, sub.subject_name, sub.subject_code
      FROM academic_results ar
      JOIN students s ON ar.student_id = s.student_id
      LEFT JOIN student_groups sg ON s.group_id = sg.group_id
      JOIN exams e ON ar.exam_id = e.exam_id
      LEFT JOIN exam_groups eg ON e.exam_group_id = eg.exam_group_id
      JOIN subjects sub ON e.subject_id = sub.subject_id
      ${whereSql}
      ORDER BY ar.result_id DESC
    `;

    const results = await db.query(querySql, params);
    return sendSuccess(res, 'Academic results fetched', { results });
  } catch (error) {
    next(error);
  }
}

async function saveResults(req, res, next) {
  try {
    const { exam_id, assessmentType, scores, is_published } = req.body;

    if (!scores || !Array.isArray(scores)) {
      return sendError(res, 'Scores array is required', 400);
    }

    const publishStatus = (is_published === 1 || is_published === true || is_published === '1' || is_published === 'true') ? 1 : 0;

    for (const item of scores) {
      const targetExamId = item.exam_id || exam_id;
      const { student_id, raw_score, remarks } = item;
      if (!student_id || !targetExamId || raw_score === undefined || raw_score === null || raw_score === '') continue;

      const numScore = parseFloat(raw_score) || 0;
      if (numScore < 0 || numScore > 100) {
        return sendError(res, `Invalid score value (${numScore}). Exam scores must be between 0 and 100!`, 400);
      }

      const { letter, point } = calculateGrade(raw_score);

      await db.query(
        `INSERT INTO academic_results (student_id, exam_id, raw_score, letter_grade, gpa_point, remarks, is_published)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           raw_score = VALUES(raw_score),
           letter_grade = VALUES(letter_grade),
           gpa_point = VALUES(gpa_point),
           remarks = VALUES(remarks),
           is_published = VALUES(is_published)`,
        [student_id, targetExamId, raw_score, letter, point, remarks || '', publishStatus]
      );
    }

    if (publishStatus === 1) {
      notifyRealtime('scores_published', { exam_id, assessmentType, count: scores.length });
    }

    return sendSuccess(res, publishStatus === 1 ? 'Scores saved & published successfully' : 'Scores submitted to Admin for review');
  } catch (error) {
    next(error);
  }
}

async function getStudentGrades(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.studentId;
    if (!studentId) {
      return sendError(res, 'Student ID not specified', 400);
    }

    const grades = await db.query(
      `SELECT ar.*, COALESCE(ar.gpa_point, 3.5) as grade_point, e.exam_title, sub.subject_name, sub.subject_code, sub.credit
       FROM academic_results ar
       JOIN exams e ON ar.exam_id = e.exam_id
       JOIN subjects sub ON e.subject_id = sub.subject_id
       WHERE ar.student_id = ? AND ar.is_published = 1
       ORDER BY sub.subject_name ASC`,
      [studentId]
    );

    let totalPoints = 0;
    let totalCredits = 0;
    grades.forEach(g => {
      totalPoints += (parseFloat(g.grade_point || g.gpa_point || 3.5) * parseInt(g.credit || 3));
      totalCredits += parseInt(g.credit || 3);
    });

    const calculatedGpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00';

    return sendSuccess(res, 'Student grades fetched', {
      grades,
      gpa: calculatedGpa
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getResults,
  saveResults,
  getStudentGrades,
  calculateGrade
};
