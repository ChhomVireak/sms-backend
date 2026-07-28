const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, authorizeRoles('ADMIN'), userController.getUsers);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), userController.createUser);
router.patch('/:id/status', authenticateToken, authorizeRoles('ADMIN'), userController.updateUserStatus);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), userController.deleteUser);

module.exports = router;
