const fs = require('fs');
const path = require('path');
const https = require('https');

// ✅ นำเข้า Sheets Service
let sheetsService;
try {
    sheetsService = require('./sheetsService');
} catch (error) {
    console.warn('⚠️ ไม่สามารถโหลด sheetsService:', error.message);
}

// ============================================================
//  ตรวจสอบว่าอยู่ใน Production หรือ Local
// ============================================================
const isProduction = process.env.NODE_ENV === 'production';

const CREDENTIALS_DIR = isProduction 
    ? '/etc/secrets' 
    : path.join(__dirname, '../../credentials');

console.log(`📁 LINE Credentials Dir: ${CREDENTIALS_DIR}`);

// ============================================================
//  ฟังก์ชันอ่านไฟล์
// ============================================================
function readFile(filename, defaultValue = '') {
    try {
        const filePath = path.join(CREDENTIALS_DIR, filename);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            console.log(`✅ อ่านไฟล์ ${filename} สำเร็จ (${content.length} ตัวอักษร)`);
            return content;
        } else {
            console.warn(`⚠️ ไม่พบไฟล์ ${filename} ที่ ${filePath}`);
        }
    } catch (error) {
        console.error(`❌ อ่านไฟล์ ${filename} ล้มเหลว:`, error.message);
    }
    return defaultValue;
}

// ============================================================
//  โหลด Credentials
// ============================================================
const LINE_TOKEN = readFile('token_line.txt');
const LINE_CHANNEL_ID = readFile('channelID_line.txt');
const ADMIN_USER_ID = readFile('userID_line.txt');

console.log(`📊 สรุป LINE Credentials:`);
console.log(`   - Token: ${LINE_TOKEN ? '✅' : '❌'}`);
console.log(`   - Channel ID: ${LINE_CHANNEL_ID ? '✅' : '❌'}`);
console.log(`   - Admin User ID: ${ADMIN_USER_ID ? '✅' : '❌'}`);

// ============================================================
//  Cache สำหรับ User ID (ลดการเรียก Sheets บ่อย)
// ============================================================
let userCache = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 1000; // 1 นาที

// ============================================================
//  ดึง User ID ของนักศึกษาจาก Google Sheets (คอลัมน์ AI)
// ============================================================
async function getUserByStudentId(studentId) {
    try {
        // ✅ ตรวจสอบ cache ก่อน
        const now = Date.now();
        if (userCache[studentId] && (now - cacheTimestamp) < CACHE_DURATION) {
            return userCache[studentId];
        }

        if (!sheetsService) {
            console.warn('⚠️ ไม่มี sheetsService');
            return null;
        }

        // ✅ ดึงข้อมูลจาก Google Sheets
        const rowIndex = await sheetsService.findRowByStudentId(studentId);
        if (!rowIndex) {
            console.warn(`⚠️ ไม่พบนักศึกษา ${studentId}`);
            return null;
        }

        // ✅ อ่านคอลัมน์ AI (User ID LINE)
        const data = await sheetsService.getSheetData(`คำร้องขอฝึกประสบการณ์!AI${rowIndex}`);
        const userId = data && data[0] ? data[0][0] : null;

        if (userId) {
            userCache[studentId] = userId;
            cacheTimestamp = now;
            console.log(`✅ พบ User ID สำหรับ ${studentId}: ${userId.substring(0, 10)}...`);
            return userId;
        } else {
            console.warn(`⚠️ ไม่มี User ID LINE สำหรับนักศึกษา ${studentId}`);
            return null;
        }
    } catch (error) {
        console.error(`❌ Error getting User ID for ${studentId}:`, error.message);
        return null;
    }
}

// ============================================================
//  บันทึก User ID ของนักศึกษาลง Google Sheets (คอลัมน์ AI)
// ============================================================
async function saveUser(studentId, userId, displayName = '') {
    try {
        if (!sheetsService) {
            console.warn('⚠️ ไม่มี sheetsService');
            return false;
        }

        const rowIndex = await sheetsService.findRowByStudentId(studentId);
        if (!rowIndex) {
            console.warn(`⚠️ ไม่พบนักศึกษา ${studentId} ใน Sheets`);
            return false;
        }

        // ✅ บันทึกลงคอลัมน์ AI (User ID LINE)
        await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AI', userId);
        
        // ✅ อัปเดต cache
        userCache[studentId] = userId;
        cacheTimestamp = Date.now();
        
        console.log(`💾 บันทึก User ID สำหรับ ${studentId}: ${userId.substring(0, 10)}...`);
        return true;
    } catch (error) {
        console.error('❌ บันทึก User ID ล้มเหลว:', error.message);
        return false;
    }
}

// ============================================================
//  ส่งข้อความผ่าน LINE Messaging API
// ============================================================
async function sendLineMessage(userId, message) {
    if (!LINE_TOKEN) {
        console.warn('⚠️ ไม่มี LINE Token');
        return { success: false, error: 'No LINE Token' };
    }
    
    if (!userId) {
        console.warn('⚠️ ไม่มี User ID');
        return { success: false, error: 'No User ID' };
    }

    const data = JSON.stringify({
        to: userId,
        messages: [{
            type: 'text',
            text: message
        }]
    });

    const options = {
        hostname: 'api.line.me',
        port: 443,
        path: '/v2/bot/message/push',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LINE_TOKEN}`,
            'Content-Length': Buffer.byteLength(data)
        }
    };

    return new Promise((resolve) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`✅ ส่ง LINE สำเร็จ (${userId.substring(0, 10)}...)`);
                    resolve({ success: true, statusCode: res.statusCode });
                } else {
                    console.error(`❌ ส่ง LINE ล้มเหลว: ${res.statusCode} - ${body}`);
                    resolve({ success: false, statusCode: res.statusCode, error: body });
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ LINE request error:', error.message);
            resolve({ success: false, error: error.message });
        });

        req.write(data);
        req.end();
    });
}

// ============================================================
//  แจ้งเตือน Admin (มีคำร้องใหม่)
// ============================================================
async function notifyAdminNewRequest(requestData) {
    if (!ADMIN_USER_ID) {
        console.warn('⚠️ ไม่มี Admin User ID');
        return { success: false, error: 'No Admin User ID' };
    }

    const message = `📢 มีคำร้องใหม่!\n\n` +
        `📋 เลขที่คำร้อง: ${requestData.requestNumber}\n` +
        `👤 นักศึกษา: ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
        `🆔 รหัส: ${requestData.studentId}\n` +
        `🏢 สถานที่: ${requestData.companyName}\n` +
        `📅 วันที่: ${new Date().toLocaleString('th-TH')}`;

    return await sendLineMessage(ADMIN_USER_ID, message);
}

// ============================================================
//  แจ้งเตือน Admin (นักศึกษาอัปโหลดเอกสารตอบกลับ)
// ============================================================
async function notifyAdminStudentUpload(requestData) {
    if (!ADMIN_USER_ID) {
        console.warn('⚠️ ไม่มี Admin User ID');
        return { success: false, error: 'No Admin User ID' };
    }

    const message = `📩 นักศึกษาอัปโหลดเอกสารตอบกลับ\n\n` +
        `📋 เลขที่คำร้อง: ${requestData.requestNumber}\n` +
        `👤 นักศึกษา: ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
        `🆔 รหัส: ${requestData.studentId}\n` +
        `🏢 สถานที่: ${requestData.companyName}\n` +
        `📅 วันที่: ${new Date().toLocaleString('th-TH')}`;

    return await sendLineMessage(ADMIN_USER_ID, message);
}

// ============================================================
//  แจ้งเตือนนักศึกษา (เอกสารพร้อมดาวน์โหลด)
// ============================================================
async function notifyStudentReady(studentId, studentName, requestNumber, docType) {
    console.log(`📤 กำลังแจ้งเตือนนักศึกษา ${studentId}...`);
    
    const userId = await getUserByStudentId(studentId);
    
    if (!userId) {
        console.warn(`⚠️ ไม่พบ User ID LINE สำหรับนักศึกษา ${studentId}`);
        return { success: false, error: 'No User ID for student' };
    }

    const docName = docType === 'response' ? 'หนังสือขอความอนุเคราะห์' : 'หนังสือส่งตัว';
    const message = `📄 เอกสารพร้อมให้ดาวน์โหลด\n\n` +
        `📋 เลขที่คำร้อง: ${requestNumber}\n` +
        `👤 นักศึกษา: ${studentName}\n` +
        `📄 เอกสาร: ${docName}\n` +
        `📅 วันที่: ${new Date().toLocaleString('th-TH')}\n\n` +
        `📥 กรุณาดาวน์โหลดที่ระบบ`;

    return await sendLineMessage(userId, message);
}

module.exports = {
    LINE_TOKEN,
    LINE_CHANNEL_ID,
    ADMIN_USER_ID,
    getUserByStudentId,
    saveUser,
    sendLineMessage,
    notifyAdminNewRequest,
    notifyAdminStudentUpload,
    notifyStudentReady
};
