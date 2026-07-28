const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');

router.get('/', semesterController.getSemesters);
router.post('/', semesterController.createSemester);
router.put('/:id', semesterController.updateSemester);
router.delete('/:id', semesterController.deleteSemester);

module.exports = router;
