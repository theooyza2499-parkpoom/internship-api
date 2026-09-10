const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
//  โหลด Token จากไฟล์
// ============================================================
const CREDENTIALS_DIR = path.join(__dirname, '../../credentials');

function readFile(filename, defaultValue = '') {
    try {
        const filePath = path.join(CREDENTIALS_DIR, filename);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8').trim();
        }
    } catch (error) {
        console.error(`❌ อ่านไฟล์ ${filename} ล้มเหลว:`, error.message);
    }
    return defaultValue;
}

function writeFile(filename, content) {
    try {
        const filePath = path.join(CREDENTIALS_DIR, filename);
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (error) {
        console.error(`❌ เขียนไฟล์ ${filename} ล้มเหลว:`, error.message);
        return false;
    }
}

const LINE_TOKEN = readFile('token_line.txt');
const LINE_CHANNEL_ID = readFile('channelID_line.txt');
const ADMIN_USER_ID = readFile('userID_line.txt');

// โหลด users ที่เคยแอด Bot
let usersData = {};
try {
    const usersPath = path.join(CREDENTIALS_DIR, 'users_line.json');
    if (fs.existsSync(usersPath)) {
        usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    }
} catch (error) {
    console.error('❌ อ่าน users_line.json ล้มเหลว:', error.message);
}

console.log(`✅ โหลด LINE Token: ${LINE_TOKEN ? 'สำเร็จ' : 'ไม่พบ'}`);
console.log(`✅ โหลด Channel ID: ${LINE_CHANNEL_ID || 'ไม่พบ'}`);
console.log(`✅ โหลด Admin User ID: ${ADMIN_USER_ID || 'ไม่พบ'}`);
console.log(`✅ โหลด Users: ${Object.keys(usersData).length} คน`);

// ============================================================
//  บันทึก User ID ของนักศึกษา
// ============================================================
function saveUser(studentId, userId, displayName = '') {
    usersData[studentId] = {
        userId: userId,
        displayName: displayName,
        updatedAt: new Date().toISOString()
    };
    const usersPath = path.join(CREDENTIALS_DIR, 'users_line.json');
    fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2), 'utf8');
    console.log(`💾 บันทึก User ID สำหรับ ${studentId}: ${userId}`);
}

// ============================================================
//  ดึง User ID ของนักศึกษา
// ============================================================
function getUserByStudentId(studentId) {
    return usersData[studentId] ? usersData[studentId].userId : null;
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
        `📅 วันที่: ${new Date().toLocaleString('th-TH')}\n\n` +
        `กรุณาดำเนินการที่ระบบ`;

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

    const message = `📩 นักศึกษาอัปโหลดเอกสารตอบกลับจากบริษัท\n\n` +
        `📋 เลขที่คำร้อง: ${requestData.requestNumber}\n` +
        `👤 นักศึกษา: ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
        `🆔 รหัส: ${requestData.studentId}\n` +
        `🏢 สถานที่: ${requestData.companyName}\n` +
        `📅 วันที่: ${new Date().toLocaleString('th-TH')}\n\n` +
        `กรุณาตรวจสอบและดำเนินการต่อ`;

    return await sendLineMessage(ADMIN_USER_ID, message);
}

// ============================================================
//  แจ้งเตือนนักศึกษา (เอกสารพร้อมดาวน์โหลด)
// ============================================================
async function notifyStudentReady(studentId, studentName, requestNumber, docType) {
    const userId = getUserByStudentId(studentId);
    
    if (!userId) {
        console.warn(`⚠️ ไม่พบ User ID สำหรับนักศึกษา ${studentId}`);
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

// ============================================================
//  ส่งข้อความหาหลายคน
// ============================================================
async function sendLineToMany(userIds, message) {
    const results = [];
    for (const userId of userIds) {
        results.push(await sendLineMessage(userId, message));
    }
    return results;
}

module.exports = {
    LINE_TOKEN,
    LINE_CHANNEL_ID,
    ADMIN_USER_ID,
    usersData,
    saveUser,
    getUserByStudentId,
    sendLineMessage,
    notifyAdminNewRequest,
    notifyAdminStudentUpload,
    notifyStudentReady,
    sendLineToMany
};
