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
const ADMIN_SHEET_NAME = 'adminLine';
const ADMIN_HEADERS = ['User ID LINE', 'ชื่อ', 'วันที่เพิ่ม', 'เพิ่มโดย']
let adminCache = [];
let adminCacheTime = 0;
const ADMIN_CACHE_DURATION = 60 * 1000; // 1 นาที

/**
 * โหลดรายการ Admin จากชีต "adminLine"
 * โครงสร้าง: | User ID LINE | ชื่อ | วันที่เพิ่ม | เพิ่มโดย |
 */
async function loadAdminsFromSheets() {
    if (!sheetsService) return [];
    
    try {
        // ✅ อ่านคอลัมน์ A:D (4 คอลัมน์)
        const data = await sheetsService.getSheetData(`${ADMIN_SHEET_NAME}!A:D`);
        if (data.length < 2) {
            console.log(`ℹ️ ชีต ${ADMIN_SHEET_NAME} ยังไม่มีข้อมูล Admin`);
            return [];
        }
        
        // ✅ ข้าม header (แถวแรก) แล้วดึงเฉพาะ User ID
        const admins = data.slice(1)
            .map(row => ({
                userId: (row[0] || '').trim(),
                name: (row[1] || '').trim(),
                addedAt: (row[2] || '').trim(),
                addedBy: (row[3] || '').trim()
            }))
            .filter(item => item.userId.startsWith('U'));
        
        console.log(`👥 โหลด Admin จากชีต ${ADMIN_SHEET_NAME}: ${admins.length} คน`);
        return admins;
    } catch (error) {
        console.warn('⚠️ โหลด Admin จาก Sheets ไม่ได้:', error.message);
        return [];
    }
}

/**
 * ดึงรายการ Admin ทั้งหมด (Admin หลัก + จากชีต)
 * @returns {Promise<Array<{userId, name, addedAt, addedBy, isMain}>>}
 */
async function getAllAdmins() {
    const now = Date.now();
    if (adminCache.length > 0 && (now - adminCacheTime) < ADMIN_CACHE_DURATION) {
        return adminCache;
    }
    
    const sheetAdmins = await loadAdminsFromSheets();
    
    // ✅ Admin หลัก (จากไฟล์ userID_line.txt)
    const mainAdmin = {
        userId: ADMIN_USER_ID,
        name: 'Admin หลัก',
        addedAt: '-',
        addedBy: 'ระบบ',
        isMain: true
    };
    
    // ✅ รวม Admin หลัก + จากชีต (ไม่ให้ซ้ำ)
    const allAdmins = [mainAdmin];
    for (const admin of sheetAdmins) {
        if (admin.userId !== ADMIN_USER_ID) {
            allAdmins.push({ ...admin, isMain: false });
        }
    }
    
    adminCache = allAdmins;
    adminCacheTime = now;
    
    console.log(`👥 รวม Admin ทั้งหมด: ${allAdmins.length} คน`);
    return allAdmins;
}

/**
 * ดึงเฉพาะ User ID ของ Admin (สำหรับส่งข้อความ)
 */
async function getAdminUserIds() {
    const admins = await getAllAdmins();
    return admins.map(a => a.userId).filter(Boolean);
}

/**
 * ตรวจสอบว่า userId นี้เป็น Admin หรือไม่
 */
async function isAdmin(userId) {
    if (!userId) return false;
    if (userId === ADMIN_USER_ID) return true;  // Admin หลักเสมอ
    
    const adminIds = await getAdminUserIds();
    return adminIds.includes(userId);
}

/**
 * เพิ่ม Admin ใหม่ลงชีต "adminLine"
 * @param {string} userId - User ID LINE ของ Admin ใหม่
 * @param {string} name - ชื่อ Admin
 * @param {string} addedBy - User ID ของคนที่เพิ่ม (Admin หลัก)
 */
async function addAdmin(userId, name = '', addedBy = '') {
    if (!sheetsService) {
        return { success: false, error: 'ไม่มี sheetsService' };
    }
    
    if (!userId || !userId.startsWith('U')) {
        return { success: false, error: 'User ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U)' };
    }
    
    if (userId === ADMIN_USER_ID) {
        return { success: false, error: 'นี่คือ Admin หลักอยู่แล้ว' };
    }
    
    try {
        // ✅ ตรวจสอบว่ามีอยู่แล้วหรือยัง
        const admins = await getAllAdmins();
        if (admins.some(a => a.userId === userId)) {
            return { success: false, error: 'User ID นี้เป็น Admin อยู่แล้ว' };
        }
        
        // ✅ เตรียมข้อมูล 4 คอลัมน์
        const dateStr = new Date().toLocaleString('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // ✅ คอลัมน์ D = "เพิ่มโดย" — ใช้ชื่อถ้ามี ไม่งั้นใช้ User ID ย่อ
        const addedByDisplay = addedBy === ADMIN_USER_ID 
            ? 'Admin หลัก' 
            : (addedBy ? addedBy.substring(0, 12) + '...' : 'ไม่ระบุ');
        
        // ✅ เพิ่มลงชีต adminLine (4 คอลัมน์: A, B, C, D)
        await sheetsService.appendData(`${ADMIN_SHEET_NAME}!A:D`, [
            userId,
            name || 'ไม่ระบุ',
            dateStr,
            addedByDisplay
        ]);
        
        // ✅ ล้าง cache เพื่อโหลดใหม่
        adminCache = [];
        adminCacheTime = 0;
        
        console.log(`✅ เพิ่ม Admin: ${userId.substring(0, 10)}... (${name}) โดย ${addedByDisplay}`);
        return { 
            success: true, 
            data: { userId, name, addedAt: dateStr, addedBy: addedByDisplay }
        };
    } catch (error) {
        console.error('❌ เพิ่ม Admin ล้มเหลว:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ลบ Admin ออกจากชีต "adminLine"
 */
async function removeAdmin(userId) {
    if (!sheetsService) {
        return { success: false, error: 'ไม่มี sheetsService' };
    }
    
    if (userId === ADMIN_USER_ID) {
        return { success: false, error: 'ไม่สามารถลบ Admin หลักได้' };
    }
    
    try {
        const data = await sheetsService.getSheetData(`${ADMIN_SHEET_NAME}!A:D`);
        if (data.length < 2) {
            return { success: false, error: 'ไม่พบข้อมูล Admin' };
        }
        
        // ✅ หาแถวที่ต้องการลบ
        for (let i = 1; i < data.length; i++) {
            if ((data[i][0] || '').trim() === userId) {
                const rowNumber = i + 1; // แถวใน Sheets เริ่มที่ 1
                const name = data[i][1] || 'ไม่ระบุ';
                
                // ✅ ลบทั้งแถว A:D
                await sheetsService.clearData(`${ADMIN_SHEET_NAME}!A${rowNumber}:D${rowNumber}`);
                
                // ✅ ล้าง cache
                adminCache = [];
                adminCacheTime = 0;
                
                console.log(`🗑️ ลบ Admin: ${userId.substring(0, 10)}... (${name})`);
                return { success: true, data: { userId, name } };
            }
        }
        
        return { success: false, error: 'ไม่พบ Admin คนนี้ในระบบ' };
    } catch (error) {
        console.error('❌ ลบ Admin ล้มเหลว:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * ดึงรายชื่อ Admin ทั้งหมด (สำหรับแสดงผล)
 */
async function listAdmins() {
    const admins = await getAllAdmins();
    return admins;
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
    const adminIds = await getAdminUserIds();
    
    if (adminIds.length === 0) {
        console.warn('⚠️ ไม่มี Admin');
        return [];
    }
    
    console.log(`📤 กำลังแจ้ง Admin ${adminIds.length} คน...`);
    
    const results = [];
    for (const adminId of adminIds) {
        const result = await sendLineMessage(adminId, message);
        results.push({ 
            adminId: adminId.substring(0, 10) + '...', 
            ...result 
        });
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
    // Admin functions
    getAllAdmins,
    getAdminUserIds,
    isAdmin,
    addAdmin,
    removeAdmin,
    listAdmins,
    // Student functions
    getUserByStudentId,
    saveUser,
    sendLineMessage,
    // Notification functions
    notifyAllAdmins,
    notifyAdminNewRequest,
    notifyAdminStudentUpload,
    notifyStudentReady
};
