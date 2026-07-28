const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/', authenticateToken, settingController.getSettings);
router.post('/', authenticateToken, settingController.updateSettings);
router.get('/backup', authenticateToken, settingController.downloadBackup);

module.exports = router;
