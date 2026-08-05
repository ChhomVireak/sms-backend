const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, roomController.getRooms);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), roomController.createRoom);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), roomController.updateRoom);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), roomController.deleteRoom);

module.exports = router;
