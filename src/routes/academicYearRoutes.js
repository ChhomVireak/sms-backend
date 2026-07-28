const express = require('express');
const router = express.Router();
const academicYearController = require('../controllers/academicYearController');

router.get('/', academicYearController.getAcademicYears);
router.post('/', academicYearController.createAcademicYear);
router.put('/:id', academicYearController.updateAcademicYear);
router.delete('/:id', academicYearController.deleteAcademicYear);

module.exports = router;
