const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');


async function getPrograms(req, res, next) {
  try {
    const { faculty_id, degree, status, search } = req.query;
    let whereClauses = [];
    let params = [];

    if (faculty_id) { whereClauses.push('p.faculty_id = ?'); params.push(faculty_id); }
    if (degree) { whereClauses.push('p.degree = ?'); params.push(degree); }
    if (status) { whereClauses.push('p.status = ?'); params.push(status); }
    if (search) {
      whereClauses.push('(p.program_code LIKE ? OR p.program_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const programs = await db.query(
      `SELECT p.*, f.faculty_code, f.faculty_name
       FROM programs p
       JOIN faculties f ON p.faculty_id = f.faculty_id
       ${whereSql}
       ORDER BY p.program_code ASC`,
      params
    );

    return sendSuccess(res, 'Programs fetched successfully', { programs });
  } catch (error) {
    next(error);
  }
}

async function getProgramById(req, res, next) {
  try {
    const { id } = req.params;
    const programs = await db.query(
      `SELECT p.*, f.faculty_code, f.faculty_name
       FROM programs p
       JOIN faculties f ON p.faculty_id = f.faculty_id
       WHERE p.program_id = ?`,
      [id]
    );

    if (programs.length === 0) {
      return sendError(res, 'Program not found', 404);
    }

    return sendSuccess(res, 'Program fetched', { program: programs[0] });
  } catch (error) {
    next(error);
  }
}

async function createProgram(req, res, next) {
  try {
    const {
      program_code, program_name, faculty_id,
      degree = 'Bachelor', duration_years = 4, total_semesters = 8,
      tuition_fee_per_semester = 390.00, semester_duration_months = 5, status = 'ACTIVE'
    } = req.body;

    if (!program_code || !program_name || !faculty_id) {
      return sendError(res, 'Program code, program name and faculty are required', 400);
    }

    const existing = await db.query('SELECT program_id FROM programs WHERE program_code = ?', [program_code]);
    if (existing.length > 0) {
      return sendError(res, `Program code '${program_code}' already exists`, 409);
    }

    const feePerSem = parseFloat(tuition_fee_per_semester || 390);
    const sems = parseInt(total_semesters || (duration_years ? duration_years * 2 : 8));
    const calculatedTotalFee = feePerSem * sems;
    const semMonths = parseInt(semester_duration_months || 5);

    const result = await db.query(
      `INSERT INTO programs (program_code, program_name, faculty_id, degree, duration_years, total_semesters, tuition_fee_per_semester, total_tuition_fee, semester_duration_months, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [program_code.toUpperCase().trim(), program_name.trim(), faculty_id, degree, duration_years, sems, feePerSem, calculatedTotalFee, semMonths, status]
    );

    notifyRealtime('program_created', { program_id: result.insertId, program_code, program_name });

    return sendSuccess(res, 'Program created successfully', { program_id: result.insertId, program_code }, 201);
  } catch (error) {
    next(error);
  }
}

async function updateProgram(req, res, next) {
  try {
    const { id } = req.params;
    const {
      program_code, program_name, faculty_id, degree,
      duration_years, total_semesters, tuition_fee_per_semester, semester_duration_months, status
    } = req.body;

    const feePerSem = parseFloat(tuition_fee_per_semester || 390);
    const sems = parseInt(total_semesters || (duration_years ? duration_years * 2 : 8));
    const calculatedTotalFee = feePerSem * sems;
    const semMonths = parseInt(semester_duration_months || 5);

    await db.query(
      `UPDATE programs SET program_code = ?, program_name = ?, faculty_id = ?, degree = ?, duration_years = ?, total_semesters = ?, tuition_fee_per_semester = ?, total_tuition_fee = ?, semester_duration_months = ?, status = ?
       WHERE program_id = ?`,
      [program_code.toUpperCase().trim(), program_name.trim(), faculty_id, degree, duration_years, sems, feePerSem, calculatedTotalFee, semMonths, status || 'ACTIVE', id]
    );

    notifyRealtime('program_updated', { program_id: id, program_code, program_name });

    return sendSuccess(res, 'Program updated successfully');
  } catch (error) {
    next(error);
  }
}

async function deleteProgram(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM programs WHERE program_id = ?', [id]);

    notifyRealtime('program_deleted', { program_id: id });

    return sendSuccess(res, 'Program deleted successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPrograms,
  getProgramById,
  createProgram,
  updateProgram,
  deleteProgram
};
