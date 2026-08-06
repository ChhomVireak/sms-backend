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
              COALESCE(fs.academic_year, 'Year 1') as academic_year,
              COALESCE(fs.billing_plan_group, CONCAT('GROUP-', fs.group_id, '-', COALESCE(fs.academic_year, 'Y1'))) as billing_plan_group,
              COALESCE(fs.plan_type, 'SEMESTER') as plan_type
       FROM fee_schedules fs
       LEFT JOIN student_groups g ON fs.group_id = g.group_id
       LEFT JOIN semesters sem ON fs.semester_id = sem.semester_id
       ${whereSql}
       ORDER BY fs.billing_plan_group ASC, fs.plan_type ASC, fs.due_date ASC`,
      params
    );

    // Calculate non-double-counted summary (only count 1 plan per billing_plan_group, or sum matching student plan)
    const summaryQuery = `
      SELECT COALESCE(SUM(amount), 0) as total_scheduled_fees
      FROM (
        SELECT amount, ROW_NUMBER() OVER(PARTITION BY COALESCE(billing_plan_group, fee_schedule_id) ORDER BY plan_type ASC) as rn
        FROM fee_schedules
        ${whereSql}
      ) t
      WHERE t.rn = 1;
    `;
    const summaryResult = await db.query(summaryQuery, params).catch(() => [{ total_scheduled_fees: 0 }]);
    const totalScheduledFees = summaryResult.length > 0 ? summaryResult[0].total_scheduled_fees : 0;

    return sendSuccess(res, 'Fee schedules fetched', { schedules, studentGroup, totalScheduledFees });
  } catch (error) {
    next(error);
  }
}

async function createFeeSchedule(req, res, next) {
  try {
    const { group_id, semester_id = 1, fee_title, amount, due_date, late_penalty_rate = 5.00, year_level, term_cycle, billing_plan_group, plan_type = 'SEMESTER' } = req.body;

    if (!group_id || !fee_title || !amount || !due_date) {
      return sendError(res, 'Group, title, amount, and due date are required', 400);
    }

    const termVal = term_cycle || 'Semester 1';
    const acadYear = year_level || 'Year 1';
    const effectivePlanGroup = billing_plan_group || `GROUP-${group_id}-${acadYear.replace(/\s+/g, '')}`;

    // Validation warning if plan_type = FULL_YEAR and amount doesn't match n x semester amount
    let warningMessage = null;
    if (plan_type === 'FULL_YEAR') {
      const semRows = await db.query(
        `SELECT amount FROM fee_schedules WHERE group_id = ? AND plan_type = 'SEMESTER' AND (billing_plan_group = ? OR academic_year = ?) LIMIT 1`,
        [group_id, effectivePlanGroup, acadYear]
      );
      if (semRows.length > 0) {
        const semAmount = Number(semRows[0].amount);
        const inputAmount = Number(amount);
        if (Math.abs(inputAmount - (semAmount * 2)) > 50) {
          warningMessage = `Note: Full Year amount ($${inputAmount}) differs significantly from 2x Semester amount ($${semAmount * 2}). Please verify data entry.`;
        }
      }
    }

    const result = await db.query(
      `INSERT INTO fee_schedules (group_id, semester_id, fee_title, amount, due_date, late_penalty_rate, academic_year, term_cycle, term, billing_plan_group, plan_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        group_id,
        semester_id || 1,
        fee_title,
        amount,
        due_date,
        late_penalty_rate || 5.00,
        acadYear,
        termVal,
        termVal,
        effectivePlanGroup,
        plan_type
      ]
    );

    return sendSuccess(res, 'Fee schedule created', { 
      fee_schedule_id: result.insertId, 
      fee_title, 
      amount,
      billing_plan_group: effectivePlanGroup,
      plan_type,
      warning: warningMessage 
    }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateFeeSchedule(req, res, next) {
  try {
    const { id } = req.params;
    const { group_id, semester_id = 1, fee_title, amount, due_date, late_penalty_rate = 5.00, year_level, term_cycle, billing_plan_group, plan_type = 'SEMESTER' } = req.body;

    if (!group_id || !fee_title || !amount || !due_date) {
      return sendError(res, 'Group, title, amount, and due date are required', 400);
    }

    const termVal = term_cycle || 'Semester 1';
    const acadYear = year_level || 'Year 1';
    const effectivePlanGroup = billing_plan_group || `GROUP-${group_id}-${acadYear.replace(/\s+/g, '')}`;

    await db.query(
      `UPDATE fee_schedules 
       SET group_id = ?, semester_id = ?, fee_title = ?, amount = ?, due_date = ?, late_penalty_rate = ?, academic_year = ?, term_cycle = ?, term = ?, billing_plan_group = ?, plan_type = ?
       WHERE fee_schedule_id = ?`,
      [
        group_id,
        semester_id || 1,
        fee_title,
        amount,
        due_date,
        late_penalty_rate || 5.00,
        acadYear,
        termVal,
        termVal,
        effectivePlanGroup,
        plan_type,
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
