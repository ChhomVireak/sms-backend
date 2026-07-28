const express = require('express');
const router = express.Router();
const feeController = require('../controllers/feeController');
const authenticateToken = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/categories', authenticateToken, feeController.getFeeCategories);
router.post('/categories', authenticateToken, authorizeRoles('ADMIN'), feeController.createFeeCategory);

router.get('/', authenticateToken, feeController.getFeeSchedules);
router.get('/schedules', authenticateToken, feeController.getFeeSchedules);

router.post('/', authenticateToken, authorizeRoles('ADMIN'), feeController.createFeeSchedule);
router.post('/schedules', authenticateToken, authorizeRoles('ADMIN'), feeController.createFeeSchedule);

router.put('/:id', authenticateToken, authorizeRoles('ADMIN'), feeController.updateFeeSchedule);
router.put('/schedules/:id', authenticateToken, authorizeRoles('ADMIN'), feeController.updateFeeSchedule);

router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), feeController.deleteFeeSchedule);
router.delete('/schedules/:id', authenticateToken, authorizeRoles('ADMIN'), feeController.deleteFeeSchedule);

module.exports = router;
