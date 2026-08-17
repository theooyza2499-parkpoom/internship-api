const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const logService = require('../services/logService');
const { generateRequestNumber, validateRequest, validateFile } = require('../utils/validators');
const moment = require('moment');
const { notifyAdmins, notifyStudent, notifyAll } = require('../services/emailService');

// ============================================================
//  Line Notify Service
// ============================================================
const LINE_TOKEN = process.env.LINE_NOTIFY_TOKEN || null;

async function sendLineNotify(message) {
    if (!LINE_TOKEN) {
        console.log('⚠️ ไม่พบ LINE_NOTIFY_TOKEN ใน .env');
        return;
    }
    
    try {
        const axios = require('axios');
        await axios.post('https://notify-api.line.me/api/notify',
            `message=${encodeURIComponent(message)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${LINE_TOKEN}`
                }
            }
        );
        console.log('✅ ส่ง Line Notify สำเร็จ');
    } catch (error) {
        console.error('❌ ส่ง Line Notify ล้มเหลว:', error.response?.data?.message || error.message);
    }
}

// ============================================================
//  Helper function
// ============================================================
async function getRequestByNumber(requestNumber) {
    try {
        const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AF');
        for (const row of data) {
            if (row[0] === requestNumber) {
                return row;
            }
        }
        return null;
    } catch (error) {
        console.error('Error in getRequestByNumber:', error);
        return null;
    }
}

// ============================================================
//  RequestController Class
// ============================================================
class RequestController {
    // ==========================================================
    // 1. สร้างคำร้องใหม่
    // ==========================================================
    async createRequest(req, res) {
        try {
            const requestData = req.body;
            
            const validation = validateRequest(requestData);
            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    errors: validation.errors
                });
            }

            const hasIncomplete = await sheetsService.hasIncompleteRequest(requestData.studentId);
            if (hasIncomplete) {
                return res.status(400).json({
                    success: false,
                    message: 'มีคำร้องที่ยังไม่เสร็จสิ้นสำหรับรหัสนักศึกษานี้'
                });
            }

            const existingData = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:A');
            const count = existingData.length - 1;
            const year = moment().format('YYYY');
            const requestNumber = generateRequestNumber(year, count);

            const timestamp = moment().toISOString();
            const row = [
                requestNumber,
                requestData.studentId,
                requestData.prefix,
                requestData.firstName,
                requestData.lastName,
                requestData.phone,
                requestData.level,
                requestData.major,
                requestData.system,
                requestData.companyName,
                requestData.contactPerson,
                requestData.address.number,
                requestData.address.building,
                requestData.address.village,
                requestData.address.street,
                requestData.address.subDistrict,
                requestData.address.district,
                requestData.address.province,
                requestData.address.postalCode,
                timestamp,
                '⏳ รอจัดทำหนังสือตอบรับ',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'เปิดแก้ไข',
                year
            ];

            await sheetsService.appendData('คำร้องขอฝึกประสบการณ์!A:AF', row);

            await logService.addLog(
                requestNumber,
                'ยื่นคำร้อง',
                `นักศึกษา ${requestData.prefix}${requestData.firstName} ${requestData.lastName} (${requestData.studentId}) ยื่นคำร้องขอฝึกประสบการณ์`,
                `student-${requestData.studentId}`
            );

            // 🔔 ส่ง Line Notify
            await sendLineNotify(
                `📢 มีคำร้องใหม่!\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `📌 เลขที่: ${requestNumber}\n` +
                `👤 นักศึกษา: ${requestData.prefix}${requestData.firstName} ${requestData.lastName}\n` +
                `🆔 รหัส: ${requestData.studentId}\n` +
                `🏢 สถานที่: ${requestData.companyName}\n` +
                `📅 วันที่: ${moment().format('DD/MM/YYYY HH:mm')}\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `⏳ สถานะ: รอจัดทำหนังสือตอบรับ`
            );

            // ส่งแจ้งเตือนไป Admin
await notifyAdmins(
    '📢 มีคำร้องใหม่!',
    `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
     <p><strong>นักศึกษา:</strong> ${requestData.prefix}${requestData.firstName} ${requestData.lastName}</p>
     <p><strong>รหัสนักศึกษา:</strong> ${requestData.studentId}</p>
     <p><strong>สถานที่ฝึก:</strong> ${requestData.companyName}</p>
     <p><strong>เบอร์โทร:</strong> ${requestData.phone}</p>
     <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin.html" 
           style="background:#4f46e5;color:white;padding:8px 16px;border-radius:4px;text-decoration:none;">
           ไปที่ระบบ Admin
        </a></p>`
);

// แจ้งเตือนนักศึกษา
await notifyStudent(
    requestData.email || '',  // ต้องเพิ่มฟิลด์ email ในฟอร์ม
    `${requestData.prefix}${requestData.firstName} ${requestData.lastName}`,
    'ยื่นคำร้องสำเร็จ',
    `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
     <p><strong>สถานะ:</strong> ⏳ รอจัดทำหนังสือตอบรับ</p>
     <p>ระบบจะแจ้งเตือนเมื่อ Admin ดำเนินการแล้ว</p>`
);

            res.json({
                success: true,
                message: 'ยื่นคำร้องสำเร็จ',
                data: {
                    requestNumber,
                    status: '⏳ รอจัดทำหนังสือตอบรับ'
                }
            });
        } catch (error) {
            console.error('Create request error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการยื่นคำร้อง'
            });
        }
    }

    // ==========================================================
    // 2. ดึงข้อมูลคำร้องทั้งหมด (Admin)
    // ==========================================================
    async getAllRequests(req, res) {
        try {
            const data = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
            
            let filteredData = data;
            const { 
                studentId, name, year, date, status, major, level, 
                system, companyName 
            } = req.query;

            if (studentId) {
                filteredData = filteredData.filter(row => 
                    row['รหัสนักศึกษา'].includes(studentId)
                );
            }
            if (name) {
                filteredData = filteredData.filter(row => 
                    row['ชื่อ'].includes(name) || row['นามสกุล'].includes(name)
                );
            }
            if (year) {
                filteredData = filteredData.filter(row => 
                    row['ปีการศึกษา'] === year
                );
            }
            if (date) {
                filteredData = filteredData.filter(row => 
                    moment(row['วันที่ยื่นคำร้อง']).format('YYYY-MM-DD') === date
                );
            }
            if (status) {
                filteredData = filteredData.filter(row => 
                    row['สถานะ'] === status
                );
            }
            if (major) {
                filteredData = filteredData.filter(row => 
                    row['สาขาวิชา'] === major
                );
            }
            if (level) {
                filteredData = filteredData.filter(row => 
                    row['ระดับชั้น'] === level
                );
            }
            if (system) {
                filteredData = filteredData.filter(row => 
                    row['ระบบ'] === system
                );
            }
            if (companyName) {
                filteredData = filteredData.filter(row => 
                    row['ชื่อสถานที่ฝึกประสบการณ์'].includes(companyName)
                );
            }

            res.json({
                success: true,
                data: filteredData,
                total: filteredData.length
            });
        } catch (error) {
            console.error('Get all requests error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
            });
        }
    }

    // ==========================================================
    // 3. ดึงข้อมูลคำร้องของนักศึกษา
    // ==========================================================
    async getStudentRequests(req, res) {
        try {
            const { studentId } = req.params;
            const data = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
            
            const studentRequests = data.filter(row => 
                row['รหัสนักศึกษา'] === studentId
            );

            res.json({
                success: true,
                data: studentRequests
            });
        } catch (error) {
            console.error('Get student requests error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
            });
        }
    }

    // ==========================================================
    // 4. อัปเดตคำร้อง
    // ==========================================================
    async updateRequest(req, res) {
        try {
            const { requestNumber } = req.params;
            const updateData = req.body;
            const isAdmin = req.user && req.user.role === 'admin';

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AF');
            let rowIndex = null;
            let currentRow = null;

            for (let i = 0; i < data.length; i++) {
                if (data[i][0] === requestNumber) {
                    rowIndex = i + 1;
                    currentRow = data[i];
                    break;
                }
            }

            if (!rowIndex) {
                return res.status(404).json({
                    success: false,
                    message: 'ไม่พบคำร้องที่ต้องการ'
                });
            }

            const studentId = currentRow[1];
            if (!isAdmin && req.body.studentId && req.body.studentId !== studentId) {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่มีสิทธิ์แก้ไขคำร้องนี้'
                });
            }

            if (!isAdmin && currentRow[20] !== '⏳ รอจัดทำหนังสือตอบรับ') {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่สามารถแก้ไขข้อมูลได้ เนื่องจากอยู่ในขั้นตอนการดำเนินการแล้ว'
                });
            }

            const updatedRow = [...currentRow];
            const fields = {
                'คำนำหน้า': 2,
                'ชื่อ': 3,
                'นามสกุล': 4,
                'เบอร์โทรศัพท์': 5,
                'ระดับชั้น': 6,
                'สาขาวิชา': 7,
                'ระบบ': 8,
                'ชื่อสถานที่ฝึกประสบการณ์': 9,
                'เรียน (หัวหน้างาน)': 10,
                'ที่อยู่ (เลขที่)': 11,
                'ที่อยู่ (อาคาร)': 12,
                'ที่อยู่ (หมู่ที่)': 13,
                'ที่อยู่ (ถนน)': 14,
                'ที่อยู่ (แขวง/ตำบล)': 15,
                'ที่อยู่ (เขต/อำเภอ)': 16,
                'ที่อยู่ (จังหวัด)': 17,
                'ที่อยู่ (รหัสไปรษณีย์)': 18,
            };

            for (const [key, index] of Object.entries(fields)) {
                if (updateData[key] !== undefined) {
                    updatedRow[index] = updateData[key];
                }
            }

            const range = `คำร้องขอฝึกประสบการณ์!A${rowIndex}:AF${rowIndex}`;
            await sheetsService.updateData(range, updatedRow);

            const logDetails = isAdmin 
                ? `Admin แก้ไขข้อมูลคำร้อง ${requestNumber}`
                : `นักศึกษา ${studentId} แก้ไขข้อมูลคำร้อง`;
            
            await logService.addLog(
                requestNumber,
                'แก้ไขข้อมูล',
                logDetails,
                isAdmin ? 'admin' : `student-${studentId}`
            );

            // 🔔 ส่ง Line Notify (กรณี Admin แก้ไข)
            if (isAdmin) {
                await sendLineNotify(
                    `✏️ Admin แก้ไขข้อมูลคำร้อง\n` +
                    `━━━━━━━━━━━━━━━━━\n` +
                    `📌 เลขที่: ${requestNumber}\n` +
                    `👤 นักศึกษา: ${currentRow[2]}${currentRow[3]} ${currentRow[4]}\n` +
                    `🆔 รหัส: ${studentId}\n` +
                    `📅 เวลา: ${moment().format('DD/MM/YYYY HH:mm')}`
                );
            }

            res.json({
                success: true,
                message: 'อัปเดตข้อมูลสำเร็จ'
            });
        } catch (error) {
            console.error('Update request error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล'
            });
        }
    }

    // ==========================================================
    // 5. อัปโหลดหนังสือตอบรับ (Admin)
    // ==========================================================
    async uploadResponseLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาอัปโหลดไฟล์'
                });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    errors: fileValidation.errors
                });
            }

            const fileName = `response_letter_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(
                file.buffer,
                fileName,
                file.mimetype
            );

            const requestData = await getRequestByNumber(requestNumber);
            if (!requestData) {
                return res.status(404).json({
                    success: false,
                    message: 'ไม่พบคำร้องที่ระบุ'
                });
            }

            const rowIndex = await sheetsService.findRowByStudentId(requestData[1]);
            const timestamp = moment().toISOString();
            
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'V', uploadResult.webViewLink);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'W', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '📄 หนังสือตอบรับพร้อมดาวน์โหลด');

            await logService.addLog(
                requestNumber,
                'อัปโหลดหนังสือตอบรับ',
                `Admin อัปโหลดหนังสือตอบรับ ${fileName}`,
                'admin'
            );

            // 🔔 ส่ง Line Notify
            await notifyAdmins(
    '📄 อัปโหลดหนังสือตอบรับ',
    `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
     <p><strong>ไฟล์:</strong> ${fileName}</p>
     <p><a href="${uploadResult.webViewLink}" target="_blank">ดูไฟล์</a></p>`
);

// แจ้งนักศึกษา
const studentId = requestData[1];
const studentData = await getStudentInfo(studentId);
if (studentData) {
    await notifyStudent(
        studentData.email,
        studentData.name,
        '📄 หนังสือตอบรับพร้อมให้ดาวน์โหลด',
        `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
         <p>หนังสือตอบรับพร้อมให้ดาวน์โหลดแล้ว</p>
         <p><a href="${uploadResult.webViewLink}" target="_blank"
               style="background:#10b981;color:white;padding:8px 16px;border-radius:4px;text-decoration:none;">
               ดาวน์โหลดหนังสือตอบรับ
            </a></p>`
    );
}

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือตอบรับสำเร็จ',
                data: {
                    fileId: uploadResult.fileId,
                    link: uploadResult.webViewLink
                }
            });
        } catch (error) {
            console.error('Upload response letter error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์'
            });
        }
    }

    // ==========================================================
    // 6. อัปโหลดหนังสือตอบรับจากบริษัท (นักศึกษา)
    // ==========================================================
    async uploadCompanyResponse(req, res) {
        try {
            const { requestNumber } = req.params;
            const file = req.file;
            const { studentId } = req.body;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาอัปโหลดไฟล์'
                });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    errors: fileValidation.errors
                });
            }

            const requestData = await getRequestByNumber(requestNumber);
            if (requestData && requestData[1] !== studentId) {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่มีสิทธิ์อัปโหลดไฟล์สำหรับคำร้องนี้'
                });
            }

            const fileName = `company_response_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(
                file.buffer,
                fileName,
                file.mimetype
            );

            const rowIndex = await sheetsService.findRowByStudentId(studentId);
            const timestamp = moment().toISOString();
            
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'Y', uploadResult.webViewLink);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'Z', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AD', file.originalname);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '⏳ รอจัดทำหนังสือส่งตัว');

            await logService.addLog(
                requestNumber,
                'อัปโหลดหนังสือตอบรับจากบริษัท',
                `นักศึกษา ${studentId} อัปโหลดหนังสือตอบรับจากบริษัท ${file.originalname}`,
                `student-${studentId}`
            );

            // 🔔 ส่ง Line Notify
            await sendLineNotify(
                `📎 นักศึกษาอัปโหลดหนังสือตอบรับจากบริษัท\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `📌 เลขที่: ${requestNumber}\n` +
                `👤 นักศึกษา: ${requestData ? requestData[2] : ''}${requestData ? requestData[3] : ''} ${requestData ? requestData[4] : ''}\n` +
                `🆔 รหัส: ${studentId}\n` +
                `📎 ไฟล์: ${file.originalname}\n` +
                `📅 เวลา: ${moment().format('DD/MM/YYYY HH:mm')}\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `⏳ สถานะ: รอจัดทำหนังสือส่งตัว`
            );

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือตอบรับจากบริษัทสำเร็จ',
                data: {
                    fileId: uploadResult.fileId,
                    link: uploadResult.webViewLink
                }
            });
        } catch (error) {
            console.error('Upload company response error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์'
            });
        }
    }

    // ==========================================================
    // 7. อัปโหลดหนังสือส่งตัว (Admin)
    // ==========================================================
    async uploadReferralLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: 'กรุณาอัปโหลดไฟล์'
                });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    errors: fileValidation.errors
                });
            }

            const requestData = await getRequestByNumber(requestNumber);
            if (!requestData) {
                return res.status(404).json({
                    success: false,
                    message: 'ไม่พบคำร้องที่ระบุ'
                });
            }

            const fileName = `referral_letter_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(
                file.buffer,
                fileName,
                file.mimetype
            );

            const rowIndex = await sheetsService.findRowByStudentId(requestData[1]);
            const timestamp = moment().toISOString();
            
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AA', uploadResult.webViewLink);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AB', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '✅ พร้อมดาวน์โหลดหนังสือส่งตัว');

            await logService.addLog(
                requestNumber,
                'อัปโหลดหนังสือส่งตัว',
                `Admin อัปโหลดหนังสือส่งตัว ${fileName}`,
                'admin'
            );

            // 🔔 ส่ง Line Notify
            // หลังจากอัปเดตสำเร็จ
await notifyAdmins(
    '📋 อัปโหลดหนังสือส่งตัว',
    `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
     <p><strong>ไฟล์:</strong> ${fileName}</p>`
);

// แจ้งนักศึกษา
const studentId = requestData[1];
const studentData = await getStudentInfo(studentId);
if (studentData) {
    await notifyStudent(
        studentData.email,
        studentData.name,
        '📋 หนังสือส่งตัวพร้อมให้ดาวน์โหลด',
        `<p><strong>เลขที่คำร้อง:</strong> ${requestNumber}</p>
         <p>หนังสือส่งตัวพร้อมให้ดาวน์โหลดแล้ว</p>
         <p><a href="${uploadResult.webViewLink}" target="_blank"
               style="background:#10b981;color:white;padding:8px 16px;border-radius:4px;text-decoration:none;">
               ดาวน์โหลดหนังสือส่งตัว
            </a></p>`
    );
}

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือส่งตัวสำเร็จ',
                data: {
                    fileId: uploadResult.fileId,
                    link: uploadResult.webViewLink
                }
            });
        } catch (error) {
            console.error('Upload referral letter error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์'
            });
        }
    }

    // ==========================================================
    // 8. ดาวน์โหลดหนังสือตอบรับ (นักศึกษา)
    // ==========================================================
    async downloadResponseLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const { studentId } = req.query;

            const requestData = await getRequestByNumber(requestNumber);
            if (requestData && requestData[1] !== studentId) {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่มีสิทธิ์ดาวน์โหลดไฟล์สำหรับคำร้องนี้'
                });
            }

            const rowIndex = await sheetsService.findRowByStudentId(studentId);
            const timestamp = moment().toISOString();
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'X', timestamp);

            await logService.addLog(
                requestNumber,
                'ดาวน์โหลดหนังสือตอบรับ',
                `นักศึกษา ${studentId} ดาวน์โหลดหนังสือตอบรับ`,
                `student-${studentId}`
            );

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AF');
            const fileUrl = data[rowIndex - 1][21];

            // 🔔 ส่ง Line Notify
            await sendLineNotify(
                `📥 นักศึกษาดาวน์โหลดหนังสือตอบรับ\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `📌 เลขที่: ${requestNumber}\n` +
                `👤 นักศึกษา: ${requestData ? requestData[2] : ''}${requestData ? requestData[3] : ''} ${requestData ? requestData[4] : ''}\n` +
                `🆔 รหัส: ${studentId}\n` +
                `📅 เวลา: ${moment().format('DD/MM/YYYY HH:mm')}`
            );

            res.json({
                success: true,
                message: 'ดาวน์โหลดหนังสือตอบรับสำเร็จ',
                data: { downloadUrl: fileUrl }
            });
        } catch (error) {
            console.error('Download response letter error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์'
            });
        }
    }

    // ==========================================================
    // 9. ดาวน์โหลดหนังสือส่งตัว (นักศึกษา)
    // ==========================================================
    async downloadReferralLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const { studentId } = req.query;

            const requestData = await getRequestByNumber(requestNumber);
            if (requestData && requestData[1] !== studentId) {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่มีสิทธิ์ดาวน์โหลดไฟล์สำหรับคำร้องนี้'
                });
            }

            const rowIndex = await sheetsService.findRowByStudentId(studentId);
            const timestamp = moment().toISOString();
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AC', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '✅ เสร็จสิ้น');

            await logService.addLog(
                requestNumber,
                'ดาวน์โหลดหนังสือส่งตัว',
                `นักศึกษา ${studentId} ดาวน์โหลดหนังสือส่งตัว`,
                `student-${studentId}`
            );

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AF');
            const fileUrl = data[rowIndex - 1][26];

            // 🔔 ส่ง Line Notify
            await sendLineNotify(
                `🎉 นักศึกษาดาวน์โหลดหนังสือส่งตัว (เสร็จสิ้น)\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `📌 เลขที่: ${requestNumber}\n` +
                `👤 นักศึกษา: ${requestData ? requestData[2] : ''}${requestData ? requestData[3] : ''} ${requestData ? requestData[4] : ''}\n` +
                `🆔 รหัส: ${studentId}\n` +
                `📅 เวลา: ${moment().format('DD/MM/YYYY HH:mm')}\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `✅ กระบวนการเสร็จสมบูรณ์!`
            );

            res.json({
                success: true,
                message: 'ดาวน์โหลดหนังสือส่งตัวสำเร็จ',
                data: { downloadUrl: fileUrl }
            });
        } catch (error) {
            console.error('Download referral letter error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์'
            });
        }
    }

    // ==========================================================
    // 10. ลบคำร้อง (Admin)
    // ==========================================================
    async deleteRequest(req, res) {
        try {
            const { requestNumber } = req.params;
            const isAdmin = req.user && req.user.role === 'admin';

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AF');
            let rowIndex = null;
            let studentId = null;
            let requestData = null;

            for (let i = 0; i < data.length; i++) {
                if (data[i][0] === requestNumber) {
                    rowIndex = i + 1;
                    studentId = data[i][1];
                    requestData = data[i];
                    break;
                }
            }

            if (!rowIndex) {
                return res.status(404).json({
                    success: false,
                    message: 'ไม่พบคำร้องที่ต้องการ'
                });
            }

            if (!isAdmin) {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่มีสิทธิ์ลบคำร้อง'
                });
            }

            const range = `คำร้องขอฝึกประสบการณ์!A${rowIndex}:AF${rowIndex}`;
            await sheetsService.clearData(range);

            await logService.addLog(
                requestNumber,
                'ลบคำร้อง',
                `Admin ลบคำร้อง ${requestNumber}`,
                'admin'
            );

            // 🔔 ส่ง Line Notify
            await sendLineNotify(
                `🗑️ Admin ลบคำร้อง\n` +
                `━━━━━━━━━━━━━━━━━\n` +
                `📌 เลขที่: ${requestNumber}\n` +
                `👤 นักศึกษา: ${requestData ? requestData[2] : ''}${requestData ? requestData[3] : ''} ${requestData ? requestData[4] : ''}\n` +
                `🆔 รหัส: ${studentId}\n` +
                `📅 เวลา: ${moment().format('DD/MM/YYYY HH:mm')}`
            );

            res.json({
                success: true,
                message: 'ลบคำร้องสำเร็จ'
            });
        } catch (error) {
            console.error('Delete request error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการลบคำร้อง'
            });
        }
    }

    // ==========================================================
    // 11. ดึง Dashboard Stats (Admin)
    // ==========================================================
    async getDashboardStats(req, res) {
        try {
            const data = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
            
            const stats = {
                total: data.length,
                waitingResponse: data.filter(row => row['สถานะ'] === '⏳ รอจัดทำหนังสือตอบรับ').length,
                waitingReferral: data.filter(row => row['สถานะ'] === '⏳ รอจัดทำหนังสือส่งตัว').length,
                completed: data.filter(row => row['สถานะ'] === '✅ เสร็จสิ้น').length,
                byMajor: {},
                byLevel: {}
            };

            const majorCount = {};
            const levelCount = {};
            data.forEach(row => {
                const major = row['สาขาวิชา'];
                const level = row['ระดับชั้น'];
                majorCount[major] = (majorCount[major] || 0) + 1;
                levelCount[level] = (levelCount[level] || 0) + 1;
            });
            stats.byMajor = majorCount;
            stats.byLevel = levelCount;

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            res.status(500).json({
                success: false,
                message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ'
            });
        }
    }

 
}

   // เพิ่มฟังก์ชันนี้ใน requestController.js (ข้างนอก class หรือใน class)
async function getStudentInfo(studentId) {
    try {
        const data = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
        const student = data.find(row => row['รหัสนักศึกษา'] === studentId);
        if (!student) return null;
        return {
            name: `${student['คำนำหน้า']}${student['ชื่อ']} ${student['นามสกุล']}`,
            email: student['อีเมล'] || ''  // ต้องมีฟิลด์อีเมลใน Google Sheets
        };
    } catch (error) {
        console.error('Error getting student info:', error);
        return null;
    }
}

// ============================================================
//  ส่งออก Controller
// ============================================================
module.exports = new RequestController();