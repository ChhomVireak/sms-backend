const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');


async function getPayments(req, res, next) {
  try {
    const { student_id, search = '' } = req.query;
    let whereClauses = [];
    let params = [];

    let filterStudentId = student_id;
    if (!filterStudentId && req.user && String(req.user.role || '').toUpperCase() === 'STUDENT') {
      if (req.user.studentId) {
        filterStudentId = req.user.studentId;
      } else if (req.user.userId) {
        const rows = await db.query('SELECT student_id FROM students WHERE user_id = ?', [req.user.userId]);
        if (rows.length > 0) filterStudentId = rows[0].student_id;
      }
    }

    if (filterStudentId) { whereClauses.push('p.student_id = ?'); params.push(filterStudentId); }
    if (search) {
      whereClauses.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR p.receipt_number LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT p.*,
        s.custom_student_id, s.first_name, s.last_name, g.group_name, g.group_code,
        COALESCE(fs.fee_title, 'Tuition Fee') as fee_title,
        COALESCE(fs.amount, p.amount_paid) as total_fee_amount,
        fs.academic_year, fs.term_cycle, fs.term
      FROM payments p
      JOIN students s ON p.student_id = s.student_id
      LEFT JOIN student_groups g ON s.group_id = g.group_id
      LEFT JOIN fee_schedules fs ON p.fee_schedule_id = fs.fee_schedule_id
      ${whereSql}
      ORDER BY p.payment_date DESC, p.payment_id DESC
    `;

    const payments = await db.query(querySql, params);
    return sendSuccess(res, 'Payments fetched', { payments });
  } catch (error) {
    next(error);
  }
}

async function recordPayment(req, res, next) {
  try {
    const { student_id, fee_schedule_id, amount_paid, penalty_paid = 0.00, payment_method = 'KHQR', payment_date } = req.body;

    if (!student_id || !amount_paid || Number(amount_paid) <= 0 || isNaN(Number(amount_paid))) {
      return sendError(res, 'Student ID and a valid payment amount (greater than $0) are required', 400);
    }

    // Auto-generate receipt number: RCT-YYYYMMDD-XXXX
    const dateObj = payment_date ? new Date(payment_date) : new Date();
    const dateStr = dateObj.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);
    const receiptNumber = `RCT-${dateStr}-${randomSeq}`;

    const validFeeScheduleId = fee_schedule_id ? Number(fee_schedule_id) : null;

    const result = await db.query(
      `INSERT INTO payments (receipt_number, student_id, fee_schedule_id, amount_paid, penalty_paid, payment_method, payment_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Paid')`,
      [receiptNumber, student_id, validFeeScheduleId, amount_paid, penalty_paid, payment_method, dateObj]
    );

    return sendSuccess(res, 'Payment recorded successfully', {
      payment_id: result.insertId,
      receipt_number: receiptNumber,
      amount_paid,
      payment_date: dateObj
    }, 201);
  } catch (error) {
    console.error('Error recording payment in MySQL:', error);
    next(error);
  }
}

async function getReceipt(req, res, next) {
  try {
    const { receiptNumber } = req.params;
    const payments = await db.query(
      `SELECT p.*,
        s.custom_student_id, s.first_name, s.last_name, g.group_name,
        COALESCE(fs.fee_title, 'Tuition Fee') as fee_title,
        COALESCE(fs.amount, p.amount_paid) as total_fee
       FROM payments p
       JOIN students s ON p.student_id = s.student_id
       LEFT JOIN student_groups g ON s.group_id = g.group_id
       LEFT JOIN fee_schedules fs ON p.fee_schedule_id = fs.fee_schedule_id
       WHERE p.receipt_number = ?`,
      [receiptNumber]
    );

    if (payments.length === 0) {
      return sendError(res, 'Receipt not found', 404);
    }

    return sendSuccess(res, 'Receipt details fetched', { receipt: payments[0] });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPayments,
  recordPayment,
  getReceipt
};
