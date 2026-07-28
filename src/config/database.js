const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 25,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  timezone: '+00:00'
});

async function query(sql, params) {
  try {
    const [rows, fields] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    // Ignore console logging for benign schema/migration/index checks
    const isIgnoredSchemaErr = error.code === 'ER_DUP_FIELDNAME' || error.errno === 1060 ||
      error.code === 'ER_TABLE_EXISTS_ERROR' || error.errno === 1050 ||
      error.code === 'ER_DUP_KEYNAME' || error.errno === 1061 ||
      error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146 ||
      error.code === 'ER_KEY_COLUMN_DOES_NOT_EXISTS' || error.errno === 1072 ||
      error.code === 'ER_CANT_DROP_FIELD_OR_KEY' || error.errno === 1091;
    if (!isIgnoredSchemaErr) {
      console.error('Database Query Error:', error.message, '| Query:', sql);
    }
    throw error;
  }
}

// Auto-create database indexes quietly on server launch for sub-millisecond query performance
(async () => {
  const indexStatements = [
    `CREATE INDEX idx_students_custom_id ON students(custom_student_id)`,
    `CREATE INDEX idx_students_user_group ON students(user_id, group_id)`,
    `CREATE INDEX idx_teachers_custom_id ON teachers(custom_teacher_id)`,
    `CREATE INDEX idx_teachers_user ON teachers(user_id)`,
    `CREATE INDEX idx_groups_code ON student_groups(group_code)`,
    `CREATE INDEX idx_timetables_lookup ON timetables(group_id, teacher_id, semester_id, day_of_week)`,
    `CREATE INDEX idx_exams_lookup ON exams(group_id, exam_group_id, exam_date)`,
    `CREATE INDEX idx_results_lookup ON academic_results(student_id, exam_id)`,
    `CREATE INDEX idx_teacher_att_date ON teacher_attendance(teacher_id, date)`
  ];

  for (const stmt of indexStatements) {
    try {
      await pool.execute(stmt);
    } catch (e) { /* silent catch for unseeded tables or existing indexes */ }
  }
})();

module.exports = {
  pool,
  query
};
