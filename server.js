const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// ============================================================
//  Route Imports
// ============================================================
const authRoutes = require('./src/routes/authRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  CORS Configuration (แก้ไขให้รองรับ Production)
// ============================================================
const allowedOrigins = [
    'https://internship.evc.ac.th',
    'http://internship.evc.ac.th',
    'https://internship-api-otij.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',
    process.env.FRONTEND_URL || 'https://internship.evc.ac.th'
].filter(Boolean); // กรองค่าที่เป็น null/undefined

const corsOptions = {
    origin: function (origin, callback) {
        // อนุญาตถ้าไม่มี origin (เช่น request จาก Postman) หรืออยู่ใน allowedOrigins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked: ${origin}`);
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false
};

// ใช้ CORS Middleware
app.use(cors(corsOptions));

// เพิ่ม header ให้กับทุก Response (เผื่อกรณี)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://internship.evc.ac.th');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================================
//  Middleware
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging Middleware (เฉพาะ Production)
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        console.log(`📝 ${req.method} ${req.url} - ${req.ip}`);
        next();
    });
}

// ============================================================
//  Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/announcements', announcementRoutes);

// ============================================================
//  Health Check (สำหรับ Render และการทดสอบ)
// ============================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        cors_origin: process.env.FRONTEND_URL || 'not set'
    });
});

// ============================================================
//  Root Route (ตอบกลับง่ายๆ)
// ============================================================
app.get('/', (req, res) => {
    res.json({
        name: 'Internship API',
        version: '1.0.0',
        status: 'online',
        endpoints: {
            health: '/health',
            api: '/api',
            auth: '/api/auth/login',
            requests: '/api/requests',
            announcements: '/api/announcements'
        },
        documentation: 'https://github.com/theooyza2499-parkpoom/internship-api'
    });
});

// ============================================================
//  404 Handler (เส้นทางไม่พบ)
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `ไม่พบเส้นทาง: ${req.method} ${req.url}`
    });
});

// ============================================================
//  Error Handler
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    // กรณี CORS Error
    if (err.message && err.message.includes('Not allowed by CORS')) {
        return res.status(403).json({
            success: false,
            message: 'CORS policy: ไม่อนุญาตให้เข้าถึงจากโดเมนนี้'
        });
    }

    // กรณี Multer Error (ไฟล์)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'ไฟล์มีขนาดเกิน 10 MB'
        });
    }

    // กรณีอื่นๆ
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});


// ============================================================
//  Test Endpoint (สำหรับทดสอบ Google Sheets)
// ============================================================
app.get('/test-sheet', async (req, res) => {
    try {
        const { sheets, SPREADSHEET_ID } = require('./src/config/google');
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'การแจ้งเตือน!A1:F1',
        });
        res.json({
            success: true,
            headers: response.data.values,
            message: '✅ เชื่อมต่อ Google Sheets สำเร็จ'
        });
    } catch (error) {
        console.error('❌ Test Sheet Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message,
            details: error.response?.data || 'ไม่มีรายละเอียดเพิ่มเติม'
        });
    }
});

// ============================================================
//  Address API (สำหรับค้นหาที่อยู่)
// ============================================================
const addressService = require('./src/services/addressService');

// ค้นหาจังหวัด
app.get('/api/address/provinces', (req, res) => {
  const { keyword } = req.query;
  const results = addressService.searchProvinces(keyword);
  res.json({ success: true, data: results });
});

// ค้นหาอำเภอ
app.get('/api/address/districts', (req, res) => {
  const { province, keyword } = req.query;
  if (!province) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุจังหวัด' });
  }
  const results = addressService.searchDistricts(province, keyword);
  res.json({ success: true, data: results });
});

// ค้นหาตำบล
app.get('/api/address/subdistricts', (req, res) => {
  const { province, district, keyword } = req.query;
  if (!province || !district) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุจังหวัดและอำเภอ' });
  }
  const results = addressService.searchSubDistricts(province, district, keyword);
  res.json({ success: true, data: results });
});

// ค้นหารหัสไปรษณีย์
app.get('/api/address/postalcode', (req, res) => {
  const { province, district, subDistrict } = req.query;
  if (!province || !district || !subDistrict) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุข้อมูลให้ครบ' });
  }
  const postalCode = addressService.getPostalCode(province, district, subDistrict);
  res.json({ success: true, data: postalCode });
});

// ค้นหาแบบเต็ม (พิมพ์อะไรก็ได้)
app.get('/api/address/search', (req, res) => {
  const { keyword } = req.query;
  if (!keyword) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุคำค้น' });
  }
  const results = addressService.searchAll(keyword);
  // จำกัดผลลัพธ์สูงสุด 50 รายการ
  const limited = results.slice(0, 50);
  res.json({ success: true, data: limited, total: results.length });
});



// ============================================================
//  Start Server
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 API URL: http://localhost:${PORT}/api`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 CORS Origin: ${process.env.FRONTEND_URL || 'not set'}`);
});





// ============================================================
//  Graceful Shutdown (สำหรับ Render)
// ============================================================
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
