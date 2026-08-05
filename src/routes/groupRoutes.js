const express = require('express');
const router = express.Router();
const groupController = require('../controllers/groupController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, groupController.getGroups);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), groupController.createGroup);
router.get('/:id/promotion-audit', authenticateToken, groupController.getPromotionAudit);
router.post('/resolve-reexam', authenticateToken, authorizeRoles('ADMIN'), groupController.resolveReexam);
router.post('/promote-all', authenticateToken, authorizeRoles('ADMIN'), groupController.promoteAllGroups);
router.post('/:id/promote', authenticateToken, authorizeRoles('ADMIN'), groupController.promoteGroup);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), groupController.updateGroup);
router.post('/:id/assign-students', authenticateToken, authorizeRoles('ADMIN'), groupController.assignStudents);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), groupController.deleteGroup);

module.exports = router;
