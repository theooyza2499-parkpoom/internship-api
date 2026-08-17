const multer = require('multer');
const path = require('path');

// ตั้งค่า storage
const storage = multer.memoryStorage();

// ตรวจสอบไฟล์
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const maxSize = 10 * 1024 * 1024; // 10 MB

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('กรุณาอัปโหลดไฟล์ PDF, JPG หรือ PNG เท่านั้น'), false);
  }

  if (file.size > maxSize) {
    return cb(new Error('ไฟล์มีขนาดเกิน 10 MB'), false);
  }

  cb(null, true);
};

// สร้าง multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

// Middleware สำหรับอัปโหลดไฟล์เดียว
const uploadSingle = (fieldName) => {
  return upload.single(fieldName);
};

// Middleware สำหรับอัปโหลดหลายไฟล์
const uploadMultiple = (fieldName, maxCount) => {
  return upload.array(fieldName, maxCount);
};

module.exports = { uploadSingle, uploadMultiple };