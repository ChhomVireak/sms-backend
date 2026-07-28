const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacherController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/attendance/logs', authenticateToken, teacherController.getTeacherAttendance);
router.post('/attendance/logs', authenticateToken, authorizeRoles('ADMIN'), teacherController.saveTeacherAttendance);
router.get('/', authenticateToken, teacherController.getTeachers);
router.get('/:id', authenticateToken, teacherController.getTeacherById);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), upload.single('image'), teacherController.createTeacher);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), upload.single('image'), teacherController.updateTeacher);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), teacherController.deleteTeacher);

module.exports = router;
