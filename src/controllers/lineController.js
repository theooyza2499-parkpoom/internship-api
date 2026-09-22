const lineService = require('../services/lineService');
const https = require('https');

console.log('🔥 lineController.js version: 2026-09-17-v4-multiAdmin');

class LineController {
    async webhook(req, res) {
        try {
            const events = req.body.events || [];
            console.log(`📩 Webhook: ${events.length} event(s)`);

            res.json({ success: true });

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

    async handleEvent(event) {
    const userId = event.source?.userId;
    const replyToken = event.replyToken;

    console.log(`🔥 handleEvent: ${event.type} | user: ${userId?.substring(0, 10)}...`);

    // ============================================================
    //  Follow
    // ============================================================
    if (event.type === 'follow') {
        await this.replyMessage(replyToken,
            'สวัสดีครับ! 🙏\n\n' +
            'ยินดีต้อนรับสู่ระบบแจ้งเตือนฝึกประสบการณ์\n\n' +
            '📝 นักศึกษา: พิมพ์รหัสนักศึกษา 10-11 หลัก\n' +
            '👑 Admin: พิมพ์ "ขอ user id" เพื่อดู ID ของคุณ'
        );
        return;
    }

    // ============================================================
    //  Message
    // ============================================================
    if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text.trim();

        // ⭐ คำสั่ง "ขอ user id"
        if (/^(ขอ\s*user\s*id|ขอ\s*userid|user\s*id|userid|myid|my\s*id|id)$/i.test(text)) {
            await this.replyMessage(replyToken,
                `🆔 User ID ของคุณคือ:\n\n${userId}\n\n` +
                `📋 คัดลอก ID นี้ส่งให้ Admin หลัก เพื่อขอเป็น Admin`
            );
            return;
        }

        // ⭐ ตรวจสอบว่าเป็น Admin หลักหรือไม่
        const isMainAdmin = userId === lineService.ADMIN_USER_ID;

        // ---- เพิ่ม Admin ----
        // รูปแบบ: เพิ่มแอดมิน Uxxxxx [ชื่อ]
        const addMatch = text.match(/^เพิ่มแอดมิน\s+(U[a-f0-9]+)(?:\s+(.+))?$/i);
        if (addMatch) {
            if (!isMainAdmin) {
                await this.replyMessage(replyToken, '⚠️ เฉพาะ Admin หลักเท่านั้นที่เพิ่มได้');
                return;
            }
            
            const newAdminId = addMatch[1];
            const name = (addMatch[2] || '').trim();
            
            // ✅ เรียก addAdmin พร้อมส่ง addedBy
            const result = await lineService.addAdmin(newAdminId, name, userId);
            
            if (result.success) {
                await this.replyMessage(replyToken,
                    `✅ เพิ่ม Admin สำเร็จ!\n\n` +
                    `🆔 ${result.data.userId}\n` +
                    `👤 ${result.data.name}\n` +
                    `📅 ${result.data.addedAt}\n` +
                    `👑 โดย: ${result.data.addedBy}`
                );
            } else {
                await this.replyMessage(replyToken, `❌ ${result.error}`);
            }
            return;
        }

        // ---- ลบ Admin ----
        // รูปแบบ: ลบแอดมิน Uxxxxx
        const removeMatch = text.match(/^ลบแอดมิน\s+(U[a-f0-9]+)$/i);
        if (removeMatch) {
            if (!isMainAdmin) {
                await this.replyMessage(replyToken, '⚠️ เฉพาะ Admin หลักเท่านั้นที่ลบได้');
                return;
            }
            
            const targetId = removeMatch[1];
            const result = await lineService.removeAdmin(targetId);
            
            if (result.success) {
                await this.replyMessage(replyToken,
                    `✅ ลบ Admin สำเร็จ!\n\n` +
                    `🆔 ${result.data.userId.substring(0, 15)}...\n` +
                    `👤 ${result.data.name}`
                );
            } else {
                await this.replyMessage(replyToken, `❌ ${result.error}`);
            }
            return;
        }

        // ---- ดูรายชื่อ Admin ----
        if (/^(ดูแอดมิน|รายชื่อแอดมิน|list\s*admins?)$/i.test(text)) {
            if (!isMainAdmin) {
                await this.replyMessage(replyToken, '⚠️ เฉพาะ Admin หลักเท่านั้น');
                return;
            }
            
            const admins = await lineService.listAdmins();
            
            let msg = `👥 รายชื่อ Admin ทั้งหมด (${admins.length} คน)\n\n`;
            admins.forEach((a, i) => {
                const badge = a.isMain ? '👑' : '👤';
                const shortId = a.userId.substring(0, 8) + '...' + a.userId.substring(a.userId.length - 6);
                msg += `${i + 1}. ${badge} ${a.name}\n`;
                msg += `   🆔 ${shortId}\n`;
                if (!a.isMain && a.addedAt !== '-') {
                    msg += `   📅 ${a.addedAt}\n`;
                }
                msg += '\n';
            });
            msg += `\n💡 คำสั่ง:\n`;
            msg += `• เพิ่มแอดมิน Uxxxxx ชื่อ\n`;
            msg += `• ลบแอดมิน Uxxxxx`;
            
            await this.replyMessage(replyToken, msg);
            return;
        }

        // ---- Help ----
        if (/^(help|ช่วย|คำสั่ง)$/i.test(text)) {
            const helpMsg = 
                `📖 คำสั่งที่ใช้ได้:\n\n` +
                `👤 สำหรับทุกคน:\n` +
                `• ขอ user id — ดู ID ของตัวเอง\n` +
                `• [รหัสนักศึกษา] — ลงทะเบียน\n\n` +
                `👑 สำหรับ Admin หลัก:\n` +
                `• เพิ่มแอดมิน Uxxxxx ชื่อ\n` +
                `• ลบแอดมิน Uxxxxx\n` +
                `• ดูแอดมิน — ดูรายชื่อ\n`;
            
            await this.replyMessage(replyToken, helpMsg);
            return;
        }

        // ---- ลงทะเบียนนักศึกษา ----
        if (/^[0-9]{10,11}$/.test(text)) {
            const isUserAdmin = await lineService.isAdmin(userId);
            if (isUserAdmin) {
                await this.replyMessage(replyToken,
                    `ℹ️ คุณคือ Admin — ไม่ต้องลงทะเบียน\n\n` +
                    `หากต้องการทดสอบ ให้ใช้ LINE บัญชีอื่น`
                );
                return;
            }

            const studentId = text;
            const sheetsService = require('../services/sheetsService');
            const rowIndex = await sheetsService.findRowByStudentId(studentId);

            if (!rowIndex) {
                await this.replyMessage(replyToken,
                    `⚠️ ไม่พบรหัส ${studentId} ในระบบ\nกรุณายื่นคำร้องก่อน`
                );
                return;
            }

            const profile = await this.getProfile(userId);
            const saved = await lineService.saveUser(studentId, userId, profile.displayName || '');

            if (saved) {
                await this.replyMessage(replyToken,
                    `✅ ลงทะเบียนสำเร็จ!\n\n🆔 ${studentId}\n👤 ${profile.displayName || 'ไม่ระบุ'}`
                );

                const displayName = profile.displayName || 'ไม่ระบุ';
                const notificationMsg = 
                    `🔔 นักศึกษาลงทะเบียน LINE ใหม่\n\n` +
                    `🆔 ${studentId}\n👤 ${displayName}\n` +
                    `📅 ${new Date().toLocaleString('th-TH')}`;
                
                const results = await lineService.notifyAllAdmins(notificationMsg);
                console.log(`📤 แจ้ง Admin ${results.length} คน`);
            } else {
                await this.replyMessage(replyToken, `⚠️ บันทึกไม่ได้ กรุณาติดต่อ Admin`);
            }
            return;
        }

        // ---- คำสั่งอื่นๆ ----
        await this.replyMessage(replyToken,
            '📝 พิมพ์รหัสนักศึกษา 10-11 หลักเพื่อลงทะเบียน\n' +
            '👑 Admin: พิมพ์ "ช่วย" เพื่อดูคำสั่งทั้งหมด'
        );
        return;
    }

    if (event.type === 'unfollow') {
        console.log(`👋 Unfollow: ${userId?.substring(0, 10)}...`);
    }
}

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
                    if (res.statusCode === 200) {
                        console.log(`✅ Reply sent`);
                    } else {
                        console.error(`❌ Reply failed: ${res.statusCode} - ${body}`);
                    }
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

    async getProfile(userId) {
        const options = {
            hostname: 'api.line.me',
            port: 443,
            path: `/v2/bot/profile/${userId}`,
            method: 'GET',
            headers: { 'Authorization': `Bearer ${lineService.LINE_TOKEN}` }
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); }
                    catch { resolve({}); }
                });
            });
            req.on('error', () => resolve({}));
            req.end();
        });
    }
}

module.exports = new LineController();
