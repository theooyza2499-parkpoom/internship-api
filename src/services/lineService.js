const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
//  ตรวจสอบว่าอยู่ใน Production หรือ Local
// ============================================================
const isProduction = process.env.NODE_ENV === 'production';

// ✅ Production: อ่านจาก /etc/secrets/
// ✅ Local: อ่านจาก ./credentials/
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

function writeFile(filename, content) {
    try {
        // ✅ ถ้าเป็น Production ให้เขียนที่ /tmp (Render ไม่ให้เขียน /etc/secrets)
        const dir = isProduction ? '/tmp' : CREDENTIALS_DIR;
        const filePath = path.join(dir, filename);
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`💾 เขียนไฟล์ ${filename} สำเร็จ`);
        return true;
    } catch (error) {
        console.error(`❌ เขียนไฟล์ ${filename} ล้มเหลว:`, error.message);
        return false;
    }
}

function readJSONFile(filename, defaultValue = {}) {
    try {
        // ✅ ลองอ่านจาก 2 ที่
        const dirs = isProduction 
            ? ['/etc/secrets', '/tmp', CREDENTIALS_DIR]
            : [CREDENTIALS_DIR];
        
        for (const dir of dirs) {
            const filePath = path.join(dir, filename);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            }
        }
    } catch (error) {
        console.error(`❌ อ่าน JSON ${filename} ล้มเหลว:`, error.message);
    }
    return defaultValue;
}

// ============================================================
//  โหลด Credentials
// ============================================================
const LINE_TOKEN = readFile('token_line.txt');
const LINE_CHANNEL_ID = readFile('channelID_line.txt');
const ADMIN_USER_ID = readFile('userID_line.txt');

// โหลด users ที่เคยแอด Bot
let usersData = readJSONFile('users_line.json', {});

console.log(`📊 สรุป LINE Credentials:`);
console.log(`   - Token: ${LINE_TOKEN ? '✅' : '❌'}`);
console.log(`   - Channel ID: ${LINE_CHANNEL_ID ? '✅' : '❌'}`);
console.log(`   - Admin User ID: ${ADMIN_USER_ID ? '✅' : '❌'}`);
console.log(`   - Users: ${Object.keys(usersData).length} คน`);

// ============================================================
//  บันทึก User ID ของนักศึกษา
// ============================================================
function saveUser(studentId, userId, displayName = '') {
    usersData[studentId] = {
        userId: userId,
        displayName: displayName,
        updatedAt: new Date().toISOString()
    };
    
    // ✅ เขียนลง /tmp บน Production
    const dir = isProduction ? '/tmp' : CREDENTIALS_DIR;
    const usersPath = path.join(dir, 'users_line.json');
    
    try {
        fs.writeFileSync(usersPath, JSON.stringify(usersData, null, 2), 'utf8');
        console.log(`💾 บันทึก User ID สำหรับ ${studentId}: ${userId}`);
    } catch (error) {
        console.error('❌ บันทึก users_line.json ล้มเหลว:', error.message);
    }
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
