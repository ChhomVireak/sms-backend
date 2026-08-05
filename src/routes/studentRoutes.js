const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/', authenticateToken, studentController.getStudents);
router.get('/me', authenticateToken, studentController.getStudentMe);
router.get('/:id', authenticateToken, studentController.getStudentById);
router.get('/:id/academic-history', authenticateToken, studentController.getStudentHistory);
router.post('/import', authenticateToken, authorizeRoles('ADMIN'), studentController.importStudents);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), upload.single('image'), studentController.createStudent);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), upload.single('image'), studentController.updateStudent);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), studentController.deleteStudent);

module.exports = router;
