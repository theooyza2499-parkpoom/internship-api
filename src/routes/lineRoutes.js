const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');

// ✅ ใช้ arrow function ครอบเพื่อรักษา context ของ this
router.post('/webhook', (req, res) => lineController.webhook(req, res));

module.exports = router;
