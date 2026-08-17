const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

const auth = (req, res, next) => {
  try {
    // ดึง token จาก header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'ไม่พบ Token กรุณาเข้าสู่ระบบ'
      });
    }

    // ตรวจสอบ token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token ไม่ถูกต้องหรือหมดอายุ'
    });
  }
};

// ตรวจสอบว่าเป็น Admin
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'ไม่มีสิทธิ์เข้าถึง เฉพาะ Admin เท่านั้น'
    });
  }
  next();
};

module.exports = { auth, adminOnly };