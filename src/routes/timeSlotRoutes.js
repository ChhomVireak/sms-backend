const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authenticateToken, timetableController.getTimeSlots);
router.get('/slots', authenticateToken, timetableController.getTimeSlots);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), timetableController.createTimeSlot);
router.post('/slots', authenticateToken, authorizeRoles('ADMIN'), timetableController.createTimeSlot);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), timetableController.deleteTimeSlot);
router.delete('/slots/:id', authenticateToken, authorizeRoles('ADMIN'), timetableController.deleteTimeSlot);

module.exports = router;
