const { google } = require('googleapis');
const path = require('path');
require('dotenv').config();

// --- Service Account (สำหรับ Sheets และอื่นๆ ที่ยังใช้ Service Account) ---
const keyPath = path.join(__dirname, '../../credentials/service-account-key.json');

const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file', // เพิ่ม scope สำหรับ Drive
    'https://www.googleapis.com/auth/drive.readonly'
  ]
});

// --- Service Account สำหรับ Sheets (ยังคงเดิม) ---
const sheets = google.sheets({ version: 'v4', auth });

// --- OAuth 2.0 สำหรับ Drive (จะใช้ใน driveService.js แทน) ---
// เราจะไม่สร้าง drive instance ที่นี่ เพราะจะใช้ OAuth แทน

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

module.exports = {
  auth,
  sheets,
  // drive ถูกย้ายไปใช้ใน driveService.js ด้วย OAuth แทน
  SPREADSHEET_ID,
  DRIVE_FOLDER_ID
};