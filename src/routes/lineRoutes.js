const express = require('express');
const router = express.Router();
const lineController = require('../controllers/lineController');

// ============================================================
//  LINE Webhook
// ============================================================
router.post('/webhook', lineController.webhook);

// ✅ ทดสอบ Webhook (GET)
router.get('/webhook', (req, res) => {
    res.json({
        success: true,
        message: 'LINE Webhook endpoint is active',
        timestamp: new Date().toISOString()
    });
});

// ✅ ทดสอบส่งข้อความ
router.get('/test', async (req, res) => {
    try {
        const lineService = require('../services/lineService');
        const result = await lineService.sendLineMessage(
            lineService.ADMIN_USER_ID,
            `🧪 ทดสอบจาก /api/line/test\n📅 ${new Date().toLocaleString('th-TH')}`
        );
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
