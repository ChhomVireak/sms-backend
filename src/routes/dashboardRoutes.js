const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/admin', authenticateToken, authorizeRoles('ADMIN'), dashboardController.getAdminDashboard);
router.get('/teacher', authenticateToken, authorizeRoles('TEACHER', 'ADMIN'), dashboardController.getTeacherDashboard);
router.get('/student', authenticateToken, authorizeRoles('STUDENT', 'ADMIN'), dashboardController.getStudentDashboard);

module.exports = router;
