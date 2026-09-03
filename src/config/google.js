const { google } = require('googleapis');
require('dotenv').config();

// ✅ ใช้ Environment Variable GOOGLE_CREDENTIALS
let credentials;
try {
  // ตรวจสอบว่า GOOGLE_CREDENTIALS มีอยู่และเป็น JSON ที่ถูกต้อง
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log('✅ ใช้ credentials จาก Environment Variable');
  } else {
    // Fallback: ใช้ไฟล์
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.join(__dirname, '../../credentials/service-account-key.json');
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      console.log('✅ ใช้ credentials จากไฟล์');
    } else {
      throw new Error('ไม่พบ Credentials ทั้งใน Environment และไฟล์');
    }
  }
} catch (error) {
  console.error('❌ Error parsing credentials:', error.message);
  throw new Error('Credentials ไม่ถูกต้อง');
}

// ✅ ใช้ credentials แทน keyFile
const auth = new google.auth.GoogleAuth({
  credentials: credentials,  // ใช้ object โดยตรง
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

module.exports = {
  auth,
  sheets,
  drive,
  SPREADSHEET_ID,
  DRIVE_FOLDER_ID
};

// ============================================================
//  ฟังก์ชันสำหรับอ่าน Credentials จากไฟล์ (Development)
// ============================================================
function useKeyFile() {
  try {
    const keyPath = path.join(__dirname, '../../credentials/service-account-key.json');
    
    auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly'
      ]
    });
    console.log('✅ ใช้ Service Account จากไฟล์:', keyPath);
  } catch (error) {
    console.error('❌ ไม่พบไฟล์ credentials:', error.message);
    throw new Error('ไม่พบ Service Account Credentials');
  }
}

// ============================================================
//  สร้าง Instance สำหรับ Google Sheets และ Drive
// ============================================================
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

// ============================================================
//  ค่าคงที่สำหรับ Spreadsheet และ Drive Folder
// ============================================================
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// ตรวจสอบว่า SPREADSHEET_ID ถูกตั้งค่าหรือไม่
if (!SPREADSHEET_ID) {
  console.error('❌ ไม่พบ SPREADSHEET_ID ใน Environment Variables');
  console.log('💡 กรุณาเพิ่ม SPREADSHEET_ID ในไฟล์ .env');
} else {
  console.log('✅ SPREADSHEET_ID:', SPREADSHEET_ID);
}

if (!DRIVE_FOLDER_ID) {
  console.warn('⚠️ ไม่พบ DRIVE_FOLDER_ID ใน Environment Variables');
  console.log('💡 กรุณาเพิ่ม DRIVE_FOLDER_ID ในไฟล์ .env (หรือใช้ My Drive แทน)');
} else {
  console.log('✅ DRIVE_FOLDER_ID:', DRIVE_FOLDER_ID);
}

// ============================================================
//  ฟังก์ชันสำหรับทดสอบการเชื่อมต่อ Google API
// ============================================================
async function testGoogleConnection() {
  try {
    // ทดสอบอ่านข้อมูลจาก Sheets
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'คำร้องขอฝึกประสบการณ์!A1:AA1',
    });
    console.log('✅ เชื่อมต่อกับ Google Sheets สำเร็จ');
    console.log('📋 Header:', response.data.values[0]);
    return true;
  } catch (error) {
    console.error('❌ ไม่สามารถเชื่อมต่อกับ Google Sheets:', error.message);
    
    if (error.message.includes('not found')) {
      console.log('💡 สาเหตุ: ไม่พบ Spreadsheet ID หรือยังไม่ได้แชร์กับ Service Account');
    } else if (error.message.includes('permission')) {
      console.log('💡 สาเหตุ: Service Account ไม่มีสิทธิ์เข้าถึง Spreadsheet');
    }
    return false;
  }
}

// ============================================================
//  ฟังก์ชันสำหรับทดสอบการเชื่อมต่อ Google Drive
// ============================================================
async function testDriveConnection() {
  if (!DRIVE_FOLDER_ID) {
    console.warn('⚠️ ไม่มี DRIVE_FOLDER_ID ข้ามการทดสอบ Drive');
    return false;
  }

  try {
    const response = await drive.files.get({
      fileId: DRIVE_FOLDER_ID,
      fields: 'id, name, mimeType',
    });
    console.log('✅ เชื่อมต่อกับ Google Drive สำเร็จ');
    console.log('📁 Folder Name:', response.data.name);
    console.log('📁 Folder ID:', response.data.id);
    return true;
  } catch (error) {
    console.error('❌ ไม่สามารถเชื่อมต่อกับ Google Drive:', error.message);
    
    if (error.message.includes('not found')) {
      console.log('💡 สาเหตุ: ไม่พบ Folder ID หรือยังไม่ได้แชร์กับ Service Account');
    } else if (error.message.includes('permission')) {
      console.log('💡 สาเหตุ: Service Account ไม่มีสิทธิ์เข้าถึง Folder');
    }
    return false;
  }
}

// ============================================================
//  ฟังก์ชันสำหรับตรวจสอบ Credentials
// ============================================================
async function checkCredentials() {
  try {
    const client = await auth.getClient();
    const email = client.email || 'N/A';
    console.log('📧 Service Account Email:', email);
    return { success: true, email };
  } catch (error) {
    console.error('❌ ตรวจสอบ Credentials ล้มเหลว:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================================
//  ส่งออกโมดูล
// ============================================================
module.exports = {
  auth,
  sheets,
  drive,
  SPREADSHEET_ID,
  DRIVE_FOLDER_ID,
  testGoogleConnection,
  testDriveConnection,
  checkCredentials
};
