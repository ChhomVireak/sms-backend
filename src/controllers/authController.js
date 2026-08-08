const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwtHelper');
const { sendSuccess, sendError } = require('../utils/responseHandler');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    if (!username || !password || !String(username).trim() || !String(password).trim()) {
      return sendError(res, 'Username/Email/Student ID and Password are required', 400);
    }

    const cleanUser = String(username).trim();

    // Strict Rule: Admin MUST NOT use plain username 'admin' to login. Must use Email only (e.g. admin@school.edu)
    if (cleanUser.toLowerCase() === 'admin') {
      return sendError(res, 'Admin account cannot use username admin to login. Please use official email (e.g. admin@school.edu)', 400);
    }

    let users = await db.query(
      `SELECT u.*, 
        s.student_id, s.custom_student_id, s.first_name as s_fname, s.last_name as s_lname, s.image as s_image, s.group_id, s.dob, s.status as s_status,
        t.teacher_id, t.custom_teacher_id, t.first_name as t_fname, t.last_name as t_lname, t.image as t_image, t.status as t_status
       FROM users u
       LEFT JOIN students s ON u.user_id = s.user_id
       LEFT JOIN teachers t ON u.user_id = t.user_id
       WHERE u.username = ? OR u.email = ? OR s.custom_student_id = ? OR CAST(s.student_id AS CHAR) = ? OR REPLACE(s.custom_student_id, '-', '') = ?`,
      [cleanUser, cleanUser, cleanUser, cleanUser, cleanUser]
    );

    // Auto-create default Admin user safely if NO admin account exists in database at all
    if (users.length === 0 && cleanUser.toLowerCase() === 'admin@school.edu') {
      if (password === 'admin123') {
        const adminPassHash = await bcrypt.hash('admin123', 10);
        await db.query(
          "INSERT IGNORE INTO users (username, email, password, role, status) VALUES ('admin', 'admin@school.edu', ?, 'ADMIN', 'ACTIVE')",
          [adminPassHash]
        );
        users = await db.query(
          `SELECT u.*, 
            s.student_id, s.custom_student_id, s.first_name as s_fname, s.last_name as s_lname, s.image as s_image, s.group_id, s.dob,
            t.teacher_id, t.custom_teacher_id, t.first_name as t_fname, t.last_name as t_lname, t.image as t_image
           FROM users u
           LEFT JOIN students s ON u.user_id = s.user_id
           LEFT JOIN teachers t ON u.user_id = t.user_id
           WHERE u.email = 'admin@school.edu'`
        );
      }
    }

    // Fallback: If user not found in users table, search directly in students table
    if (users.length === 0) {
      const studentMatch = await db.query(
        `SELECT * FROM students WHERE custom_student_id = ? OR CAST(student_id AS CHAR) = ? OR REPLACE(custom_student_id, '-', '') = ?`,
        [cleanUser, cleanUser, cleanUser]
      );

      if (studentMatch.length > 0) {
        const student = studentMatch[0];
        let linkedUserId = student.user_id;

        if (!linkedUserId) {
          const uName = student.custom_student_id;
          const uEmail = `${uName.toLowerCase()}@school.edu`;
          const existingUser = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [uName, uEmail]);

          if (existingUser.length > 0) {
            linkedUserId = existingUser[0].user_id;
          } else {
            let defaultPass = '01012000';
            if (student.dob) {
              const yyyy = String(student.dob.getUTCFullYear ? student.dob.getUTCFullYear() : String(student.dob).slice(0, 4));
              const mm = String(student.dob.getUTCMonth ? student.dob.getUTCMonth() + 1 : String(student.dob).slice(5, 7)).padStart(2, '0');
              const dd = String(student.dob.getUTCDate ? student.dob.getUTCDate() : String(student.dob).slice(8, 10)).padStart(2, '0');
              defaultPass = `${dd}${mm}${yyyy}`;
            }
            const hashedPass = await bcrypt.hash(defaultPass, 10);
            const uRes = await db.query(
              "INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'STUDENT', 'ACTIVE')",
              [uName, uEmail, hashedPass]
            );
            linkedUserId = uRes.insertId;
          }
          await db.query('UPDATE students SET user_id = ? WHERE student_id = ?', [linkedUserId, student.student_id]);
        }

        users = await db.query(
          `SELECT u.*, 
            s.student_id, s.custom_student_id, s.first_name as s_fname, s.last_name as s_lname, s.image as s_image, s.group_id, s.dob, s.status as s_status,
            t.teacher_id, t.custom_teacher_id, t.first_name as t_fname, t.last_name as t_lname, t.image as t_image, t.status as t_status
           FROM users u
           LEFT JOIN students s ON u.user_id = s.user_id
           LEFT JOIN teachers t ON u.user_id = t.user_id
           WHERE u.user_id = ?`,
          [linkedUserId]
        );
      }
    }

    if (users.length === 0) {
      return sendError(res, 'Invalid Username, Email, or Password', 401);
    }

    const user = users[0];

    // Admin Role Validation: Reject if Admin tries to login without an Email
    if ((user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && !cleanUser.includes('@')) {
      return sendError(res, 'Invalid Username, Email, or Password', 400);
    }

    const uStatus = String(user.status || 'ACTIVE').toUpperCase();
    const sStatus = user.s_status ? String(user.s_status).toUpperCase() : 'ACTIVE';
    const tStatus = user.t_status ? String(user.t_status).toUpperCase() : 'ACTIVE';

    if (uStatus === 'INACTIVE' || uStatus === 'DISABLED' || uStatus === 'SUSPENDED' || sStatus === 'INACTIVE' || tStatus === 'INACTIVE') {
      return sendError(res, 'Account is INACTIVE. Cannot access system. Please contact Administrator.', 403);
    }

    let isMatch = await bcrypt.compare(password, user.password);

    // Fallback Admin Password matching: pass = 'admin123'
    if (!isMatch && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      if (password === 'admin123') {
        isMatch = true;
      }
    }

    // Fallback DOB matching for Student Login: Pass = Date of Birth (DDMMYYYY e.g., 15042005)
    if (!isMatch && (user.role === 'STUDENT' || user.dob)) {
      if (user.dob) {
        let yyyy = '', mm = '', dd = '';
        if (user.dob instanceof Date) {
          if (!isNaN(user.dob.getTime())) {
            yyyy = String(user.dob.getUTCFullYear());
            mm = String(user.dob.getUTCMonth() + 1).padStart(2, '0');
            dd = String(user.dob.getUTCDate()).padStart(2, '0');
          }
        } else {
          const dobRawStr = String(user.dob).trim();
          const match = dobRawStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
          if (match) {
            yyyy = match[1];
            mm = match[2].padStart(2, '0');
            dd = match[3].padStart(2, '0');
          }
        }

        if (yyyy && mm && dd) {
          const ddmmyyyy = `${dd}${mm}${yyyy}`;
          const yyyymmdd = `${yyyy}${mm}${dd}`;
          const mmddyyyy = `${mm}${dd}${yyyy}`;
          const isoDate  = `${yyyy}-${mm}-${dd}`;
          const dashDate = `${dd}-${mm}-${yyyy}`;
          const slashDate = `${dd}/${mm}/${yyyy}`;
          const cleanPass = String(password).replace(/[^0-9]/g, '');

          const singleDd = String(parseInt(dd, 10));
          const singleMm = String(parseInt(mm, 10));
          const flexDmY  = `${singleDd}${singleMm}${yyyy}`;

          if (
            cleanPass === ddmmyyyy || 
            cleanPass === yyyymmdd || 
            cleanPass === mmddyyyy ||
            cleanPass === flexDmY ||
            password === isoDate || 
            password === dashDate ||
            password === slashDate ||
            password === `${singleDd}/${singleMm}/${yyyy}` ||
            password === `${singleDd}-${singleMm}-${yyyy}`
          ) {
            isMatch = true;
          }
        }
      }
    }

    // Fallback Email Prefix matching for Teacher Login: Pass = Email Prefix before '@' (e.g. teacher123@gmail.com => teacher123)
    if (!isMatch && user.role === 'TEACHER' && user.email && user.email.includes('@')) {
      const emailPrefix = user.email.split('@')[0];
      if (password === emailPrefix) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      return sendError(res, 'Invalid Username, Email, or Password', 401);
    }

    const payload = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      studentId: user.student_id || null,
      teacherId: user.teacher_id || null,
      fullName: user.role === 'STUDENT' ? `${user.s_fname} ${user.s_lname}` : (user.role === 'TEACHER' ? `${user.t_fname} ${user.t_lname}` : user.username)
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return sendSuccess(res, 'Login successful', {
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        studentId: user.student_id || null,
        teacherId: user.teacher_id || null,
        fullName: payload.fullName,
        image: user.s_image || user.t_image || user.image || null
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
}

async function register(req, res, next) {
  try {
    const { username, email, password, role = 'STUDENT' } = req.body;

    if (!username || !email || !password) {
      return sendError(res, 'Username, email and password are required', 400);
    }

    const existing = await db.query('SELECT user_id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.length > 0) {
      return sendError(res, 'Username or email already in use', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      "INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, 'ACTIVE')",
      [username, email, hashedPassword, role.toUpperCase()]
    );

    return sendSuccess(res, 'User registered successfully', { userId: result.insertId, username, email, role }, 201);
  } catch (error) {
    next(error);
  }
}

async function logout(req, res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  return sendSuccess(res, 'Logged out successfully');
}

async function getMe(req, res, next) {
  try {
    const userId = req.user.userId;
    const users = await db.query(
      `SELECT u.user_id, u.username, u.email, u.role, u.status, u.created_at,
        s.student_id, s.custom_student_id, s.first_name as s_fname, s.last_name as s_lname, s.image as s_image, s.group_id,
        t.teacher_id, t.custom_teacher_id, t.first_name as t_fname, t.last_name as t_lname, t.image as t_image
       FROM users u
       LEFT JOIN students s ON u.user_id = s.user_id
       LEFT JOIN teachers t ON u.user_id = t.user_id
       WHERE u.user_id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return sendError(res, 'User not found', 404);
    }

    const user = users[0];
    const fullName = user.role === 'STUDENT' ? `${user.s_fname || ''} ${user.s_lname || ''}`.trim()
      : (user.role === 'TEACHER' ? `${user.t_fname || ''} ${user.t_lname || ''}`.trim() : user.username);
    const image = user.role === 'STUDENT' ? user.s_image : (user.role === 'TEACHER' ? user.t_image : null);

    return sendSuccess(res, 'User profile fetched', {
      user: {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        fullName: fullName || user.username,
        studentId: user.student_id,
        teacherId: user.teacher_id,
        groupId: user.group_id,
        image
      }
    });
  } catch (error) {
    next(error);
  }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.body.refreshToken || req.cookies?.refreshToken;
    if (!token) {
      return sendError(res, 'Refresh token required', 400);
    }

    const decoded = verifyRefreshToken(token);
    const users = await db.query('SELECT user_id, username, email, role, status FROM users WHERE user_id = ?', [decoded.userId]);
    if (users.length === 0 || users[0].status !== 'ACTIVE') {
      return sendError(res, 'User inactive or not found', 403);
    }

    const user = users[0];
    const payload = { userId: user.user_id, username: user.username, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(payload);

    return sendSuccess(res, 'Token refreshed', { accessToken: newAccessToken });
  } catch (error) {
    return sendError(res, 'Invalid refresh token', 403);
  }
}

module.exports = {
  login,
  register,
  logout,
  getMe,
  refreshToken
};
