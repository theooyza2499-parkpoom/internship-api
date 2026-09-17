const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// ============================================================
//  1. Route Imports
// ============================================================
const authRoutes = require('./src/routes/authRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');
const lineRoutes = require('./src/routes/lineRoutes');
const addressService = require('./src/services/addressService');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  2. CORS Configuration
// ============================================================
const allowedOrigins = [
    'https://internship.evc.ac.th',
    'http://internship.evc.ac.th',
    'https://internship-api-otij.onrender.com',
    'http://localhost:3000',
    'http://localhost:5500',
    process.env.FRONTEND_URL || 'https://internship.evc.ac.th'
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS blocked: ${origin}`);
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false
};

app.use(cors(corsOptions));

// ============================================================
//  3. Body Parser
// ============================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================
//  4. Logging Middleware
// ============================================================
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        console.log(`📝 ${req.method} ${req.url} - ${req.ip}`);
        next();
    });
}

// ============================================================
//  5. Address API (ต้องมาก่อน 404 Handler!)
// ============================================================
console.log('📍 ลงทะเบียน Address API');

// ค้นหาจังหวัด
app.get('/api/address/provinces', (req, res) => {
    try {
        const { keyword } = req.query;
        const results = addressService.searchProvinces(keyword);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('❌ Error provinces:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ค้นหาอำเภอ
app.get('/api/address/districts', (req, res) => {
    try {
        const { province, keyword } = req.query;
        if (!province) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุจังหวัด' });
        }
        const results = addressService.searchDistricts(province, keyword);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('❌ Error districts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ค้นหาตำบล
app.get('/api/address/subdistricts', (req, res) => {
    try {
        const { province, district, keyword } = req.query;
        if (!province || !district) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุจังหวัดและอำเภอ' });
        }
        const results = addressService.searchSubDistricts(province, district, keyword);
        res.json({ success: true, data: results });
    } catch (error) {
        console.error('❌ Error subdistricts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ค้นหารหัสไปรษณีย์
app.get('/api/address/postalcode', (req, res) => {
    try {
        const { province, district, subDistrict } = req.query;
        if (!province || !district || !subDistrict) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุข้อมูลให้ครบ' });
        }
        const postalCode = addressService.getPostalCode(province, district, subDistrict);
        res.json({ success: true, data: postalCode });
    } catch (error) {
        console.error('❌ Error postalcode:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ค้นหาแบบเต็ม
app.get('/api/address/search', (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุคำค้น' });
        }
        const results = addressService.searchAll(keyword);
        const limited = results.slice(0, 50);
        res.json({ success: true, data: limited, total: results.length });
    } catch (error) {
        console.error('❌ Error search:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================
//  6. Application Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/line', lineRoutes);

// ============================================================
//  7. Health Check
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
//  8. Root Route
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
            announcements: '/api/announcements',
            line: '/api/line/webhook',
            address: '/api/address/provinces'
        }
    });
});

// ============================================================
//  9. Test Endpoints
// ============================================================

// Test LINE
app.get('/test-line', async (req, res) => {
    try {
        const lineService = require('./src/services/lineService');
        
        const info = {
            hasToken: !!lineService.LINE_TOKEN,
            hasChannelId: !!lineService.LINE_CHANNEL_ID,
            hasAdminUserId: !!lineService.ADMIN_USER_ID,
            adminUserId: lineService.ADMIN_USER_ID ? 
                lineService.ADMIN_USER_ID.substring(0, 10) + '...' : 'ไม่มี',
            tokenLength: lineService.LINE_TOKEN ? lineService.LINE_TOKEN.length : 0,
            usersCount: Object.keys(lineService.usersData).length
        };
        
        if (lineService.ADMIN_USER_ID) {
            const result = await lineService.sendLineMessage(
                lineService.ADMIN_USER_ID,
                `🧪 ทดสอบระบบ LINE\n\n📅 ${new Date().toLocaleString('th-TH')}\n✅ ระบบทำงานปกติ`
            );
            
            res.json({
                success: true,
                info,
                sendResult: result,
                message: result.success ? '✅ ส่งข้อความสำเร็จ' : '❌ ส่งข้อความล้มเหลว'
            });
        } else {
            res.json({
                success: false,
                info,
                message: '⚠️ ไม่มี Admin User ID'
            });
        }
    } catch (error) {
        console.error('❌ Test LINE Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test Sheet
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
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test Email
app.get('/test-email', async (req, res) => {
    try {
        const { sendEmail } = require('./src/services/emailService');
        const result = await sendEmail({
            to: process.env.EMAIL_USER || 'test@example.com',
            subject: '🧪 ทดสอบระบบ Email',
            html: '<h1>ทดสอบสำเร็จ!</h1><p>ระบบส่ง Email ทำงานได้ถูกต้อง</p>'
        });
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test Address
app.get('/test-address', (req, res) => {
    try {
        const provinces = addressService.searchProvinces('');
        res.json({
            success: true,
            totalProvinces: provinces.length,
            sample: provinces.slice(0, 5),
            message: '✅ Address Service ทำงานปกติ'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
//  10. 404 Handler (ต้องอยู่ท้ายสุด!)
// ============================================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `ไม่พบเส้นทาง: ${req.method} ${req.url}`
    });
});

// ============================================================
//  11. Error Handler
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);

    if (err.message && err.message.includes('Not allowed by CORS')) {
        return res.status(403).json({
            success: false,
            message: 'CORS policy: ไม่อนุญาตให้เข้าถึงจากโดเมนนี้'
        });
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'ไฟล์มีขนาดเกิน 10 MB'
        });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            message: 'ฟิลด์ไฟล์ไม่ถูกต้อง'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ============================================================
//  12. Start Server
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🌐 API URL: http://localhost:${PORT}/api`);
    console.log(`❤️ Health Check: http://localhost:${PORT}/health`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 CORS Origin: ${process.env.FRONTEND_URL || 'not set'}`);
});

// ============================================================
//  13. Graceful Shutdown
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
