const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');

// Authenticate all report routes
router.use(authenticateToken);

// Category A: Academic Reports
router.get('/academic/transcript', reportController.getStudentTranscriptReport);
router.get('/academic/gpa', reportController.getGpaReport);
router.get('/academic/class-ranking', reportController.getClassRankingReport);
router.get('/academic/reexam-retained', reportController.getReexamReport);
router.get('/academic/subject-pass-fail', reportController.getSubjectPassFailReport);

// Category B: Attendance Reports
router.get('/attendance/student-summary', reportController.getStudentAttendanceSummaryReport);
router.get('/attendance/class-rate', reportController.getClassAttendanceRateReport);
router.get('/attendance/subject-rate', reportController.getSubjectAttendanceRateReport);
router.get('/attendance/teacher-completion', reportController.getTeacherAttendanceCompletionReport);
router.get('/attendance/teacher-checkin', reportController.getTeacherCheckinReport);

// Category C: Financial Reports
router.get('/financial/outstanding', reportController.getOutstandingBalanceReport);
router.get('/financial/collection', reportController.getPaymentCollectionReport);
router.get('/financial/revenue-program', reportController.getRevenueByProgramReport);

// Category D: Enrollment / Structure Reports
router.get('/enrollment/class-summary', reportController.getClassGroupSummaryReport);
router.get('/enrollment/program-enrollment', reportController.getProgramEnrollmentReport);
router.get('/enrollment/curriculum-completion', reportController.getCurriculumCompletionReport);
router.get('/enrollment/faculty-summary', reportController.getDepartmentFacultySummaryReport);

// Category E: Exam Reports
router.get('/exam/schedule', reportController.getExamScheduleReport);
router.get('/exam/room-utilization', reportController.getRoomUtilizationReport);

// Category F: Teacher / Staff Reports
router.get('/teacher/workload', reportController.getTeacherWorkloadReport);
router.get('/teacher/payroll', reportController.getPayrollSummaryReport);

// Category G: Dashboard Summary
router.get('/dashboard-summary', reportController.getDashboardSummary);

module.exports = router;
