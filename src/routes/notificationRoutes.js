const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, notificationController.getNotifications);
router.post('/read-all', authenticateToken, notificationController.markAllNotificationsAsRead);
router.post('/:id/read', authenticateToken, notificationController.markNotificationAsRead);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), notificationController.createNotification);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), notificationController.deleteNotification);

module.exports = router;
