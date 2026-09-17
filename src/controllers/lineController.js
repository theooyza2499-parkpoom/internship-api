const lineService = require('../services/lineService');
const https = require('https');

class LineController {
    // ============================================================
    //  Webhook สำหรับรับ Event จาก LINE
    // ============================================================
    async webhook(req, res) {
        try {
            console.log('═══════════════════════════════════════════════════');
            console.log('📩 LINE Webhook received at:', new Date().toISOString());
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));
            console.log('═══════════════════════════════════════════════════');

            const events = req.body.events || [];
            console.log(`📊 จำนวน Events: ${events.length}`);

            // ✅ ตอบกลับ LINE ทันที (200 OK)
            res.status(200).json({ success: true });

            // ✅ ประมวลผล Events ทีละอัน (แบบ Background)
            for (const event of events) {
                try {
                    await this.handleEvent(event);
                } catch (err) {
                    console.error('❌ Error handling event:', err.message);
                }
            }

        } catch (error) {
            console.error('❌ Webhook error:', error);
            // ถ้ายังไม่ตอบกลับ
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    }

    // ============================================================
    //  ประมวลผล Event แต่ละประเภท
    // ============================================================
    async handleEvent(event) {
        console.log(`📩 Event type: ${event.type}`);

        // ✅ เมื่อมีคนแอด Bot
        if (event.type === 'follow') {
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            console.log(`👤 มีผู้ใช้แอด Bot: ${userId}`);

            await this.replyMessage(replyToken, 
                'สวัสดีครับ! 🙏\n\n' +
                '🤖 ผมคือบอทแจ้งเตือนระบบฝึกประสบการณ์\n\n' +
                '📝 กรุณาพิมพ์รหัสนักศึกษาของคุณเพื่อลงทะเบียนรับการแจ้งเตือน\n\n' +
                'ตัวอย่าง: 6412345678'
            );
        }

        // ✅ เมื่อมีคนส่งข้อความ
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const text = event.message.text.trim();
            const replyToken = event.replyToken;

            console.log(`💬 ข้อความจาก ${userId}: ${text}`);

            // ถ้าเป็นตัวเลข 10-11 หลัก = รหัสนักศึกษา
            if (/^[0-9]{10,11}$/.test(text)) {
                const studentId = text;
                const profile = await this.getProfile(userId);
                
                // ✅ บันทึก User ID
                lineService.saveUser(studentId, userId, profile.displayName || '');
                
                await this.replyMessage(replyToken,
                    `✅ ลงทะเบียนสำเร็จ!\n\n` +
                    `🆔 รหัสนักศึกษา: ${studentId}\n` +
                    `👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}\n\n` +
                    `📢 คุณจะได้รับการแจ้งเตือนเมื่อเอกสารพร้อมดาวน์โหลด`
                );
            } else if (text === 'ทดสอบ' || text === 'test') {
                await this.replyMessage(replyToken,
                    `🧪 ทดสอบสำเร็จ!\n\n` +
                    `📅 ${new Date().toLocaleString('th-TH')}\n` +
                    `✅ บอททำงานปกติ`
                );
            } else {
                await this.replyMessage(replyToken,
                    '⚠️ กรุณาพิมพ์รหัสนักศึกษา 10 หรือ 11 หลัก\n\n' +
                    'ตัวอย่าง: 6412345678\n\n' +
                    'หรือพิมพ์ "ทดสอบ" เพื่อทดสอบระบบ'
                );
            }
        }

        // ✅ เมื่อมีคนบล็อก Bot
        if (event.type === 'unfollow') {
            console.log(`👤 ผู้ใช้บล็อก Bot: ${event.source.userId}`);
        }
    }

    // ============================================================
    //  ตอบกลับข้อความ (Reply)
    // ============================================================
    async replyMessage(replyToken, message) {
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
                    if (res.statusCode === 200) {
                        console.log(`✅ Reply sent: ${res.statusCode}`);
                        resolve({ success: true });
                    } else {
                        console.error(`❌ Reply failed: ${res.statusCode} - ${body}`);
                        resolve({ success: false, error: body });
                    }
                });
            });
            req.on('error', (error) => {
                console.error('❌ Reply request error:', error.message);
                resolve({ success: false, error: error.message });
            });
            req.write(data);
            req.end();
        });
    }

    // ============================================================
    //  ดึงข้อมูลโปรไฟล์ผู้ใช้
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
                        const profile = JSON.parse(body);
                        console.log(`👤 Profile: ${profile.displayName}`);
                        resolve(profile);
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
