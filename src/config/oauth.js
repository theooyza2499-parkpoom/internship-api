const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const open = require('open');

// ที่อยู่ของไฟล์ Credentials และ Token
const CREDENTIALS_PATH = path.join(__dirname, '../../credentials/oauth-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../../credentials/token.json');

/**
 * รับ OAuth 2.0 Client ที่พร้อมใช้งาน
 * - ถ้ามี Token อยู่แล้ว จะใช้ Token นั้น
 * - ถ้าไม่มี จะเปิดเบราว์เซอร์ให้ล็อกอิน
 */
async function getOAuthClient() {
  // ตรวจสอบว่าไฟล์ credentials มีอยู่หรือไม่
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`❌ ไม่พบไฟล์ OAuth credentials ที่: ${CREDENTIALS_PATH}`);
  }

  // โหลด credentials
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
  
  // สร้าง OAuth2 Client
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] // ใช้ redirect URI แรก
  );

  // ตรวจสอบว่ามี Token เก็บไว้แล้วหรือไม่
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
      
      // ตรวจสอบว่า Token หมดอายุหรือไม่
      if (token.expiry_date && Date.now() >= token.expiry_date) {
        console.log('🔄 Token หมดอายุ กำลังรีเฟรช...');
        try {
          const { credentials: newCredentials } = await oAuth2Client.refreshAccessToken();
          oAuth2Client.setCredentials(newCredentials);
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(newCredentials));
          console.log('✅ รีเฟรช Token สำเร็จ');
        } catch (refreshError) {
          console.log('⚠️ ไม่สามารถรีเฟรช Token ได้ กรุณาล็อกอินใหม่');
          // ลบ token เก่า แล้วให้ล็อกอินใหม่
          fs.unlinkSync(TOKEN_PATH);
          return await getNewToken(oAuth2Client);
        }
      }
      
      return oAuth2Client;
    } catch (error) {
      console.log('⚠️ ไฟล์ Token เสียหาย กรุณาล็อกอินใหม่');
      fs.unlinkSync(TOKEN_PATH);
      return await getNewToken(oAuth2Client);
    }
  }

  // ถ้าไม่มี Token → ต้องล็อกอิน
  return await getNewToken(oAuth2Client);
}

/**
 * ขั้นตอนการล็อกอินครั้งแรก (รับ Token ใหม่)
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // สำคัญ! เพื่อให้ได้ Refresh Token
    scope: [
      'https://www.googleapis.com/auth/drive.file',  // เฉพาะไฟล์ที่สร้าง/เปิด
      // หรือใช้ 'https://www.googleapis.com/auth/drive' ถ้าต้องการเข้าถึงไฟล์ทั้งหมด
    ],
    // ใช้ prompt: 'consent' เพื่อให้แน่ใจว่าได้ Refresh Token ทุกครั้ง
    prompt: 'consent',
  });

  console.log('\n🔑 กรุณาเปิดลิงก์นี้ในเบราว์เซอร์เพื่อล็อกอิน:');
  console.log(authUrl);
  console.log('\n');

  // พยายามเปิดเบราว์เซอร์อัตโนมัติ
  try {
    await open(authUrl);
    console.log('🌐 เบราว์เซอร์ถูกเปิดแล้ว กรุณาล็อกอินด้วยบัญชีที่มีสิทธิ์เข้าถึงโฟลเดอร์');
  } catch (error) {
    console.log('⚠️ ไม่สามารถเปิดเบราว์เซอร์อัตโนมัติ กรุณาคัดลอกลิงก์ไปเปิดเอง');
  }

  // รับรหัสจากผู้ใช้
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('\n📝 หลังจากล็อกอินแล้ว ให้คัดลอกรหัส (code) ที่ได้มาแล้ววางที่นี่: ', async (code) => {
      rl.close();
      
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        
        // บันทึก Token ไว้ใช้ครั้งต่อไป
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('✅ Token ถูกบันทึกไว้ที่:', TOKEN_PATH);
        console.log('📅 Token จะหมดอายุ:', new Date(tokens.expiry_date).toLocaleString());
        
        resolve(oAuth2Client);
      } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการรับ Token:', error.message);
        reject(error);
      }
    });
  });
}

/**
 * ฟังก์ชันสำหรับลบ Token (กรณีต้องการล็อกอินใหม่)
 */
function clearToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
    console.log('🗑️ ลบ Token เรียบร้อย');
  }
}

module.exports = { 
  getOAuthClient,
  clearToken 
};