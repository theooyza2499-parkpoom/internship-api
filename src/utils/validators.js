const moment = require('moment');

// สร้างเลขที่คำร้อง
const generateRequestNumber = (year, count) => {
  const seq = String(count + 1).padStart(3, '0');
  return `REQ-${year}-${seq}`;
};

// ตรวจสอบข้อมูลคำร้อง
const validateRequest = (data) => {
  const errors = [];
  
  // ตรวจสอบรหัสนักศึกษา
  if (!data.studentId || data.studentId.length < 8) {
    errors.push('รหัสนักศึกษาต้องมีอย่างน้อย 8 ตัวอักษร');
  }
  
  // ตรวจสอบชื่อ-นามสกุล
  if (!data.firstName || data.firstName.length < 2) {
    errors.push('กรุณากรอกชื่อ');
  }
  if (!data.lastName || data.lastName.length < 2) {
    errors.push('กรุณากรอกนามสกุล');
  }
  
  // ตรวจสอบเบอร์โทรศัพท์
  if (!data.phone || !/^[0-9]{10}$/.test(data.phone)) {
    errors.push('กรุณากรอกเบอร์โทรศัพท์ 10 หลัก');
  }
  
  // ตรวจสอบระดับชั้น
  const validLevels = ['ปวช.ปีที่ 2', 'ปวช.ปีที่ 3', 'ปวส.ปีที่ 2'];
  if (!data.level || !validLevels.includes(data.level)) {
    errors.push('กรุณาเลือกระดับชั้นให้ถูกต้อง');
  }
  
  // ตรวจสอบสาขาวิชา
  const validMajors = [
    'เทคโนโลยีธุรกิจดิจิทัล', 'การบัญชี', 'การตลาด', 
    'ธุรกิจสถานพยาบาล', 'ช่างยนต์', 'ธุรกิจค้าปลีก'
  ];
  if (!data.major || !validMajors.includes(data.major)) {
    errors.push('กรุณาเลือกสาขาวิชาให้ถูกต้อง');
  }
  
  // ตรวจสอบระบบ
  const validSystems = ['นักศึกษาภาคเช้า', 'นักศึกษาภาคบ่าย'];
  if (!data.system || !validSystems.includes(data.system)) {
    errors.push('กรุณาเลือกระบบให้ถูกต้อง');
  }
  
  // ตรวจสอบชื่อสถานที่
  if (!data.companyName || data.companyName.length < 3) {
    errors.push('กรุณากรอกชื่อสถานที่ฝึกประสบการณ์');
  }
  
  // ตรวจสอบที่อยู่
  if (!data.address || !data.address.number || !data.address.subDistrict || 
      !data.address.district || !data.address.province || !data.address.postalCode) {
    errors.push('กรุณากรอกที่อยู่ให้ครบถ้วน');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// ตรวจสอบไฟล์
const validateFile = (file) => {
  const errors = [];
  const maxSize = 10 * 1024 * 1024; // 10 MB
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  
  if (!file) {
    errors.push('กรุณาอัปโหลดไฟล์');
  } else {
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push('ไฟล์ต้องเป็น PDF, JPG หรือ PNG เท่านั้น');
    }
    if (file.size > maxSize) {
      errors.push('ไฟล์มีขนาดเกิน 10 MB');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// ตรวจสอบสถานะ
const getStatusIcon = (status) => {
  const statusMap = {
    '⏳ รอจัดทำหนังสือตอบรับ': '⏳',
    '📄 หนังสือตอบรับพร้อมดาวน์โหลด': '📄',
    '⏳ รอจัดทำหนังสือส่งตัว': '⏳',
    '✅ พร้อมดาวน์โหลดหนังสือส่งตัว': '✅',
    '✅ เสร็จสิ้น': '✅'
  };
  return statusMap[status] || '⏳';
};

// ตรวจสอบว่านักศึกษาสามารถแก้ไขข้อมูลได้หรือไม่
const canEdit = (status) => {
  return status === '⏳ รอจัดทำหนังสือตอบรับ';
};

module.exports = {
  generateRequestNumber,
  validateRequest,
  validateFile,
  getStatusIcon,
  canEdit
};