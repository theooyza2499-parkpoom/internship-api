const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/change-password', auth, authController.changePassword);
router.get('/verify', auth, authController.verifyToken);

module.exports = router;