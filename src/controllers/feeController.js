const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');


async function getFeeCategories(req, res, next) {
  try {
    const categories = await db.query(`SELECT category_id, title, description as desc, default_amount as defaultAmount FROM fee_categories ORDER BY category_id ASC`);
    return sendSuccess(res, 'Fee categories fetched', { categories });
  } catch (error) {
    next(error);
  }
}

async function createFeeCategory(req, res, next) {
  try {
    const { title, desc, defaultAmount } = req.body;
    if (!title || !defaultAmount) {
      return sendError(res, 'Title and default amount are required', 400);
    }
    const result = await db.query(
      `INSERT INTO fee_categories (title, description, default_amount) VALUES (?, ?, ?)`,
      [title, desc || '', defaultAmount]
    );
    return sendSuccess(res, 'Fee category created', { category_id: result.insertId, title, defaultAmount }, 201);
  } catch (error) {
    next(error);
  }
}

async function getFeeSchedules(req, res, next) {
  try {
    const { group_id, semester_id } = req.query;
    let whereClauses = [];
    let params = [];
    let studentGroup = null;

    let filterGroupId = group_id;

    if (!filterGroupId && req.user && String(req.user.role || '').toUpperCase() === 'STUDENT') {
      let sRows = [];
      if (req.user.studentId) {
        sRows = await db.query('SELECT s.group_id, g.group_code, g.group_name FROM students s LEFT JOIN student_groups g ON s.group_id = g.group_id WHERE s.student_id = ?', [req.user.studentId]);
      } else if (req.user.userId) {
        sRows = await db.query('SELECT s.group_id, g.group_code, g.group_name FROM students s LEFT JOIN student_groups g ON s.group_id = g.group_id WHERE s.user_id = ?', [req.user.userId]);
      }
      if (sRows.length > 0 && sRows[0].group_id) {
        filterGroupId = sRows[0].group_id;
        studentGroup = { group_id: sRows[0].group_id, group_code: sRows[0].group_code, group_name: sRows[0].group_name };
      }
    }

    if (filterGroupId) {
      whereClauses.push('(fs.group_id = ? OR fs.group_id IS NULL)');
      params.push(filterGroupId);
    }

    if (semester_id) { whereClauses.push('fs.semester_id = ?'); params.push(semester_id); }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const schedules = await db.query(
      `SELECT fs.*, g.group_name, g.group_code, 
              COALESCE(fs.term_cycle, fs.term, sem.semester_name, 'Semester 1') as semester_name, 
              COALESCE(fs.academic_year, 'Year 1') as academic_year
       FROM fee_schedules fs
       LEFT JOIN student_groups g ON fs.group_id = g.group_id
       LEFT JOIN semesters sem ON fs.semester_id = sem.semester_id
       ${whereSql}
       ORDER BY fs.due_date ASC`,
      params
    );

    return sendSuccess(res, 'Fee schedules fetched', { schedules, studentGroup });
  } catch (error) {
    next(error);
  }
}

async function createFeeSchedule(req, res, next) {
  try {
    const { group_id, semester_id = 1, fee_title, amount, due_date, late_penalty_rate = 5.00, year_level, term_cycle } = req.body;

    if (!group_id || !fee_title || !amount || !due_date) {
      return sendError(res, 'Group, title, amount, and due date are required', 400);
    }

    const termVal = term_cycle || 'Semester 1';

    const result = await db.query(
      `INSERT INTO fee_schedules (group_id, semester_id, fee_title, amount, due_date, late_penalty_rate, academic_year, term_cycle, term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        group_id,
        semester_id || 1,
        fee_title,
        amount,
        due_date,
        late_penalty_rate || 5.00,
        year_level || 'Year 1',
        termVal,
        termVal
      ]
    );

    return sendSuccess(res, 'Fee schedule created', { fee_schedule_id: result.insertId, fee_title, amount }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateFeeSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const { group_id, semester_id = 1, fee_title, amount, due_date, late_penalty_rate = 5.00, year_level, term_cycle } = req.body;

    if (!group_id || !fee_title || !amount || !due_date) {
      return sendError(res, 'Group, title, amount, and due date are required', 400);
    }

    const termVal = term_cycle || 'Semester 1';

    await db.query(
      `UPDATE fee_schedules 
       SET group_id = ?, semester_id = ?, fee_title = ?, amount = ?, due_date = ?, late_penalty_rate = ?, academic_year = ?, term_cycle = ?, term = ?
       WHERE fee_schedule_id = ?`,
      [
        group_id,
        semester_id || 1,
        fee_title,
        amount,
        due_date,
        late_penalty_rate || 5.00,
        year_level || 'Year 1',
        termVal,
        termVal,
        id
      ]
    );

    return sendSuccess(res, 'Fee schedule updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteFeeSchedule(req, res, next) {
  try {
    const { id } = req.params;
    // Delete referenced payments first to satisfy Foreign Key Constraint
    await db.query('DELETE FROM payments WHERE fee_schedule_id = ?', [id]);
    await db.query('DELETE FROM fee_schedules WHERE fee_schedule_id = ?', [id]);
    return sendSuccess(res, 'Fee schedule deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getFeeCategories,
  createFeeCategory,
  getFeeSchedules,
  createFeeSchedule,
  updateFeeSchedule,
  deleteFeeSchedule
};
