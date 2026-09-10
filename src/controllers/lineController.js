const lineService = require('../services/lineService');

class LineController {
    // ============================================================
    //  Webhook สำหรับรับ Event จาก LINE
    // ============================================================
    async webhook(req, res) {
        try {
            const events = req.body.events || [];
            
            for (const event of events) {
                console.log('📩 LINE Event:', JSON.stringify(event, null, 2));

                // ✅ เมื่อมีคนแอด Bot
                if (event.type === 'follow') {
                    const userId = event.source.userId;
                    const replyToken = event.replyToken;

                    // ตอบกลับขอรหัสนักศึกษา
                    await this.replyMessage(replyToken, 
                        'สวัสดีครับ! 🙏\n\n' +
                        'กรุณาพิมพ์รหัสนักศึกษาของคุณเพื่อลงทะเบียนรับการแจ้งเตือน\n\n' +
                        'ตัวอย่าง: 6412345678'
                    );
                }

                // ✅ เมื่อมีคนส่งข้อความ
                if (event.type === 'message' && event.message.type === 'text') {
                    const userId = event.source.userId;
                    const text = event.message.text.trim();
                    const replyToken = event.replyToken;

                    // ถ้าเป็นตัวเลข 10-11 หลัก = รหัสนักศึกษา
                    if (/^[0-9]{10,11}$/.test(text)) {
                        const studentId = text;
                        
                        // ดึงข้อมูลโปรไฟล์
                        const profile = await this.getProfile(userId);
                        
                        // บันทึก User ID
                        lineService.saveUser(studentId, userId, profile.displayName || '');
                        
                        await this.replyMessage(replyToken,
                            `✅ ลงทะเบียนสำเร็จ!\n\n` +
                            `🆔 รหัสนักศึกษา: ${studentId}\n` +
                            `👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}\n\n` +
                            `📢 คุณจะได้รับการแจ้งเตือนเมื่อเอกสารพร้อมดาวน์โหลด`
                        );
                    } else {
                        await this.replyMessage(replyToken,
                            '⚠️ กรุณาพิมพ์รหัสนักศึกษา 10 หรือ 11 หลัก\n\n' +
                            'ตัวอย่าง: 6412345678'
                        );
                    }
                }
            }

            res.json({ success: true });
        } catch (error) {
            console.error('❌ Webhook error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ============================================================
    //  ตอบกลับข้อความ (Reply)
    // ============================================================
    async replyMessage(replyToken, message) {
        const https = require('https');
        const data = JSON.stringify({
            replyToken: replyToken,
            messages: [{
                type: 'text',
                text: message
            }]
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
                    resolve({ success: true });
                });
            });
            req.on('error', (error) => {
                console.error('❌ Reply error:', error);
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
        const https = require('https');
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
