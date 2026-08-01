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



module.exports = {
  pool,
  query
};
