const express = require('express');
const router = express.Router();
const resultController = require('../controllers/resultController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, resultController.getResults);
router.get('/student/:studentId?', authenticateToken, resultController.getStudentGrades);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'TEACHER'), resultController.saveResults);

module.exports = router;
