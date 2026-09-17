const lineService = require('../services/lineService');
const https = require('https');

class LineController {
    // ============================================================
    //  Webhook สำหรับรับ Event จาก LINE
    // ============================================================
    async webhook(req, res) {
        try {
            console.log('═══════════════════════════════════════════════════');
            console.log(`📩 LINE Webhook received at: ${new Date().toISOString()}`);
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));
            console.log('═══════════════════════════════════════════════════');

            const events = req.body.events || [];
            console.log(`📊 จำนวน Events: ${events.length}`);

            // ✅ ตอบกลับทันที (LINE ต้องการ response เร็ว)
            res.json({ success: true });

            // ✅ ประมวลผล Event แบบ Background
            for (const event of events) {
                try {
                    await this.handleEvent(event);
                } catch (error) {
                    console.error('❌ Error handling event:', error.message);
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
    //  ประมวลผล Event แต่ละประเภท
    // ============================================================
    async handleEvent(event) {
        console.log(`📌 Event type: ${event.type}`);
        console.log(`👤 User ID: ${event.source?.userId}`);

        const userId = event.source?.userId;
        const replyToken = event.replyToken;

        // ✅ เมื่อมีคนแอด Bot
        if (event.type === 'follow') {
            console.log(`👋 มีผู้ใช้แอด Bot: ${userId}`);
            
            await this.replyMessage(replyToken,
                'สวัสดีครับ! 🙏\n\n' +
                'ยินดีต้อนรับสู่ระบบแจ้งเตือนฝึกประสบการณ์\n\n' +
                '📝 กรุณาพิมพ์ "รหัสนักศึกษา" ของคุณเพื่อลงทะเบียน\n' +
                'ตัวอย่าง: 6412345678\n\n' +
                '📢 เมื่อลงทะเบียนแล้ว คุณจะได้รับการแจ้งเตือนเมื่อเอกสารพร้อม'
            );
            return;
        }

        // ✅ เมื่อมีคนส่งข้อความ
        if (event.type === 'message' && event.message?.type === 'text') {
            const text = event.message.text.trim();
            console.log(`💬 ข้อความจาก ${userId}: ${text}`);

            // ถ้าเป็นตัวเลข 10-11 หลัก = รหัสนักศึกษา
            if (/^[0-9]{10,11}$/.test(text)) {
                const studentId = text;

                // ✅ ตรวจสอบว่ามีนักศึกษานี้ในระบบหรือไม่
                const sheetsService = require('../services/sheetsService');
                const rowIndex = await sheetsService.findRowByStudentId(studentId);

                if (!rowIndex) {
                    await this.replyMessage(replyToken,
                        `⚠️ ไม่พบรหัสนักศึกษา ${studentId} ในระบบ\n\n` +
                        `กรุณายื่นคำร้องก่อน แล้วค่อยกลับมาลงทะเบียน`
                    );
                    return;
                }

                // ✅ ดึงข้อมูลโปรไฟล์
                const profile = await this.getProfile(userId);

                // ✅ บันทึก User ID ลง Google Sheets (คอลัมน์ AI)
                const saved = await lineService.saveUser(studentId, userId, profile.displayName || '');

                if (saved) {
                    await this.replyMessage(replyToken,
                        `✅ ลงทะเบียนสำเร็จ!\n\n` +
                        `🆔 รหัสนักศึกษา: ${studentId}\n` +
                        `👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}\n\n` +
                        `📢 คุณจะได้รับการแจ้งเตือนเมื่อเอกสารพร้อมดาวน์โหลด`
                    );
                } else {
                    await this.replyMessage(replyToken,
                        `⚠️ ไม่สามารถบันทึกข้อมูลได้\n\n` +
                        `กรุณาติดต่อ Admin`
                    );
                }
            } else {
                await this.replyMessage(replyToken,
                    '⚠️ กรุณาพิมพ์รหัสนักศึกษา 10 หรือ 11 หลัก\n\n' +
                    'ตัวอย่าง: 6412345678'
                );
            }
            return;
        }

        // ✅ Event อื่นๆ
        if (event.type === 'unfollow') {
            console.log(`👋 ผู้ใช้บล็อก Bot: ${userId}`);
            return;
        }

        if (event.type === 'join') {
            console.log(`➕ Bot เข้ากลุ่ม: ${event.source?.groupId}`);
            return;
        }

        if (event.type === 'leave') {
            console.log(`➖ Bot ออกจากกลุ่ม: ${event.source?.groupId}`);
            return;
        }

        console.log(`ℹ️ ไม่ได้จัดการ Event type: ${event.type}`);
    }

    // ============================================================
    //  ตอบกลับข้อความ (Reply)
    // ============================================================
    async replyMessage(replyToken, message) {
        if (!replyToken) {
            console.warn('⚠️ ไม่มี replyToken');
            return { success: false };
        }

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
