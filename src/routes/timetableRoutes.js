const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/slots', authenticateToken, timetableController.getTimeSlots);
router.post('/slots', authenticateToken, authorizeRoles('ADMIN'), timetableController.createTimeSlot);
router.delete('/slots/:id', authenticateToken, authorizeRoles('ADMIN'), timetableController.deleteTimeSlot);
router.get('/', authenticateToken, timetableController.getTimetables);
router.post('/', authenticateToken, authorizeRoles('ADMIN'), timetableController.createTimetableSlot);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), timetableController.updateTimetableSlot);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), timetableController.deleteTimetableSlot);
router.delete('/', authenticateToken, authorizeRoles('ADMIN'), timetableController.clearGroupTimetable);

module.exports = router;
