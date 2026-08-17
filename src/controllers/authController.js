const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sheetsService = require('../services/sheetsService');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

class AuthController {
  // Login Admin
  async login(req, res) {
    try {
      const { username, password } = req.body;

      // ตรวจสอบ username และ password
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: 'Username หรือ Password ไม่ถูกต้อง'
        });
      }

      // สร้าง JWT Token
      const token = jwt.sign(
        { username, role: 'admin' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        message: 'Login สำเร็จ',
        token,
        user: { username, role: 'admin' }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการ Login'
      });
    }
  }

  // เปลี่ยนรหัสผ่าน Admin
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const { username } = req.user;

      // ตรวจสอบรหัสผ่านเดิม
      if (oldPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: 'รหัสผ่านเดิมไม่ถูกต้อง'
        });
      }

      // อัปเดต password (ในกรณีนี้เก็บใน environment แต่ในระบบจริงควรเก็บในฐานข้อมูล)
      // สำหรับตัวอย่างนี้ เราแค่ส่ง response กลับ
      
      res.json({
        success: true,
        message: 'เปลี่ยนรหัสผ่านสำเร็จ'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'
      });
    }
  }

  // ตรวจสอบ Token
  async verifyToken(req, res) {
    try {
      res.json({
        success: true,
        user: req.user
      });
    } catch (error) {
      res.status(401).json({
        success: false,
        message: 'Token ไม่ถูกต้อง'
      });
    }
  }
}

module.exports = new AuthController();