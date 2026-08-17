const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { auth, adminOnly } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');

// Public Routes (นักศึกษา)
router.post('/create', requestController.createRequest);
router.get('/student/:studentId', requestController.getStudentRequests);
router.put('/update/:requestNumber', requestController.updateRequest);
router.post('/upload-company-response/:requestNumber', 
  uploadSingle('file'), 
  requestController.uploadCompanyResponse
);
router.get('/download-response/:requestNumber', requestController.downloadResponseLetter);
router.get('/download-referral/:requestNumber', requestController.downloadReferralLetter);

// Admin Routes
router.get('/all', auth, adminOnly, requestController.getAllRequests);
router.get('/dashboard/stats', auth, adminOnly, requestController.getDashboardStats);
router.post('/upload-response/:requestNumber', 
  auth, 
  adminOnly, 
  uploadSingle('file'), 
  requestController.uploadResponseLetter
);
router.post('/upload-referral/:requestNumber', 
  auth, 
  adminOnly, 
  uploadSingle('file'), 
  requestController.uploadReferralLetter
);
router.delete('/delete/:requestNumber', auth, adminOnly, requestController.deleteRequest);

module.exports = router;