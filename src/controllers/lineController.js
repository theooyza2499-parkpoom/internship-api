const lineService = require('../services/lineService');
const sheetsService = require('../services/sheetsService');
const https = require('https');

class LineController {
    // ============================================================
    //  Webhook สำหรับรับ Event จาก LINE
    // ============================================================
    async webhook(req, res) {
        try {
            console.log('\n═══════════════════════════════════════════════════');
            console.log('📩 LINE Webhook received at:', new Date().toISOString());
            console.log('📦 Body:', JSON.stringify(req.body, null, 2));
            console.log('═══════════════════════════════════════════════════\n');

            const events = req.body.events || [];
            console.log(`📊 จำนวน Events: ${events.length}`);

            if (events.length === 0) {
                console.log('⚠️ ไม่มี Events ใน Request');
                return res.json({ success: true, message: 'No events' });
            }

            // ✅ ตอบกลับทันที (LINE ต้องการ response ภายใน 1 วินาที)
            res.json({ success: true });

            // ✅ ประมวลผล Event หลังจากตอบกลับแล้ว
            for (const event of events) {
                try {
                    await this.handleEvent(event);
                } catch (error) {
                    console.error('❌ Error handling event:', error);
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
        console.log(`\n🔔 Event Type: ${event.type}`);
        console.log(`📌 Event Data:`, JSON.stringify(event, null, 2));

        // ✅ Event: ผู้ใช้แอด Bot
        if (event.type === 'follow') {
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            console.log(`👋 มีคนแอด Bot: ${userId}`);

            // ตอบกลับขอรหัสนักศึกษา
            await this.replyMessage(replyToken,
                '🎓 สวัสดีครับ! ยินดีต้อนรับ\n\n' +
                '📋 กรุณาพิมพ์ "รหัสนักศึกษา" ของคุณเพื่อลงทะเบียน\n' +
                'ตัวอย่าง: 6412345678\n\n' +
                '💡 เมื่อลงทะเบียนแล้ว คุณจะได้รับการแจ้งเตือนเมื่อเอกสารพร้อม'
            );
            return;
        }

        // ✅ Event: ผู้ใช้ส่งข้อความ
        if (event.type === 'message' && event.message.type === 'text') {
            const userId = event.source.userId;
            const text = event.message.text.trim();
            const replyToken = event.replyToken;

            console.log(`💬 ข้อความจาก ${userId}: "${text}"`);

            // ถ้าเป็นตัวเลข 10-11 หลัก = รหัสนักศึกษา
            if (/^[0-9]{10,11}$/.test(text)) {
                const studentId = text;
                console.log(`🎓 ลงทะเบียนนักศึกษา: ${studentId}`);

                // ✅ ตรวจสอบว่ามีนักศึกษาคนนี้ในระบบหรือไม่
                try {
                    const studentData = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
                    const student = studentData.find(row => row['รหัสนักศึกษา'] === studentId);

                    if (!student) {
                        console.log(`⚠️ ไม่พบนักศึกษา ${studentId} ในระบบ`);
                        await this.replyMessage(replyToken,
                            `⚠️ ไม่พบรหัสนักศึกษา ${studentId} ในระบบ\n\n` +
                            `💡 กรุณาตรวจสอบรหัสอีกครั้ง หรือยื่นคำร้องก่อน`
                        );
                        return;
                    }

                    // ✅ ดึงโปรไฟล์จาก LINE
                    const profile = await this.getProfile(userId);
                    console.log(`👤 Profile:`, profile);

                    // ✅ บันทึก User ID ลง Google Sheets (คอลัมน์ AI)
                    const saved = await this.saveUserIdToSheet(studentId, userId);
                    console.log(`💾 บันทึก User ID: ${saved ? 'สำเร็จ' : 'ล้มเหลว'}`);

                    // ✅ บันทึกใน memory ด้วย (เป็น fallback)
                    lineService.saveUser(studentId, userId, profile.displayName || '');

                    await this.replyMessage(replyToken,
                        `✅ ลงทะเบียนสำเร็จ!\n\n` +
                        `🆔 รหัสนักศึกษา: ${studentId}\n` +
                        `👤 ชื่อ: ${profile.displayName || 'ไม่ระบุ'}\n\n` +
                        `📢 คุณจะได้รับการแจ้งเตือนเมื่อ:\n` +
                        `• หนังสือขอความอนุเคราะห์พร้อมให้ดาวน์โหลด\n` +
                        `• หนังสือส่งตัวพร้อมให้ดาวน์โหลด`
                    );

                } catch (error) {
                    console.error('❌ Error registering student:', error);
                    await this.replyMessage(replyToken,
                        `❌ เกิดข้อผิดพลาดในการลงทะเบียน\nกรุณาลองใหม่ภายหลัง`
                    );
                }
                return;
            }

            // ถ้าเป็นข้อความอื่น
            console.log(`💬 ข้อความทั่วไป: ${text}`);
            await this.replyMessage(replyToken,
                '📋 กรุณาพิมพ์ "รหัสนักศึกษา" 10 หรือ 11 หลัก\n' +
                'เพื่อลงทะเบียนรับการแจ้งเตือน\n\n' +
                'ตัวอย่าง: 6412345678'
            );
            return;
        }

        // Event อื่นๆ
        console.log(`ℹ️ Event ที่ไม่ต้องประมวลผล: ${event.type}`);
    }

    // ============================================================
    //  บันทึก User ID ลง Google Sheets (คอลัมน์ AI)
    // ============================================================
    async saveUserIdToSheet(studentId, userId) {
        try {
            // ดึงข้อมูลทั้งหมดเพื่อหาแถว
            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AI');
            
            let rowIndex = null;
            for (let i = 0; i < data.length; i++) {
                // คอลัมน์ B (index 1) = รหัสนักศึกษา
                if (data[i][1] === studentId) {
                    rowIndex = i + 1; // Sheets เริ่มที่ 1
                    break;
                }
            }

            if (!rowIndex) {
                console.log(`⚠️ ไม่พบแถวของนักศึกษา ${studentId}`);
                return false;
            }

            // ✅ อัปเดตคอลัมน์ AI (คอลัมน์ที่ 35)
            // A=1, B=2, ..., Z=26, AA=27, AB=28, AC=29, AD=30, AE=31, AF=32, AG=33, AH=34, AI=35
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AI', userId);
            
            console.log(`✅ บันทึก User ID ${userId} ลงแถว ${rowIndex} คอลัมน์ AI`);
            return true;
        } catch (error) {
            console.error('❌ Error saving user ID to sheet:', error);
            return false;
        }
    }

    // ============================================================
    //  ตอบกลับข้อความ (Reply)
    // ============================================================
    async replyMessage(replyToken, message) {
        console.log(`📤 กำลัง Reply:`);
        console.log(`   Token: ${replyToken.substring(0, 20)}...`);
        console.log(`   Message: ${message.substring(0, 50)}...`);

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
                        console.log(`✅ Reply sent สำเร็จ (${res.statusCode})`);
                    } else {
                        console.error(`❌ Reply failed (${res.statusCode}): ${body}`);
                    }
                    resolve({ success: res.statusCode === 200, statusCode: res.statusCode });
                });
            });
            req.on('error', (error) => {
                console.error('❌ Reply error:', error.message);
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
        console.log(`👤 กำลังดึงโปรไฟล์: ${userId}`);
        
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
                        console.log(`✅ Profile:`, profile);
                        resolve(profile);
                    } catch {
                        console.error('❌ Parse profile error');
                        resolve({});
                    }
                });
            });
            req.on('error', (error) => {
                console.error('❌ Get profile error:', error.message);
                resolve({});
            });
            req.end();
        });
    }
}

module.exports = new LineController();
