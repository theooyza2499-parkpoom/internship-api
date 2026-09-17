const lineService = require('../services/lineService');
const https = require('https');

class LineController {
    // ============================================================
    //  Webhook สำหรับรับ Event จาก LINE
    // ============================================================
    async webhook(req, res) {
    console.log('📩 Webhook received');
    
    // ✅ ตอบกลับทันที 200 OK (ก่อนประมวลผล)
    res.status(200).json({ success: true });
    
    // ✅ ประมวลผลทีหลัง (Background)
    try {
        const events = req.body.events || [];
        
        for (const event of events) {
            await this.handleEvent(event);
        }
    } catch (error) {
        console.error('❌ Webhook process error:', error);
    }
}

async handleEvent(event) {
    console.log('📩 Event type:', event.type);
    console.log('👤 User ID:', event.source?.userId);
    
    if (event.type === 'follow') {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        await this.replyMessage(replyToken, 
            'สวัสดีครับ! 🙏\n\nกรุณาพิมพ์รหัสนักศึกษาเพื่อลงทะเบียน\n\nตัวอย่าง: 6412345678'
        );
    }
    
    if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const text = event.message.text.trim();
        const replyToken = event.replyToken;
        
        if (/^[0-9]{10,11}$/.test(text)) {
            const profile = await this.getProfile(userId);
            const lineService = require('../services/lineService');
            lineService.saveUser(text, userId, profile.displayName || '');
            
            await this.replyMessage(replyToken,
                `✅ ลงทะเบียนสำเร็จ!\n\n🆔 รหัส: ${text}\n👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}`
            );
        } else {
            await this.replyMessage(replyToken,
                '⚠️ กรุณาพิมพ์รหัสนักศึกษา 10 หรือ 11 หลัก'
            );
        }
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
                    console.log(`✅ Reply sent: ${res.statusCode}`);
                    resolve({ success: true });
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
