const lineService = require('../services/lineService');
const https = require('https');

// ✅ ตรวจสอบเวอร์ชัน
console.log('🔥 lineController.js version: 2026-09-17-v3');

class LineController {
    constructor() {
        // ✅ ผูก this ให้ทุก method
        this.webhook = this.webhook.bind(this);
        this.handleEvent = this.handleEvent.bind(this);
        this.replyMessage = this.replyMessage.bind(this);
        this.getProfile = this.getProfile.bind(this);
    }
    // ============================================================
    //  Webhook
    // ============================================================
    async webhook(req, res) {
        try {
            console.log('═══════════════════════════════════════════════════');
            console.log(`📩 LINE Webhook received at: ${new Date().toISOString()}`);
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));
            console.log('═══════════════════════════════════════════════════');

            const events = req.body.events || [];
            console.log(`📊 จำนวน Events: ${events.length}`);

            // ✅ ตอบกลับทันที
            res.json({ success: true });

            // ✅ ประมวลผลทีละ Event
            for (const event of events) {
                try {
                    await this.handleEvent(event);
                } catch (error) {
                    console.error('❌ Error handling event:', error.message);
                    console.error('Stack:', error.stack);
                }
            }
        } catch (error) {
            console.error('❌ Webhook error:', error);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    }

    // ============================================================
    //  handleEvent
    // ============================================================
    async handleEvent(event) {
        console.log('🔥 handleEvent called:', event.type);
        console.log(`👤 User ID: ${event.source?.userId}`);

        const userId = event.source?.userId;
        const replyToken = event.replyToken;

        // ✅ Follow
        if (event.type === 'follow') {
            console.log(`👋 มีผู้ใช้แอด Bot: ${userId}`);
            
            await this.replyMessage(replyToken,
                'สวัสดีครับ! 🙏\n\n' +
                'ยินดีต้อนรับสู่ระบบแจ้งเตือนฝึกประสบการณ์\n\n' +
                '📝 กรุณาพิมพ์ "รหัสนักศึกษา" ของคุณเพื่อลงทะเบียน\n' +
                'ตัวอย่าง: 6412345678'
            );
            return;
        }

        // ✅ Message
        if (event.type === 'message' && event.message?.type === 'text') {
            const text = event.message.text.trim();
            console.log(`💬 ข้อความจาก ${userId}: ${text}`);

            if (/^[0-9]{10,11}$/.test(text)) {
                const studentId = text;
                const sheetsService = require('../services/sheetsService');
                const rowIndex = await sheetsService.findRowByStudentId(studentId);

                if (!rowIndex) {
                    await this.replyMessage(replyToken,
                        `⚠️ ไม่พบรหัสนักศึกษา ${studentId} ในระบบ\n\n` +
                        `กรุณายื่นคำร้องก่อน`
                    );
                    return;
                }

                const profile = await this.getProfile(userId);
                const saved = await lineService.saveUser(studentId, userId, profile.displayName || '');

                if (saved) {
                    await this.replyMessage(replyToken,
                        `✅ ลงทะเบียนสำเร็จ!\n\n` +
                        `🆔 รหัส: ${studentId}\n` +
                        `👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}`
                    );
                } else {
                    await this.replyMessage(replyToken,
                        `⚠️ ไม่สามารถบันทึกข้อมูลได้ กรุณาติดต่อ Admin`
                    );
                }
            } else {
                await this.replyMessage(replyToken,
                    '⚠️ กรุณาพิมพ์รหัสนักศึกษา 10 หรือ 11 หลัก\n' +
                    'ตัวอย่าง: 6412345678'
                );
            }
            return;
        }

        if (event.type === 'unfollow') {
            console.log(`👋 ผู้ใช้บล็อก Bot: ${userId}`);
        }
    }

    // ============================================================
    //  replyMessage
    // ============================================================
    async replyMessage(replyToken, message) {
        if (!replyToken) return { success: false };

        const data = JSON.stringify({
            replyToken: replyToken,
            messages: [{ type: 'text', text: message }]
        });

        const options = {
            hostname: 'api.line.me',
            port: 443,
            path: '/v2/bot/message/reply',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${lineService.LINE_TOKEN}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    console.log(`✅ Reply sent: ${res.statusCode}`);
                    resolve({ success: res.statusCode === 200 });
                });
            });
            req.on('error', (error) => {
                console.error('❌ Reply error:', error.message);
                resolve({ success: false });
            });
            req.write(data);
            req.end();
        });
    }

    // ============================================================
    //  getProfile
    // ============================================================
    async getProfile(userId) {
        const options = {
            hostname: 'api.line.me',
            port: 443,
            path: `/v2/bot/profile/${userId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${lineService.LINE_TOKEN}`
            }
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        resolve({});
                    }
                });
            });
            req.on('error', () => resolve({}));
            req.end();
        });
    }
}

module.exports = new LineController();
