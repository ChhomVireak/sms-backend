const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');
const { notifyRealtime } = require('../utils/socket');

async function getValidProgramId(requestedProgId) {
  if (requestedProgId) {
    const pRows = await db.query('SELECT program_id FROM programs WHERE program_id = ?', [requestedProgId]);
    if (pRows.length > 0) return pRows[0].program_id;
  }

  const anyProg = await db.query('SELECT program_id FROM programs ORDER BY program_id ASC LIMIT 1');
  if (anyProg.length > 0) return anyProg[0].program_id;

  let fRows = await db.query('SELECT faculty_id FROM faculties LIMIT 1');
  let facultyId;
  if (fRows.length > 0) {
    facultyId = fRows[0].faculty_id;
  } else {
    const newFac = await db.query("INSERT INTO faculties (faculty_code, faculty_name, status) VALUES ('FIT', 'Faculty of Information Technology', 'ACTIVE')");
    facultyId = newFac.insertId;
  }

  const newProg = await db.query(
    "INSERT INTO programs (faculty_id, program_code, program_name, degree, duration_years, total_semesters, status) VALUES (?, 'MIS', 'Management Information System', 'Bachelor', 4, 8, 'ACTIVE')",
    [facultyId]
  );
  return newProg.insertId;
}

async function getValidAcademicYearId(requestedYearId) {
  if (requestedYearId) {
    const yRows = await db.query('SELECT academic_year_id FROM academic_years WHERE academic_year_id = ?', [requestedYearId]);
    if (yRows.length > 0) return yRows[0].academic_year_id;
  }

  const yRows = await db.query('SELECT academic_year_id FROM academic_years ORDER BY academic_year_id DESC LIMIT 1');
  if (yRows.length > 0) return yRows[0].academic_year_id;

  const newYear = await db.query("INSERT INTO academic_years (year_label, is_current) VALUES ('2026-2027', 1)");
  return newYear.insertId;
}

async function autoSeedMISIfEmpty(curriculumId) {
  try {
    const existing = await db.query('SELECT COUNT(*) as count FROM curriculum_subjects WHERE curriculum_id = ?', [curriculumId]);
    if (existing[0].count > 0) return;

    for (const [semesterIdStr, subjectsList] of Object.entries(defaultMISCurriculumData)) {
      const semId = parseInt(semesterIdStr);
      for (const item of subjectsList) {
        try {
          let subRows = await db.query('SELECT subject_id FROM subjects WHERE subject_code = ?', [item.code]);
          let subId;
          if (subRows.length > 0) {
            subId = subRows[0].subject_id;
          } else {
            const newSub = await db.query(
              "INSERT INTO subjects (subject_code, subject_name, credits, credit, theory_hours, practical_hours, description, status) VALUES (?, ?, ?, ?, 30, 30, ?, 'ACTIVE')",
              [item.code, item.name, item.credit, item.credit, item.name]
            );
            subId = newSub.insertId;
          }
          if (subId) {
            await db.query(
              'INSERT INTO curriculum_subjects (curriculum_id, semester_id, subject_id) VALUES (?, ?, ?)',
              [curriculumId, semId, subId]
            );
          }
        } catch (subErr) {
          console.error(`Auto seed subject warning (${item.code}):`, subErr.message);
        }
      }
    }
  } catch (err) {
    console.error('Auto seed error:', err.message);
  }
}

async function getCurriculums(req, res, next) {
  try {
    const { faculty_id, program_id, academic_year_id, status } = req.query;
    let whereClauses = [];
    let params = [];

    if (faculty_id) { whereClauses.push('f.faculty_id = ?'); params.push(faculty_id); }
    if (program_id) { whereClauses.push('c.program_id = ?'); params.push(program_id); }
    if (academic_year_id) { whereClauses.push('c.academic_year_id = ?'); params.push(academic_year_id); }
    if (status) { whereClauses.push('c.status = ?'); params.push(status); }

    const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const curriculums = await db.query(
      `SELECT c.*, 
        p.program_code, p.program_name, p.degree,
        f.faculty_id, f.faculty_code, f.faculty_name,
        ay.year_label as academic_year,
        COUNT(cs.id) as total_subjects
       FROM curriculums c
       LEFT JOIN programs p ON c.program_id = p.program_id
       LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
       LEFT JOIN academic_years ay ON c.academic_year_id = ay.academic_year_id
       LEFT JOIN curriculum_subjects cs ON c.curriculum_id = cs.curriculum_id
       ${whereSql}
       GROUP BY c.curriculum_id
       ORDER BY ay.year_label DESC, p.program_code ASC`,
      params
    );

    return sendSuccess(res, 'Curriculums fetched successfully', { curriculums });
  } catch (error) {
    next(error);
  }
}

async function getCurriculumById(req, res, next) {
  try {
    const { id } = req.params;
    await autoSeedMISIfEmpty(id);

    const list = await db.query(
      `SELECT c.*, 
        p.program_code, p.program_name, p.degree, p.duration_years, COALESCE(p.total_semesters, (p.duration_years * 2), 8) as total_semesters,
        f.faculty_id, f.faculty_code, f.faculty_name,
        ay.year_label as academic_year
       FROM curriculums c
       LEFT JOIN programs p ON c.program_id = p.program_id
       LEFT JOIN faculties f ON p.faculty_id = f.faculty_id
       LEFT JOIN academic_years ay ON c.academic_year_id = ay.academic_year_id
       WHERE c.curriculum_id = ?`,
      [id]
    );

    if (list.length === 0) {
      return sendError(res, 'Curriculum not found', 404);
    }

    const curriculum = list[0];

    const subjects = await db.query(
      `SELECT cs.id as mapping_id, cs.semester_id, sem.semester_name, sem.semester_code,
        s.subject_id, s.subject_code, s.subject_name, s.credit, s.theory_hours, s.practical_hours
       FROM curriculum_subjects cs
       JOIN semesters sem ON cs.semester_id = sem.semester_id
       JOIN subjects s ON cs.subject_id = s.subject_id
       WHERE cs.curriculum_id = ?
       ORDER BY sem.semester_id ASC, s.subject_code ASC`,
      [id]
    );

    const semesterMap = {};
    for (let semId = 1; semId <= (curriculum.total_semesters || 8); semId++) {
      semesterMap[semId] = {
        semester_id: semId,
        semester_name: `Semester ${semId}`,
        subjects: []
      };
    }

    subjects.forEach(sub => {
      if (!semesterMap[sub.semester_id]) {
        semesterMap[sub.semester_id] = {
          semester_id: sub.semester_id,
          semester_name: sub.semester_name,
          subjects: []
        };
      }
      semesterMap[sub.semester_id].subjects.push(sub);
    });

    return sendSuccess(res, 'Curriculum details fetched', {
      curriculum,
      semesters: Object.values(semesterMap)
    });
  } catch (error) {
    next(error);
  }
}

async function createCurriculum(req, res, next) {
  try {
    const { program_id, academic_year_id, title, status = 'ACTIVE' } = req.body;

    const validProgId = await getValidProgramId(program_id);
    const validYearId = await getValidAcademicYearId(academic_year_id);

    const progRes = await db.query('SELECT program_name FROM programs WHERE program_id = ?', [validProgId]);
    const yearRes = await db.query('SELECT year_label FROM academic_years WHERE academic_year_id = ?', [validYearId]);

    const currTitle = title || `${progRes[0]?.program_name || 'Program'} (${yearRes[0]?.year_label || 'Curriculum'})`;
    const currCode = `CURR-${validProgId}-${Date.now().toString().slice(-6)}`;

    const result = await db.query(
      'INSERT INTO curriculums (program_id, academic_year_id, title, curriculum_code, status) VALUES (?, ?, ?, ?, ?)',
      [validProgId, validYearId, currTitle, currCode, status]
    );

    await autoSeedMISIfEmpty(result.insertId);

    notifyRealtime('curriculum_created', { curriculum_id: result.insertId, title: currTitle });

    return sendSuccess(res, 'Curriculum created successfully', { curriculum_id: result.insertId, title: currTitle }, 201);
  } catch (error) {
    next(error);
  }
}

async function assignSubjects(req, res, next) {
  try {
    let { id } = req.params;
    let { semester_id, subject_ids, program_id } = req.body;

    if (!semester_id || !subject_ids || !Array.isArray(subject_ids)) {
      return sendError(res, 'Semester ID and subject IDs array are required', 400);
    }

    let targetId = parseInt(id);
    let currCheck = [];

    if (targetId && !isNaN(targetId)) {
      currCheck = await db.query('SELECT curriculum_id FROM curriculums WHERE curriculum_id = ?', [targetId]);
    }

    if (currCheck.length === 0) {
      const validProgId = await getValidProgramId(program_id);
      const progCurr = await db.query("SELECT curriculum_id FROM curriculums WHERE program_id = ? AND status = 'ACTIVE' LIMIT 1", [validProgId]);

      if (progCurr.length > 0) {
        targetId = progCurr[0].curriculum_id;
      } else {
        const validYearId = await getValidAcademicYearId();
        const newCurr = await db.query(
          "INSERT INTO curriculums (program_id, academic_year_id, title, status) VALUES (?, ?, 'Active Program Curriculum', 'ACTIVE')",
          [validProgId, validYearId]
        );
        targetId = newCurr.insertId;
      }
    }

    const { mode = 'append' } = req.body;

    if (mode === 'replace') {
      await db.query('DELETE FROM curriculum_subjects WHERE curriculum_id = ? AND semester_id = ?', [targetId, semester_id]);
    }

    for (const subId of subject_ids) {
      const exists = await db.query(
        'SELECT id FROM curriculum_subjects WHERE curriculum_id = ? AND semester_id = ? AND subject_id = ?',
        [targetId, semester_id, subId]
      );
      if (exists.length === 0) {
        await db.query(
          'INSERT INTO curriculum_subjects (curriculum_id, semester_id, subject_id) VALUES (?, ?, ?)',
          [targetId, semester_id, subId]
        );
      }
    }

    notifyRealtime('curriculum_updated', { curriculum_id: targetId, semester_id, total_subjects: subject_ids.length });

    return sendSuccess(res, `Assigned ${subject_ids.length} subjects to Semester ${semester_id}`);
  } catch (error) {
    next(error);
  }
}

async function removeSubject(req, res, next) {
  try {
    const { id, mappingId } = req.params;
    await db.query('DELETE FROM curriculum_subjects WHERE id = ? AND curriculum_id = ?', [mappingId, id]);

    notifyRealtime('curriculum_updated', { curriculum_id: id, action: 'subject_removed' });

    return sendSuccess(res, 'Subject removed from curriculum');
  } catch (error) {
    next(error);
  }
}

async function duplicateCurriculum(req, res, next) {
  try {
    const { id } = req.params;
    const original = await db.query('SELECT * FROM curriculums WHERE curriculum_id = ?', [id]);
    if (original.length === 0) {
      return sendError(res, 'Original curriculum not found', 404);
    }

    const curr = original[0];
    const newTitle = `${curr.title} (Copy)`;

    const result = await db.query(
      'INSERT INTO curriculums (program_id, academic_year_id, title, status) VALUES (?, ?, ?, ?)',
      [curr.program_id, curr.academic_year_id, newTitle, 'DRAFT']
    );
    const newCurriculumId = result.insertId;

    const mappings = await db.query('SELECT semester_id, subject_id FROM curriculum_subjects WHERE curriculum_id = ?', [id]);
    for (const m of mappings) {
      await db.query('INSERT INTO curriculum_subjects (curriculum_id, semester_id, subject_id) VALUES (?, ?, ?)', [newCurriculumId, m.semester_id, m.subject_id]);
    }

    notifyRealtime('curriculum_created', { curriculum_id: newCurriculumId, title: newTitle });

    return sendSuccess(res, 'Curriculum duplicated successfully', { curriculum_id: newCurriculumId, title: newTitle });
  } catch (error) {
    next(error);
  }
}

async function copyToNewAcademicYear(req, res, next) {
  try {
    const { id } = req.params;
    const { target_academic_year_id } = req.body;

    if (!target_academic_year_id) {
      return sendError(res, 'Target Academic Year ID is required', 400);
    }

    const original = await db.query(
      `SELECT c.*, p.program_name, ay.year_label
       FROM curriculums c
       JOIN programs p ON c.program_id = p.program_id
       JOIN academic_years ay ON c.academic_year_id = ay.academic_year_id
       WHERE c.curriculum_id = ?`,
      [id]
    );

    if (original.length === 0) {
      return sendError(res, 'Original curriculum not found', 404);
    }

    const curr = original[0];
    const targetYear = await db.query('SELECT year_label FROM academic_years WHERE academic_year_id = ?', [target_academic_year_id]);

    const newTitle = `${curr.program_name} (${targetYear[0]?.year_label || 'Curriculum'})`;

    const result = await db.query(
      'INSERT INTO curriculums (program_id, academic_year_id, title, status) VALUES (?, ?, ?, ?)',
      [curr.program_id, target_academic_year_id, newTitle, 'ACTIVE']
    );
    const newCurriculumId = result.insertId;

    const mappings = await db.query('SELECT semester_id, subject_id FROM curriculum_subjects WHERE curriculum_id = ?', [id]);
    for (const m of mappings) {
      await db.query('INSERT INTO curriculum_subjects (curriculum_id, semester_id, subject_id) VALUES (?, ?, ?)', [newCurriculumId, m.semester_id, m.subject_id]);
    }

    notifyRealtime('curriculum_created', { curriculum_id: newCurriculumId, title: newTitle });

    return sendSuccess(res, `Curriculum copied to Academic Year ${targetYear[0]?.year_label}`, { curriculum_id: newCurriculumId, title: newTitle });
  } catch (error) {
    next(error);
  }
}

async function deleteCurriculum(req, res, next) {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM curriculums WHERE curriculum_id = ?', [id]);

    notifyRealtime('curriculum_deleted', { curriculum_id: id });

    return sendSuccess(res, 'Curriculum deleted successfully');
  } catch (error) {
    next(error);
  }
}

async function getCurriculumHierarchy(req, res, next) {
  try {
    const faculties = await db.query("SELECT * FROM faculties WHERE status = 'ACTIVE' OR status IS NULL OR status = '' ORDER BY faculty_code ASC");

    for (const f of faculties) {
      f.programs = await db.query(
        `SELECT p.*, c.curriculum_id, c.title as curriculum_title, ay.year_label as academic_year
         FROM programs p
         LEFT JOIN curriculums c ON p.program_id = c.program_id AND (c.status = 'ACTIVE' OR c.status IS NULL)
         LEFT JOIN academic_years ay ON c.academic_year_id = ay.academic_year_id
         WHERE p.faculty_id = ? AND (p.status = 'ACTIVE' OR p.status IS NULL OR p.status = '')
         ORDER BY p.program_code ASC`,
        [f.faculty_id]
      );

      for (const prog of f.programs) {
        if (prog.curriculum_id) {
          await autoSeedMISIfEmpty(prog.curriculum_id);

          prog.subjects = await db.query(
            `SELECT cs.semester_id, s.subject_id, s.subject_code, s.subject_name, s.credit
             FROM curriculum_subjects cs
             JOIN subjects s ON cs.subject_id = s.subject_id
             WHERE cs.curriculum_id = ?
             ORDER BY cs.semester_id ASC, s.subject_code ASC`,
            [prog.curriculum_id]
          );
        } else {
          prog.subjects = [];
        }
      }
    }

    return sendSuccess(res, 'Curriculum hierarchy fetched', { hierarchy: faculties });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCurriculums,
  getCurriculumById,
  createCurriculum,
  assignSubjects,
  removeSubject,
  duplicateCurriculum,
  copyToNewAcademicYear,
  deleteCurriculum,
  getCurriculumHierarchy
};
