const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const authenticateToken = require('../middleware/authMiddleware');

router.get('/', authenticateToken, departmentController.getDepartments);
router.post('/', authenticateToken, departmentController.createDepartment);

module.exports = router;
