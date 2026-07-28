const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function getAcademicYears(req, res, next) {
  try {
    const years = await db.query('SELECT * FROM academic_years ORDER BY year_label DESC');
    return sendSuccess(res, 'Academic years fetched', { academic_years: years });
  } catch (error) {
    next(error);
  }
}

function formatDateOnly(dateVal) {
  if (!dateVal) return null;
  const str = String(dateVal).trim();
  if (str.length >= 10 && str.includes('-')) {
    return str.slice(0, 10);
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function createAcademicYear(req, res, next) {
  try {
    const { year_label, start_date, end_date, is_current = 0 } = req.body;

    if (!year_label) {
      return sendError(res, 'Year label (e.g. 2026-2027) is required', 400);
    }

    if (is_current) {
      await db.query('UPDATE academic_years SET is_current = 0');
    }

    const cleanStartDate = formatDateOnly(start_date);
    const cleanEndDate = formatDateOnly(end_date);

    const result = await db.query(
      'INSERT INTO academic_years (year_label, start_date, end_date, is_current) VALUES (?, ?, ?, ?)',
      [year_label.trim(), cleanStartDate, cleanEndDate, is_current ? 1 : 0]
    );

    return sendSuccess(res, 'Academic year created', { academic_year_id: result.insertId, year_label }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateAcademicYear(req, res, next) {
  try {
    const { id } = req.params;
    const { year_label, start_date, end_date, is_current } = req.body;

    if (is_current) {
      await db.query('UPDATE academic_years SET is_current = 0');
    }

    const cleanStartDate = formatDateOnly(start_date);
    const cleanEndDate = formatDateOnly(end_date);

    await db.query(
      'UPDATE academic_years SET year_label = ?, start_date = ?, end_date = ?, is_current = ? WHERE academic_year_id = ?',
      [year_label.trim(), cleanStartDate, cleanEndDate, is_current ? 1 : 0, id]
    );

    return sendSuccess(res, 'Academic year updated');
  } catch (error) {
    next(error);
  }
}

async function deleteAcademicYear(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM academic_years WHERE academic_year_id = ?', [id]);
    return sendSuccess(res, 'Academic year deleted');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear
};
