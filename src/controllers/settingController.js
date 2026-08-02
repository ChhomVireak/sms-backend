const db = require('../config/database');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function ensureTableExists() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_id INT PRIMARY KEY AUTO_INCREMENT,
      school_name VARCHAR(255) DEFAULT 'EduTrack SMS Academy',
      school_code VARCHAR(50) DEFAULT 'ETA-2026-KH',
      email VARCHAR(255) DEFAULT 'admin@edutrack.edu.kh',
      phone VARCHAR(50) DEFAULT '+855 23 999 888',
      address VARCHAR(255) DEFAULT 'Phnom Penh, Cambodia',
      academic_year VARCHAR(50) DEFAULT '2025–2026',
      active_term VARCHAR(50) DEFAULT 'Term 2',
      two_factor_auth TINYINT(1) DEFAULT 1,
      auto_backup TINYINT(1) DEFAULT 1,
      theme_mode VARCHAR(20) DEFAULT 'Dark',
      accent_color VARCHAR(50) DEFAULT 'Emerald',
      session_timeout INT DEFAULT 60,
      password_policy VARCHAR(20) DEFAULT 'strong',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  try {
    const existingCols = await db.query('SHOW COLUMNS FROM system_settings');
    const existingColNames = existingCols.map(c => c.Field);

    const colsToAdd = [
      { name: 'active_term', def: "VARCHAR(50) DEFAULT 'Term 2'" },
      { name: 'theme_mode', def: "VARCHAR(20) DEFAULT 'Dark'" },
      { name: 'accent_color', def: "VARCHAR(50) DEFAULT 'Emerald'" },
      { name: 'session_timeout', def: "INT DEFAULT 60" },
      { name: 'password_policy', def: "VARCHAR(20) DEFAULT 'strong'" },
      { name: 'school_lat', def: "DECIMAL(10,8) DEFAULT 11.5564000" },
      { name: 'school_lng', def: "DECIMAL(11,8) DEFAULT 104.9282000" },
      { name: 'allowed_radius_meters', def: "INT DEFAULT 100" },
      { name: 'authorized_wifi_ips', def: "TEXT NULL" }
    ];

    for (const col of colsToAdd) {
      if (!existingColNames.includes(col.name)) {
        await db.query(`ALTER TABLE system_settings ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  } catch (err) {
    // Silent catch
  }
}
// Table creation and migrations handled in initDatabase.js

async function getSettings(req, res, next) {
  try {

    let settings = await db.query('SELECT * FROM system_settings LIMIT 1');

    if (settings.length === 0) {
      await db.query(`
        INSERT INTO system_settings (school_name, school_code, email, phone, address, academic_year, active_term, two_factor_auth, auto_backup, theme_mode, accent_color, session_timeout, password_policy)
        VALUES ('EduTrack SMS Academy', 'ETA-2026-KH', 'admin@edutrack.edu.kh', '+855 23 999 888', 'Phnom Penh, Cambodia', '2025–2026', 'Term 2', 1, 1, 'Dark', 'Emerald', 60, 'strong')
      `);
      settings = await db.query('SELECT * FROM system_settings LIMIT 1');
    }

    return sendSuccess(res, 'System settings fetched', { settings: settings[0] });
  } catch (error) {
    next(error);
  }
}

async function updateSettings(req, res, next) {
  try {

    const {
      school_name, school_code, email, phone, address, academic_year, active_term = 'Term 2',
      two_factor_auth, auto_backup, theme_mode = 'Dark', accent_color = 'Emerald',
      session_timeout = 60, password_policy = 'strong',
      school_lat = 11.5564000, school_lng = 104.9282000, allowed_radius_meters = 100,
      authorized_wifi_ips = ''
    } = req.body;

    const existing = await db.query('SELECT setting_id FROM system_settings LIMIT 1');

    if (existing.length === 0) {
      await db.query(
        `INSERT INTO system_settings 
         (school_name, school_code, email, phone, address, academic_year, active_term, two_factor_auth, auto_backup, theme_mode, accent_color, session_timeout, password_policy, school_lat, school_lng, allowed_radius_meters, authorized_wifi_ips)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [school_name, school_code, email, phone, address, academic_year, active_term, two_factor_auth ? 1 : 0, auto_backup ? 1 : 0, theme_mode, accent_color, session_timeout, password_policy, school_lat, school_lng, allowed_radius_meters, authorized_wifi_ips]
      );
    } else {
      await db.query(
        `UPDATE system_settings SET 
         school_name = ?, school_code = ?, email = ?, phone = ?, address = ?, academic_year = ?, active_term = ?,
         two_factor_auth = ?, auto_backup = ?, theme_mode = ?, accent_color = ?, session_timeout = ?, password_policy = ?,
         school_lat = ?, school_lng = ?, allowed_radius_meters = ?, authorized_wifi_ips = ?
         WHERE setting_id = ?`,
        [school_name, school_code, email, phone, address, academic_year, active_term, two_factor_auth ? 1 : 0, auto_backup ? 1 : 0, theme_mode, accent_color, session_timeout, password_policy, school_lat, school_lng, allowed_radius_meters, authorized_wifi_ips, existing[0].setting_id]
      );
    }

    return sendSuccess(res, 'System settings updated successfully');
  } catch (error) {
    next(error);
  }
}

async function downloadBackup(req, res, next) {
  try {

    const tables = ['users', 'student_groups', 'students', 'teachers', 'subjects', 'rooms', 'attendance', 'exams', 'academic_results', 'fee_schedules', 'payments', 'timetables', 'notifications', 'system_settings'];

    let sqlDump = `-- EduTrack SMS Database Dump Backup\n`;
    sqlDump += `-- Date Generated: ${new Date().toISOString()}\n`;
    sqlDump += `-- MySQL Database Name: school_management_db\n\n`;
    sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

    for (const tbl of tables) {
      try {
        const rows = await db.query(`SELECT * FROM ${tbl}`);
        sqlDump += `-- Table structure and data for \`${tbl}\` (${rows.length} records)\n`;
        if (rows.length > 0) {
          const keys = Object.keys(rows[0]);
          const cols = keys.map(k => `\`${k}\``).join(', ');

          sqlDump += `INSERT INTO \`${tbl}\` (${cols}) VALUES\n`;
          const values = rows.map(r => {
            const valList = keys.map(k => {
              const val = r[k];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return val;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(', ');
            return `  (${valList})`;
          }).join(',\n');

          sqlDump += `${values};\n\n`;
        }
      } catch (e) {
        // Table might not exist yet, skip silently
      }
    }

    sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
    sqlDump += `-- End of Backup Dump\n`;

    const fileName = `sms_database_backup_${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(sqlDump);
  } catch (error) {
    next(error);
  }
}

module.exports = { getSettings, updateSettings, downloadBackup };
