const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');

// Webhook
router.post('/webhook', lineController.webhook);

module.exports = router;
