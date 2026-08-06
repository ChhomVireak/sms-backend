const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, attendanceController.getAttendance);
router.get('/stats', authenticateToken, attendanceController.getAttendanceStats);
router.get('/session', authenticateToken, attendanceController.getSessionAttendance);
router.post('/session', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), attendanceController.markSessionAttendance);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), attendanceController.markAttendance);
router.post('/multi-day-leave', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), attendanceController.markMultiDayLeave);
router.delete('/', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), attendanceController.deleteAttendance);

module.exports = router;
