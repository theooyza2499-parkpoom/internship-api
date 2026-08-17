const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// ============================================================
//  นำเข้า Routes
// ============================================================
const authRoutes = require('./src/routes/authRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');

// ============================================================
//  นำเข้า Google Config (สำหรับทดสอบการเชื่อมต่อ)
// ============================================================
const { testGoogleConnection, testDriveConnection, checkCredentials } = require('./src/config/google');

// ============================================================
//  สร้าง Express App
// ============================================================
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  Middleware
// ============================================================

// 1. CORS (อนุญาตให้ Frontend เชื่อมต่อ)
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*', // ใช้ Environment Variable หรืออนุญาตทั้งหมด
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// 2. JSON Parser (รองรับ request ขนาดใหญ่)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 3. Static Files (ถ้ามีไฟล์ที่ต้องการให้บริการ)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
//  Routes
// ============================================================

// Health Check (ทดสอบว่า API ทำงาน)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ทดสอบการเชื่อมต่อ Google API
app.get('/api/test-google', async (req, res) => {
  try {
    const creds = await checkCredentials();
    const sheetsOk = await testGoogleConnection();
    const driveOk = await testDriveConnection();
    
    res.json({
      success: true,
      data: {
        serviceAccount: creds.email || 'N/A',
        sheets: sheetsOk,
        drive: driveOk
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/announcements', announcementRoutes);

// ============================================================
//  Error Handling Middleware (ต้องอยู่ท้ายสุด)
// ============================================================

// 404 Not Found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `ไม่พบเส้นทาง: ${req.method} ${req.originalUrl}`
  });
});

// 500 Internal Server Error
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  
  // แยก error ประเภทต่างๆ
  if (err.message && err.message.includes('กรุณาอัปโหลดไฟล์')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  if (err.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      message: 'ไม่พบไฟล์หรือไดเรกทอรีที่ต้องการ'
    });
  }
  
  // Error ทั่วไป
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' 
      : err.message
  });
});

// ============================================================
//  ฟังก์ชันทดสอบการเชื่อมต่อก่อนรันเซิร์ฟเวอร์
// ============================================================
async function testGoogleConnections() {
  console.log('\n🔍 กำลังทดสอบการเชื่อมต่อ Google API...\n');
  
  try {
    const creds = await checkCredentials();
    console.log(`📧 Service Account: ${creds.email || 'N/A'}`);
    
    const sheetsOk = await testGoogleConnection();
    const driveOk = await testDriveConnection();
    
    console.log('\n📊 สรุปการเชื่อมต่อ:');
    console.log(`   Google Sheets: ${sheetsOk ? '✅' : '❌'}`);
    console.log(`   Google Drive:  ${driveOk ? '✅' : '❌'}`);
    
    if (!sheetsOk || !driveOk) {
      console.log('\n⚠️ ระบบอาจทำงานไม่สมบูรณ์ กรุณาตรวจสอบการตั้งค่า');
    } else {
      console.log('\n✅ ทุกอย่างพร้อมใช้งาน!');
    }
  } catch (error) {
    console.error('❌ ทดสอบการเชื่อมต่อล้มเหลว:', error.message);
  }
}

// ============================================================
//  เริ่มต้นเซิร์ฟเวอร์
// ============================================================
app.listen(PORT, async () => {
  console.log(`\n🚀 Server is running on port ${PORT}`);
  console.log(`📍 API URL: http://localhost:${PORT}/api`);
  console.log(`📍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // ทดสอบการเชื่อมต่อ Google API (เฉพาะ development)
  if (process.env.NODE_ENV !== 'production') {
    await testGoogleConnections();
  } else {
    console.log('\n🔍 Production mode: ข้ามการทดสอบ Google API');
  }
  
  console.log('\n✅ พร้อมให้บริการ!');
});

// ============================================================
//  Graceful Shutdown (จัดการเมื่อปิดเซิร์ฟเวอร์)
// ============================================================
process.on('SIGINT', () => {
  console.log('\n🛑 กำลังปิดเซิร์ฟเวอร์...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 กำลังปิดเซิร์ฟเวอร์...');
  process.exit(0);
});

// ============================================================
//  ส่งออก app (สำหรับการทดสอบ)
// ============================================================
module.exports = app;