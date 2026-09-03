const { google } = require('googleapis');
require('dotenv').config();

// ✅ ใช้ Environment Variable GOOGLE_CREDENTIALS
let credentials;
try {
  if (process.env.GOOGLE_CREDENTIALS) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    console.log('✅ ใช้ Google Credentials จาก Environment Variable');
  } else {
    // Fallback: ใช้ไฟล์ (สำหรับ Local Development)
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.join(__dirname, '../../credentials/service-account-key.json');
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      console.log('✅ ใช้ Google Credentials จากไฟล์');
    } else {
      throw new Error('ไม่พบ Credentials ทั้งใน Environment และไฟล์');
    }
  }
} catch (error) {
  console.error('❌ Error parsing credentials:', error.message);
  throw new Error('Credentials ไม่ถูกต้อง');
}

// ✅ สร้าง Auth Client
const auth = new google.auth.GoogleAuth({
  credentials: credentials,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

// ✅ สร้าง Services (ประกาศครั้งเดียว)
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// ✅ ตรวจสอบค่า Environment Variable
if (!SPREADSHEET_ID) {
  console.error('❌ SPREADSHEET_ID is not set in environment variables');
}
if (!DRIVE_FOLDER_ID) {
  console.error('❌ DRIVE_FOLDER_ID is not set in environment variables');
}

console.log(`✅ SPREADSHEET_ID: ${SPREADSHEET_ID || 'NOT SET'}`);
console.log(`✅ DRIVE_FOLDER_ID: ${DRIVE_FOLDER_ID || 'NOT SET'}`);

module.exports = {
  auth,
  sheets,
  drive,
  SPREADSHEET_ID,
  DRIVE_FOLDER_ID
};
