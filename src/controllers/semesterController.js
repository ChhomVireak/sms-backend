const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function getSemesters(req, res, next) {
  try {
    const semesters = await db.query('SELECT * FROM semesters ORDER BY semester_id ASC');
    return sendSuccess(res, 'Semesters fetched', { semesters });
  } catch (error) {
    next(error);
  }
}

async function createSemester(req, res, next) {
  try {
    const { semester_name, semester_code } = req.body;

    if (!semester_name || !semester_code) {
      return sendError(res, 'Semester name and code are required', 400);
    }

    const result = await db.query(
      'INSERT INTO semesters (semester_name, semester_code) VALUES (?, ?)',
      [semester_name.trim(), semester_code.toUpperCase().trim()]
    );

    return sendSuccess(res, 'Semester created', { semester_id: result.insertId, semester_name }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateSemester(req, res, next) {
  try {
    const { id } = req.params;
    const { semester_name, semester_code } = req.body;

    await db.query(
      'UPDATE semesters SET semester_name = ?, semester_code = ? WHERE semester_id = ?',
      [semester_name.trim(), semester_code.toUpperCase().trim(), id]
    );

    return sendSuccess(res, 'Semester updated');
  } catch (error) {
    next(error);
  }
}

async function deleteSemester(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM semesters WHERE semester_id = ?', [id]);
    return sendSuccess(res, 'Semester deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSemesters,
  createSemester,
  updateSemester,
  deleteSemester
};
