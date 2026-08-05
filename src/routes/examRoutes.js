const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/groups', authenticateToken, examController.getExamGroups);
router.post('/groups', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), examController.createExamGroup);
router.delete('/groups/:id', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), examController.deleteExamGroup);

router.get('/', authenticateToken, examController.getExams);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), examController.createExam);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), examController.updateExam);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), examController.deleteExam);

module.exports = router;
