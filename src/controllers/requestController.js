const sheetsService = require('../services/sheetsService');
const driveService = require('../services/driveService');
const logService = require('../services/logService');
const { generateRequestNumber, validateRequest, validateFile } = require('../utils/validators');
const moment = require('moment');

// ============================================================
//  LINE Service (Optional - ถ้ามี)
// ============================================================
let lineService = null;
try {
    lineService = require('../services/lineService');
    console.log('✅ โหลด lineService สำเร็จ');
} catch (error) {
    console.warn('⚠️ ไม่พบ lineService - ข้ามการแจ้งเตือน LINE');
}

// ============================================================
//  Helper Functions
// ============================================================
async function getRequestByNumber(requestNumber) {
    try {
        const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
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
                '⏳ รอจัดทำหนังสือขอความอนุเคราะห์',
                '', '', '', '', '', '', '', '', '',
                'เปิดแก้ไข',
                year,
                requestData.email || '',
                'ยังไม่แจ้ง'
            ];

            await sheetsService.appendData('คำร้องขอฝึกประสบการณ์!A:AH', row);

            await logService.addLog(
                requestNumber,
                'ยื่นคำร้อง',
                `นักศึกษา ${requestData.prefix}${requestData.firstName} ${requestData.lastName} (${requestData.studentId}) ยื่นคำร้อง`,
                `student-${requestData.studentId}`
            );

            // ✅ ตอบกลับทันที
            res.json({
                success: true,
                message: 'ยื่นคำร้องสำเร็จ',
                data: {
                    requestNumber,
                    status: '⏳ รอจัดทำหนังสือขอความอนุเคราะห์'
                }
            });

            // ✅ แจ้งเตือน LINE (Background)
            if (lineService) {
                lineService.notifyAdminNewRequest({
                    requestNumber,
                    prefix: requestData.prefix,
                    firstName: requestData.firstName,
                    lastName: requestData.lastName,
                    studentId: requestData.studentId,
                    companyName: requestData.companyName
                }).catch(err => console.error('❌ LINE notify error:', err.message));
            }

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
            const { studentId, name, year, date, status, major, level, system, companyName } = req.query;

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
                filteredData = filteredData.filter(row => row['ปีการศึกษา'] === year);
            }
            if (date) {
                filteredData = filteredData.filter(row => 
                    moment(row['วันที่ยื่นคำร้อง']).format('YYYY-MM-DD') === date
                );
            }
            if (status) {
                filteredData = filteredData.filter(row => row['สถานะ'] === status);
            }
            if (major) {
                filteredData = filteredData.filter(row => row['สาขาวิชา'] === major);
            }
            if (level) {
                filteredData = filteredData.filter(row => row['ระดับชั้น'] === level);
            }
            if (system) {
                filteredData = filteredData.filter(row => row['ระบบ'] === system);
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

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
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
            if (!isAdmin && currentRow[20] !== '⏳ รอจัดทำหนังสือขอความอนุเคราะห์') {
                return res.status(403).json({
                    success: false,
                    message: 'ไม่สามารถแก้ไขข้อมูลได้ เนื่องจากอยู่ในขั้นตอนการดำเนินการแล้ว'
                });
            }

            const updatedRow = [...currentRow];
            const fields = {
                'คำนำหน้า': 2, 'ชื่อ': 3, 'นามสกุล': 4, 'เบอร์โทรศัพท์': 5,
                'ระดับชั้น': 6, 'สาขาวิชา': 7, 'ระบบ': 8,
                'ชื่อสถานที่ฝึกประสบการณ์': 9, 'เรียน (หัวหน้างาน)': 10,
                'ที่อยู่ (เลขที่)': 11, 'ที่อยู่ (อาคาร)': 12, 'ที่อยู่ (หมู่ที่)': 13,
                'ที่อยู่ (ถนน)': 14, 'ที่อยู่ (แขวง/ตำบล)': 15,
                'ที่อยู่ (เขต/อำเภอ)': 16, 'ที่อยู่ (จังหวัด)': 17,
                'ที่อยู่ (รหัสไปรษณีย์)': 18
            };

            for (const [key, index] of Object.entries(fields)) {
                if (updateData[key] !== undefined) {
                    updatedRow[index] = updateData[key];
                }
            }

            const range = `คำร้องขอฝึกประสบการณ์!A${rowIndex}:AH${rowIndex}`;
            await sheetsService.updateData(range, updatedRow);

            await logService.addLog(
                requestNumber,
                'แก้ไขข้อมูล',
                isAdmin ? `Admin แก้ไขข้อมูล ${requestNumber}` : `นักศึกษา ${studentId} แก้ไขข้อมูล`,
                isAdmin ? 'admin' : `student-${studentId}`
            );

            res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
        } catch (error) {
            console.error('Update request error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
        }
    }

    // ==========================================================
    // 5. อัปโหลดหนังสือขอความอนุเคราะห์ (Admin)
    // ==========================================================
    async uploadResponseLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดไฟล์' });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({ success: false, errors: fileValidation.errors });
            }

            const fileName = `response_letter_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(file.buffer, fileName, file.mimetype);

            const requestData = await getRequestByNumber(requestNumber);
            if (!requestData) {
                return res.status(404).json({ success: false, message: 'ไม่พบคำร้อง' });
            }

            const rowIndex = await sheetsService.findRowByStudentId(requestData[1]);
            const timestamp = moment().toISOString();

            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'V', uploadResult.webViewLink);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'W', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '📄 หนังสือขอความอนุเคราะห์พร้อมดาวน์โหลด');

            await logService.addLog(
                requestNumber,
                'อัปโหลดหนังสือขอความอนุเคราะห์',
                `Admin อัปโหลดหนังสือขอความอนุเคราะห์ ${fileName}`,
                'admin'
            );

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือขอความอนุเคราะห์สำเร็จ',
                data: { fileId: uploadResult.fileId, link: uploadResult.webViewLink }
            });

            // ✅ แจ้งเตือนนักศึกษา LINE
            if (lineService) {
                const studentName = `${requestData[2]}${requestData[3]} ${requestData[4]}`;
                lineService.notifyStudentReady(
                    requestData[1],
                    studentName,
                    requestNumber,
                    'response'
                ).catch(err => console.error('❌ LINE notify student error:', err.message));
            }

        } catch (error) {
            console.error('Upload response letter error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
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
                return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดไฟล์' });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({ success: false, errors: fileValidation.errors });
            }

            const requestData = await getRequestByNumber(requestNumber);
            if (requestData && requestData[1] !== studentId) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์' });
            }

            const fileName = `company_response_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(file.buffer, fileName, file.mimetype);

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

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือตอบรับจากบริษัทสำเร็จ',
                data: { fileId: uploadResult.fileId, link: uploadResult.webViewLink }
            });

            // ✅ แจ้งเตือน Admin LINE
            if (lineService && requestData) {
                lineService.notifyAdminStudentUpload({
                    requestNumber,
                    prefix: requestData[2],
                    firstName: requestData[3],
                    lastName: requestData[4],
                    studentId: requestData[1],
                    companyName: requestData[9]
                }).catch(err => console.error('❌ LINE notify admin error:', err.message));
            }

        } catch (error) {
            console.error('Upload company response error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
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
                return res.status(400).json({ success: false, message: 'กรุณาอัปโหลดไฟล์' });
            }

            const fileValidation = validateFile(file);
            if (!fileValidation.isValid) {
                return res.status(400).json({ success: false, errors: fileValidation.errors });
            }

            const requestData = await getRequestByNumber(requestNumber);
            if (!requestData) {
                return res.status(404).json({ success: false, message: 'ไม่พบคำร้อง' });
            }

            const fileName = `referral_letter_${requestNumber}.pdf`;
            const uploadResult = await driveService.uploadFile(file.buffer, fileName, file.mimetype);

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

            res.json({
                success: true,
                message: 'อัปโหลดหนังสือส่งตัวสำเร็จ',
                data: { fileId: uploadResult.fileId, link: uploadResult.webViewLink }
            });

            // ✅ แจ้งเตือนนักศึกษา LINE
            if (lineService) {
                const studentName = `${requestData[2]}${requestData[3]} ${requestData[4]}`;
                lineService.notifyStudentReady(
                    requestData[1],
                    studentName,
                    requestNumber,
                    'referral'
                ).catch(err => console.error('❌ LINE notify student error:', err.message));
            }

        } catch (error) {
            console.error('Upload referral letter error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
        }
    }

    // ==========================================================
    // 8. ดาวน์โหลดหนังสือขอความอนุเคราะห์ (นักศึกษา)
    // ==========================================================
    async downloadResponseLetter(req, res) {
        try {
            const { requestNumber } = req.params;
            const { studentId } = req.query;

            const requestData = await getRequestByNumber(requestNumber);
            if (requestData && requestData[1] !== studentId) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์' });
            }

            const rowIndex = await sheetsService.findRowByStudentId(studentId);
            const timestamp = moment().toISOString();
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'X', timestamp);

            await logService.addLog(
                requestNumber,
                'ดาวน์โหลดหนังสือขอความอนุเคราะห์',
                `นักศึกษา ${studentId} ดาวน์โหลด`,
                `student-${studentId}`
            );

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
            const fileUrl = data[rowIndex - 1][21];

            res.json({
                success: true,
                message: 'ดาวน์โหลดหนังสือขอความอนุเคราะห์สำเร็จ',
                data: { downloadUrl: fileUrl }
            });
        } catch (error) {
            console.error('Download error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
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
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์' });
            }

            const rowIndex = await sheetsService.findRowByStudentId(studentId);
            const timestamp = moment().toISOString();
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AC', timestamp);
            await sheetsService.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'U', '✅ เสร็จสิ้น');

            await logService.addLog(
                requestNumber,
                'ดาวน์โหลดหนังสือส่งตัว',
                `นักศึกษา ${studentId} ดาวน์โหลด`,
                `student-${studentId}`
            );

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
            const fileUrl = data[rowIndex - 1][26];

            res.json({
                success: true,
                message: 'ดาวน์โหลดหนังสือส่งตัวสำเร็จ',
                data: { downloadUrl: fileUrl }
            });
        } catch (error) {
            console.error('Download error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
        }
    }

    // ==========================================================
    // 10. ลบคำร้อง (Admin)
    // ==========================================================
    async deleteRequest(req, res) {
        try {
            const { requestNumber } = req.params;
            const isAdmin = req.user && req.user.role === 'admin';

            if (!isAdmin) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบ' });
            }

            const data = await sheetsService.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
            let rowIndex = null;

            for (let i = 0; i < data.length; i++) {
                if (data[i][0] === requestNumber) {
                    rowIndex = i + 1;
                    break;
                }
            }

            if (!rowIndex) {
                return res.status(404).json({ success: false, message: 'ไม่พบคำร้อง' });
            }

            const range = `คำร้องขอฝึกประสบการณ์!A${rowIndex}:AH${rowIndex}`;
            await sheetsService.clearData(range);

            await logService.addLog(requestNumber, 'ลบคำร้อง', `Admin ลบ ${requestNumber}`, 'admin');

            res.json({ success: true, message: 'ลบคำร้องสำเร็จ' });
        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
        }
    }

    // ==========================================================
    // 11. Dashboard Stats (Admin)
    // ==========================================================
    async getDashboardStats(req, res) {
        try {
            const data = await sheetsService.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');

            const stats = {
                total: data.length,
                waitingResponse: data.filter(row => row['สถานะ'] === '⏳ รอจัดทำหนังสือขอความอนุเคราะห์').length,
                waitingReferral: data.filter(row => row['สถานะ'] === '⏳ รอจัดทำหนังสือส่งตัว').length,
                completed: data.filter(row => row['สถานะ'] === '✅ เสร็จสิ้น').length,
                byMajor: {},
                byLevel: {}
            };

            const majorCount = {};
            const level
