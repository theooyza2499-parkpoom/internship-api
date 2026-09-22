const fs = require('fs');
const path = require('path');
const https = require('https');

let sheetsService;
try {
    sheetsService = require('./sheetsService');
} catch (error) {
    console.warn('⚠️ ไม่สามารถโหลด sheetsService:', error.message);
}

const isProduction = process.env.NODE_ENV === 'production';
const CREDENTIALS_DIR = isProduction 
    ? '/etc/secrets' 
    : path.join(__dirname, '../../credentials');

console.log(`📁 LINE Credentials Dir: ${CREDENTIALS_DIR}`);

function readFile(filename, defaultValue = '') {
    try {
        const filePath = path.join(CREDENTIALS_DIR, filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8').trim();
            console.log(`✅ อ่านไฟล์ ${filename} สำเร็จ`);
            return content;
        }
    } catch (error) {
        console.error(`❌ อ่านไฟล์ ${filename} ล้มเหลว:`, error.message);
    }
    return defaultValue;
}

const LINE_TOKEN = readFile('token_line.txt');
const LINE_CHANNEL_ID = readFile('channelID_line.txt');
const ADMIN_USER_ID = readFile('userID_line.txt');  // Admin หลัก

console.log(`📊 สรุป LINE Credentials:`);
console.log(`   - Token: ${LINE_TOKEN ? '✅' : '❌'}`);
console.log(`   - Admin หลัก: ${ADMIN_USER_ID ? '✅' : '❌'}`);

// ============================================================
//  ✅ Admin Cache — โหลดจาก Sheets
// ============================================================
const ADMIN_SHEET_NAME = 'Admin';
let adminCache = [];
let adminCacheTime = 0;
const ADMIN_CACHE_DURATION = 60 * 1000; // 1 นาที

/**
 * โหลดรายการ Admin จาก Google Sheets
 * โครงสร้างชีต "Admin": | User ID | ชื่อ | วันที่เพิ่ม |
 */
async function loadAdminsFromSheets() {
    if (!sheetsService) return [];
    
    try {
        const data = await sheetsService.getSheetData(`${ADMIN_SHEET_NAME}!A:C`);
        if (data.length < 2) return [];
        
        // ข้าม header (แถวแรก)
        const admins = data.slice(1)
            .map(row => (row[0] || '').trim())
            .filter(id => id.startsWith('U'));
        
        console.log(`👥 โหลด Admin จาก Sheets: ${admins.length} คน`);
        return admins;
    } catch (error) {
        console.warn('⚠️ โหลด Admin จาก Sheets ไม่ได้:', error.message);
        return [];
    }
}

/**
 * ดึงรายการ Admin ทั้งหมด (รวม Admin หลัก + จาก Sheets)
 */
async function getAllAdmins() {
    const now = Date.now();
    if (adminCache.length > 0 && (now - adminCacheTime) < ADMIN_CACHE_DURATION) {
        return adminCache;
    }
    
    const sheetAdmins = await loadAdminsFromSheets();
    
    // รวม Admin หลัก + จาก Sheets (ไม่ซ้ำ)
    const allAdmins = [ADMIN_USER_ID, ...sheetAdmins].filter(Boolean);
    const uniqueAdmins = [...new Set(allAdmins)];
    
    adminCache = uniqueAdmins;
    adminCacheTime = now;
    
    return uniqueAdmins;
}

/**
 * ตรวจสอบว่า userId นี้เป็น Admin หรือไม่
 */
async function isAdmin(userId) {
    if (!userId) return false;
    if (userId === ADMIN_USER_ID) return true;  // Admin หลักเสมอ
    
    const admins = await getAllAdmins();
    return admins.includes(userId);
}

/**
 * เพิ่ม Admin ใหม่ลง Sheets
 */
async function addAdmin(userId, name = '') {
    if (!sheetsService) {
        return { success: false, error: 'ไม่มี sheetsService' };
    }
    
    if (!userId || !userId.startsWith('U')) {
        return { success: false, error: 'User ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U)' };
    }
    
    try {
        // ตรวจสอบว่ามีอยู่แล้วหรือยัง
        const admins = await getAllAdmins();
        if (admins.includes(userId)) {
            return { success: false, error: 'User ID นี้เป็น Admin อยู่แล้ว' };
        }
        
        // เพิ่มลง Sheets
        await sheetsService.appendData(`${ADMIN_SHEET_NAME}!A:C`, [
            userId,
            name || 'ไม่ระบุ',
            new Date().toLocaleString('th-TH')
        ]);
        
        // ล้าง cache เพื่อโหลดใหม่
        adminCache = [];
        adminCacheTime = 0;
        
        console.log(`✅ เพิ่ม Admin ใหม่: ${userId.substring(0, 10)}... (${name})`);
        return { success: true };
    } catch (error) {
        console.error('❌ เพิ่ม Admin ล้มเหลว:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ลบ Admin ออกจาก Sheets
 */
async function removeAdmin(userId) {
    if (!sheetsService) return { success: false, error: 'ไม่มี sheetsService' };
    if (userId === ADMIN_USER_ID) {
        return { success: false, error: 'ไม่สามารถลบ Admin หลักได้' };
    }
    
    try {
        const data = await sheetsService.getSheetData(`${ADMIN_SHEET_NAME}!A:C`);
        for (let i = 1; i < data.length; i++) {
            if ((data[i][0] || '').trim() === userId) {
                // ลบแถว i+1 (index เริ่มที่ 1)
                await sheetsService.clearData(`${ADMIN_SHEET_NAME}!A${i+1}:C${i+1}`);
                adminCache = [];
                adminCacheTime = 0;
                console.log(`🗑️ ลบ Admin: ${userId.substring(0, 10)}...`);
                return { success: true };
            }
        }
        return { success: false, error: 'ไม่พบ Admin คนนี้' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================
//  ฟังก์ชันเดิม (getUserByStudentId, saveUser, sendLineMessage)
// ============================================================
let userCache = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 1000;

async function getUserByStudentId(studentId) {
    try {
        const now = Date.now();
        if (userCache[studentId] && (now - cacheTimestamp) < CACHE_DURATION) {
            return userCache[studentId];
        }
        if (!sheetsService) return null;

        const rowIndex = await sheetsService.findRowByStudentId(studentId);
        if (!rowIndex) return null;

        const data = await sheetsService.getSheetData(`คำร้องขอฝึกประสบการณ์!AI${rowIndex}`);
        const userId = data && data[0] ? data[0][0] : null;

        if (userId) {
            userCache[studentId] = userId;
            cacheTimestamp = now;
            return userId;
        }
        return null;
    } catch (error) {
        console.error(`❌ Error getting User ID for ${studentId}:`, error.message);
        return null;
    }
}

async function saveUser(studentId, userId, displayName = '') {
    try {
        if (!sheetsService) return false;
        const rowIndex = await sheetsService.findRowByStudentId(studentId);
        if (!rowIndex) return false;

        await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AI', userId);
        userCache[studentId] = userId;
        cacheTimestamp = Date.now();
        console.log(`💾 บันทึก User ID สำหรับ ${studentId}`);
        return true;
    } catch (error) {
        console.error('❌ บันทึก User ID ล้มเหลว:', error.message);
        return false;
    }
}

async function sendLineMessage(userId, message) {
    if (!LINE_TOKEN || !userId) {
        return { success: false, error: 'Missing token or userId' };
    }

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
                    resolve({ success: true, statusCode: res.statusCode });
                } else {
                    console.error(`❌ ส่ง LINE ล้มเหลว: ${res.statusCode} - ${body}`);
                    resolve({ success: false, statusCode: res.statusCode, error: body });
                }
            });
        });
        req.on('error', (error) => resolve({ success: false, error: error.message }));
        req.write(data);
        req.end();
    });
}

// ============================================================
//  ✅ ส่งข้อความหาทุก Admin
// ============================================================
async function notifyAllAdmins(message) {
    const admins = await getAllAdmins();
    if (admins.length === 0) {
        console.warn('⚠️ ไม่มี Admin');
        return [];
    }
    
    const results = [];
    for (const adminId of admins) {
        const result = await sendLineMessage(adminId, message);
        results.push({ adminId: adminId.substring(0, 10), ...result });
    }
    return results;
}

async function notifyAdminNewRequest(requestData) {
    const message = `📢 มีคำร้องใหม่!\n\n` +
        `📋 เลขที่: ${requestData.requestNumber}\n` +
        `👤 ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
        `🆔 ${requestData.studentId}\n` +
        `🏢 ${requestData.companyName}\n` +
        `📅 ${new Date().toLocaleString('th-TH')}`;
    
    return await notifyAllAdmins(message);
}

async function notifyAdminStudentUpload(requestData) {
    const message = `📩 นักศึกษาอัปโหลดเอกสาร\n\n` +
        `📋 เลขที่: ${requestData.requestNumber}\n` +
        `👤 ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
        `🆔 ${requestData.studentId}\n` +
        `🏢 ${requestData.companyName}\n` +
        `📅 ${new Date().toLocaleString('th-TH')}`;
    
    return await notifyAllAdmins(message);
}

async function notifyStudentReady(studentId, studentName, requestNumber, docType) {
    const userId = await getUserByStudentId(studentId);
    if (!userId) return { success: false, error: 'No User ID' };
    
    const docName = docType === 'response' ? 'หนังสือขอความอนุเคราะห์' : 'หนังสือส่งตัว';
    const message = `📄 เอกสารพร้อมให้ดาวน์โหลด\n\n` +
        `📋 เลขที่: ${requestNumber}\n` +
        `👤 ${studentName}\n` +
        `📄 ${docName}\n` +
        `📅 ${new Date().toLocaleString('th-TH')}`;
    
    return await sendLineMessage(userId, message);
}

module.exports = {
    LINE_TOKEN,
    LINE_CHANNEL_ID,
    ADMIN_USER_ID,
    getAllAdmins,
    isAdmin,
    addAdmin,
    removeAdmin,
    getUserByStudentId,
    saveUser,
    sendLineMessage,
    notifyAllAdmins,
    notifyAdminNewRequest,
    notifyAdminStudentUpload,
    notifyStudentReady
};
