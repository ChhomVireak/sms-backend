const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, subjectController.getSubjects);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), subjectController.createSubject);
router.post('/seed-test-subjects', authenticateToken, authorizeRoles('ADMIN'), subjectController.seedTestSubjects);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), subjectController.updateSubject);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), subjectController.deleteSubject);

module.exports = router;
