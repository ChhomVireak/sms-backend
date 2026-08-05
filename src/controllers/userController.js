const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function getUsers(req, res, next) {
  try {
    const { role, search = '' } = req.query;
    let whereClauses = [];
    let params = [];

    if (role) { whereClauses.push('u.role = ?'); params.push(role.toUpperCase()); }
    if (search) {
      whereClauses.push('(u.username LIKE ? OR u.email LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const querySql = `
      SELECT u.user_id, u.username, u.email, u.role, u.status, u.created_at,
        s.student_id, s.custom_student_id, s.first_name as s_fname, s.last_name as s_lname,
        t.teacher_id, t.custom_teacher_id, t.first_name as t_fname, t.last_name as t_lname
      FROM users u
      LEFT JOIN students s ON u.user_id = s.user_id
      LEFT JOIN teachers t ON u.user_id = t.user_id
      ${whereSql}
      ORDER BY u.user_id DESC
    `;

    const users = await db.query(querySql, params);

    // Categories counts
    const categoryCounts = await db.query(
      `SELECT role, COUNT(*) as count FROM users GROUP BY role`
    );

    return sendSuccess(res, 'Users fetched', { users, categoryCounts });
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    const { username, email, password, role = 'STUDENT', status = 'ACTIVE' } = req.body;

    if (!email && !username) {
      return sendError(res, 'Email address or username is required', 400);
    }

    const targetEmail = email || `${username}@school.edu`;
    const uName = username || (targetEmail.includes('@') ? targetEmail.split('@')[0] : targetEmail);

    let defaultPass = password;
    if (!defaultPass) {
      if (role.toUpperCase() === 'TEACHER') {
        defaultPass = targetEmail.includes('@') ? targetEmail.split('@')[0] : targetEmail;
      } else if (role.toUpperCase() === 'STUDENT') {
        defaultPass = req.body.dob ? String(req.body.dob).replace(/[^0-9]/g, '') : '08022000';
      }
    }

    const existing = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, targetEmail]);
    if (existing.length > 0) {
      return sendError(res, 'Username or email already exists', 409);
    }

    const hashedPassword = await bcrypt.hash(defaultPass, 10);
    const result = await db.query(
      'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [uName, targetEmail, hashedPassword, role.toUpperCase(), status.toUpperCase()]
    );

    return sendSuccess(res, 'User account created successfully', { user_id: result.insertId, username: uName, email: targetEmail, role, defaultPassword: defaultPass }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) return sendError(res, 'Status is required', 400);

    await db.query('UPDATE users SET status = ? WHERE user_id = ?', [status.toUpperCase(), id]);
    return sendSuccess(res, 'User status updated');
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM users WHERE user_id = ?', [id]);
    return sendSuccess(res, 'User deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUserStatus,
  deleteUser
};
