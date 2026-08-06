const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const groupRoutes = require('./routes/groupRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const roomRoutes = require('./routes/roomRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const examRoutes = require('./routes/examRoutes');
const resultRoutes = require('./routes/resultRoutes');
const feeRoutes = require('./routes/feeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const timeSlotRoutes = require('./routes/timeSlotRoutes');
const userRoutes = require('./routes/userRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingRoutes = require('./routes/settingRoutes');
const departmentRoutes = require('./routes/departmentRoutes');

// Academic & Curriculum Management Routes
const facultyRoutes = require('./routes/facultyRoutes');
const programRoutes = require('./routes/programRoutes');
const academicYearRoutes = require('./routes/academicYearRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Disable X-Powered-By header to hide Express implementation details
app.disable('x-powered-by');

// Security HTTP Headers with Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
  frameguard: { action: "deny" }
}));

// CORS Protection
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Skip-Loading', 'X-Show-Loading']
}));

// High Performance Gzip Payload Compression (Level 6)
app.use(compression({
  level: 6,
  threshold: 512,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Static folder for uploaded files with 1-day Browser Cache control for fast image loading
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: true
}));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'EduTrack School Management System API', timestamp: new Date() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/time-slots', timeSlotRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/departments', departmentRoutes);

// Register Academic & Curriculum Routes
app.use('/api/faculties', facultyRoutes);
app.use('/api/programs', programRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/curriculums', curriculumRoutes);
app.use('/api/reports', reportRoutes);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
