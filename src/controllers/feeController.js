const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

// Auto-migrate schema and seed default 4-Year Degree Fee Schedules & Categories
(async () => {
  try {
    await db.query(`ALTER TABLE fee_schedules MODIFY COLUMN term VARCHAR(50) NULL DEFAULT 'Semester 1'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE fee_schedules ADD COLUMN term VARCHAR(50) NULL DEFAULT 'Semester 1'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE fee_schedules ADD COLUMN semester_id INT NULL DEFAULT 1`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE fee_schedules ADD COLUMN academic_year VARCHAR(50) DEFAULT 'Year 1'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE fee_schedules ADD COLUMN term_cycle VARCHAR(50) DEFAULT 'Semester 1'`);
  } catch (e) {}
  try {
    await db.query(`ALTER TABLE fee_schedules ADD COLUMN late_penalty_rate DECIMAL(5,2) DEFAULT 5.00`);
  } catch (e) {}

  // Create & Seed fee_categories table
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS fee_categories (
        category_id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        default_amount DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const catCheck = await db.query('SELECT COUNT(*) as count FROM fee_categories');
    if (catCheck[0]?.count === 0) {
      await db.query(`
        INSERT INTO fee_categories (title, description, default_amount) VALUES
        ('Semester Tuition Fee', 'Per semester (6 months) degree tuition', 390.00),
        ('Full Year Tuition Fee', 'Annual full year tuition ($390 x 2)', 780.00),
        ('Laboratory & Tech Fee', 'Computer lab & digital access fee', 50.00),
        ('Graduation & Thesis Fee', 'Year 4 graduation & defense fee', 120.00)
      `);
      console.log('Seeded default fee categories.');
    }
  } catch (err) {
    console.error('Error creating fee_categories table:', err);
  }

  // Seed default 4-Year Degree Fee Schedules if table is empty
  try {
    const existing = await db.query('SELECT COUNT(*) as count FROM fee_schedules');
    if (existing[0]?.count === 0) {
      const groups = await db.query('SELECT group_id FROM student_groups LIMIT 10');
      const sampleGroupId = groups.length > 0 ? groups[0].group_id : 1;

      const defaultSchedules = [
        { title: 'Year 1 Semester 1 Tuition Fee', year: 'Year 1', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 1 Semester 2 Tuition Fee', year: 'Year 1', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 2 Semester 1 Tuition Fee', year: 'Year 2', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 2 Semester 2 Tuition Fee', year: 'Year 2', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 3 Semester 1 Tuition Fee', year: 'Year 3', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 3 Semester 2 Tuition Fee', year: 'Year 3', term: 'Semester 2', amount: 390.00, date: '2027-02-15' },
        { title: 'Year 4 Semester 1 Tuition Fee', year: 'Year 4', term: 'Semester 1', amount: 390.00, date: '2026-09-15' },
        { title: 'Year 4 Semester 2 Graduation & Tuition Fee', year: 'Year 4', term: 'Semester 2', amount: 450.00, date: '2027-02-15' }
      ];

      for (const item of defaultSchedules) {
        await db.query(
          `INSERT INTO fee_schedules (group_id, semester_id, fee_title, amount, due_date, late_penalty_rate, academic_year, term_cycle, term)
           VALUES (?, 1, ?, ?, ?, 5.00, ?, ?, ?)`,
          [sampleGroupId, item.title, item.amount, item.date, item.year, item.term, item.term]
        );
      }
      console.log('Seeded 8 default 4-year degree fee schedules.');
    }
  } catch (err) {
    console.error('Error seeding fee schedules:', err);
  }
})();

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

    if (group_id) { whereClauses.push('fs.group_id = ?'); params.push(group_id); }
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

    return sendSuccess(res, 'Fee schedules fetched', { schedules });
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
