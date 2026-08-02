const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

async function getFaculties(req, res, next) {
  try {
    const { status, search } = req.query;
    let whereClauses = [];
    let params = [];

    if (status) { whereClauses.push('f.status = ?'); params.push(status); }
    if (search) {
      whereClauses.push('(f.faculty_code LIKE ? OR f.faculty_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const faculties = await db.query(
      `SELECT f.*, COUNT(p.program_id) as total_programs 
       FROM faculties f
       LEFT JOIN programs p ON f.faculty_id = p.faculty_id
       ${whereSql}
       GROUP BY f.faculty_id
       ORDER BY f.faculty_code ASC`,
      params
    );

    return sendSuccess(res, 'Faculties fetched successfully', { faculties });
  } catch (error) {
    next(error);
  }
}

async function getFacultyById(req, res, next) {
  try {
    const { id } = req.params;
    const faculties = await db.query('SELECT * FROM faculties WHERE faculty_id = ?', [id]);
    if (faculties.length === 0) {
      return sendError(res, 'Faculty not found', 404);
    }
    const programs = await db.query('SELECT * FROM programs WHERE faculty_id = ?', [id]);
    return sendSuccess(res, 'Faculty fetched', { faculty: faculties[0], programs });
  } catch (error) {
    next(error);
  }
}

async function createFaculty(req, res, next) {
  try {
    const { faculty_code, faculty_name, dean_name, building, description, status = 'ACTIVE' } = req.body;

    if (!faculty_code || !faculty_name) {
      return sendError(res, 'Faculty code and faculty name are required', 400);
    }

    const cleanCode = faculty_code.toUpperCase().trim();
    const existing = await db.query('SELECT faculty_id FROM faculties WHERE UPPER(faculty_code) = ?', [cleanCode]);
    if (existing.length > 0) {
      return sendError(res, `Faculty code '${cleanCode}' already exists`, 409);
    }

    const result = await db.query(
      'INSERT INTO faculties (faculty_code, faculty_name, dean_name, building, description, status) VALUES (?, ?, ?, ?, ?, ?)',
      [cleanCode, faculty_name.trim(), dean_name || null, building || null, description || '', status]
    );

    notifyRealtime('faculty_created', { faculty_id: result.insertId, faculty_code: cleanCode, faculty_name });

    return sendSuccess(res, 'Faculty created successfully', { faculty_id: result.insertId, faculty_code: cleanCode }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateFaculty(req, res, next) {
  try {
    const { id } = req.params;
    const { faculty_code, faculty_name, dean_name, building, description, status } = req.body;

    const cleanCode = faculty_code ? faculty_code.toUpperCase().trim() : '';

    await db.query(
      'UPDATE faculties SET faculty_code = ?, faculty_name = ?, dean_name = ?, building = ?, description = ?, status = ? WHERE faculty_id = ?',
      [cleanCode, faculty_name.trim(), dean_name || null, building || null, description || '', status || 'ACTIVE', id]
    );

    notifyRealtime('faculty_updated', { faculty_id: id, faculty_code: cleanCode, faculty_name });

    return sendSuccess(res, 'Faculty updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteFaculty(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM faculties WHERE faculty_id = ?', [id]);

    notifyRealtime('faculty_deleted', { faculty_id: id });

    return sendSuccess(res, 'Faculty deleted successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getFaculties,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty
};
