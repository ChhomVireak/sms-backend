const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');

router.get('/', curriculumController.getCurriculums);
router.get('/hierarchy', curriculumController.getCurriculumHierarchy);
router.get('/:id', curriculumController.getCurriculumById);
router.post('/', curriculumController.createCurriculum);
router.post('/:id/assign-subjects', curriculumController.assignSubjects);
router.post('/:id/duplicate', curriculumController.duplicateCurriculum);
router.post('/:id/copy-to-year', curriculumController.copyToNewAcademicYear);
router.delete('/:id/subjects/:mappingId', curriculumController.removeSubject);
router.delete('/:id', curriculumController.deleteCurriculum);

module.exports = router;
