const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { auth, adminOnly } = require('../middleware/auth');

// Public
router.get('/active', announcementController.getActiveAnnouncements);

// Admin
router.get('/all', auth, adminOnly, announcementController.getAllAnnouncements);
router.post('/create', auth, adminOnly, announcementController.createAnnouncement);
router.put('/update/:announcementId', auth, adminOnly, announcementController.updateAnnouncement);
router.delete('/delete/:announcementId', auth, adminOnly, announcementController.deleteAnnouncement);

module.exports = router;