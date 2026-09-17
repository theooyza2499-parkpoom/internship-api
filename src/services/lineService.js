const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
//  ตรวจสอบ Environment
// ============================================================
const isProduction = process.env.NODE_ENV === 'production';
const CREDENTIALS_DIR = isProduction ? '/etc/secrets' : path.join(__dirname, '../../credentials');

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
        }
        console.warn(`⚠️ ไม่พบไฟล์ ${filename}`);
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

// ✅ เก็บ User ID ใน memory (เป็น cache)
let usersData = {};

console.log(`📊 สรุป LINE Credentials:`);
console.log(`   - Token: ${LINE_TOKEN ? '✅' : '❌'}`);
console.log(`   - Channel ID: ${LINE_CHANNEL_ID ? '✅' : '❌'}`);
console.log(`   - Admin User ID: ${ADMIN_USER_ID ? '✅' : '❌'}`);

// ============================================================
//  บันทึก User ID (memory)
// ============================================================
function saveUser(studentId, userId, displayName = '') {
    usersData[studentId] = {
        userId: userId,
        displayName: displayName,
        updatedAt: new Date().toISOString()
    };
    console.log(`💾 บันทึก User ID (memory) สำหรับ ${studentId}: ${userId}`);
    return true;
}

// ============================================================
//  ดึง User ID (memory)
// ============================================================
function getUserByStudentId(studentId) {
    if (usersData[studentId]) {
        return usersData[studentId].userId;
    }
    return null;
}

// ============================================================
//  ดึง User ID จาก Google Sheets (ถาวร)
// ============================================================
async function getUserIdFromSheet(studentId) {
    try {
        const sheetsService = require('./sheetsService');
        const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AI');
        
        for (let i = 0; i < data.length; i++) {
            // คอลัมน์ B (index 1) = รหัสนักศึกษา
            // คอลัมน์ AI (index 34) = User ID LINE
            if (data[i][1] === studentId) {
                const userId = data[i][34]; // AI = index 34
                if (userId && userId.trim() !== '') {
                    console.log(`✅ พบ User ID จาก Sheets: ${userId}`);
                    // ✅ cache ไว้ใน memory
                    usersData[studentId] = { userId, displayName: '', updatedAt: new Date().toISOString() };
                    return userId.trim();
                }
                break;
            }
        }
        console.log(`⚠️ ไม่พบ User ID สำหรับ ${studentId} ใน Sheets`);
        return null;
    } catch (error) {
        console.error('❌ Error getting user ID from sheet:', error.message);
        return null;
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

    console.log(`📤 กำลังส่ง LINE ไปที่: ${userId}`);
    console.log(`📝 ข้อความ: ${message.substring(0, 80)}...`);

    const data = JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }]
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
                    console.log(`✅ ส่ง LINE สำเร็จ (${userId})`);
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
        `📅 ${new Date().toLocaleString('th-TH')}`;

    console.log(`🔔 กำลังแจ้งเตือน Admin: ${message.substring(0, 50)}...`);
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
        `📅 ${new Date().toLocaleString('th-TH')}`;

    console.log(`🔔 กำลังแจ้งเตือน Admin: ${message.substring(0, 50)}...`);
    return await sendLineMessage(ADMIN_USER_ID, message);
}

// ============================================================
//  แจ้งเตือนนักศึกษา (เอกสารพร้อมดาวน์โหลด)
// ============================================================
async function notifyStudentReady(studentId, studentName, requestNumber, docType) {
    console.log(`\n🔔 กำลังแจ้งเตือนนักศึกษา ${studentId}`);
    
    // ✅ ลองดึงจาก memory ก่อน
    let userId = getUserByStudentId(studentId);
    
    // ✅ ถ้าไม่มี ให้ดึงจาก Google Sheets
    if (!userId) {
        console.log('⚠️ ไม่พบใน memory กำลังดึงจาก Google Sheets...');
        userId = await getUserIdFromSheet(studentId);
    }
    
    if (!userId) {
        console.warn(`⚠️ ไม่พบ User ID สำหรับนักศึกษา ${studentId}`);
        return { success: false, error: 'No User ID for student' };
    }

    const docName = docType === 'response' ? 'หนังสือขอความอนุเคราะห์' : 'หนังสือส่งตัว';
    const message = `📄 เอกสารพร้อมให้ดาวน์โหลด\n\n` +
        `📋 เลขที่คำร้อง: ${requestNumber}\n` +
        `👤 นักศึกษา: ${studentName}\n` +
        `📄 เอกสาร: ${docName}\n` +
        `📅 ${new Date().toLocaleString('th-TH')}\n\n` +
        `📥 กรุณาดาวน์โหลดที่ระบบ`;

    console.log(`🔔 ส่งหานักศึกษา: ${userId}`);
    return await sendLineMessage(userId, message);
}

module.exports = {
    LINE_TOKEN,
    LINE_CHANNEL_ID,
    ADMIN_USER_ID,
    usersData,
    saveUser,
    getUserByStudentId,
    getUserIdFromSheet,
    sendLineMessage,
    notifyAdminNewRequest,
    notifyAdminStudentUpload,
    notifyStudentReady
};
