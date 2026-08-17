const sheetsService = require('../services/sheetsService');
const moment = require('moment');

class AnnouncementController {
  // สร้างประกาศใหม่ (Admin)
  async createAnnouncement(req, res) {
    try {
      const { title, description, expiryDate, isActive } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกหัวข้อและรายละเอียดประกาศ'
        });
      }

      const timestamp = moment().toISOString();
      const row = [
        Date.now().toString(), // ID
        title,
        description,
        timestamp,
        expiryDate || '',
        isActive ? 'เปิด' : 'ปิด'
      ];

      await sheetsService.appendData('การแจ้งเตือน!A:F', row);

      res.json({
        success: true,
        message: 'สร้างประกาศสำเร็จ'
      });
    } catch (error) {
      console.error('Create announcement error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการสร้างประกาศ'
      });
    }
  }

  // ดึงประกาศที่ยังเปิดใช้งาน
  async getActiveAnnouncements(req, res) {
    try {
      const data = await sheetsService.getSheetDataWithHeaders('การแจ้งเตือน');
      const now = moment().toISOString();
      
      const activeAnnouncements = data.filter(row => {
        if (row['สถานะ'] !== 'เปิด') return false;
        if (row['วันหมดอายุ'] && moment(row['วันหมดอายุ']).isBefore(now)) return false;
        return true;
      });

      res.json({
        success: true,
        data: activeAnnouncements
      });
    } catch (error) {
      console.error('Get active announcements error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประกาศ'
      });
    }
  }

  // ดึงประกาศทั้งหมด (Admin)
  async getAllAnnouncements(req, res) {
    try {
      const data = await sheetsService.getSheetDataWithHeaders('การแจ้งเตือน');
      
      res.json({
        success: true,
        data: data
      });
    } catch (error) {
      console.error('Get all announcements error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประกาศ'
      });
    }
  }

  // อัปเดตประกาศ (Admin)
  async updateAnnouncement(req, res) {
    try {
      const { announcementId } = req.params;
      const { title, description, expiryDate, isActive } = req.body;

      // ค้นหาข้อมูลประกาศ
      const data = await sheetsService.getSheetData('การแจ้งเตือน!A:F');
      let rowIndex = null;

      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === announcementId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (!rowIndex) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบประกาศที่ต้องการ'
        });
      }

      // อัปเดตข้อมูล
      const updatedRow = [
        announcementId,
        title || data[rowIndex - 1][1],
        description || data[rowIndex - 1][2],
        data[rowIndex - 1][3], // วันที่ประกาศเดิม
        expiryDate || data[rowIndex - 1][4],
        isActive ? 'เปิด' : 'ปิด'
      ];

      const range = `การแจ้งเตือน!A${rowIndex}:F${rowIndex}`;
      await sheetsService.updateData(range, updatedRow);

      res.json({
        success: true,
        message: 'อัปเดตประกาศสำเร็จ'
      });
    } catch (error) {
      console.error('Update announcement error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการอัปเดตประกาศ'
      });
    }
  }

  // ลบประกาศ (Admin)
  async deleteAnnouncement(req, res) {
    try {
      const { announcementId } = req.params;

      const data = await sheetsService.getSheetData('การแจ้งเตือน!A:F');
      let rowIndex = null;

      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === announcementId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (!rowIndex) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบประกาศที่ต้องการ'
        });
      }

      const range = `การแจ้งเตือน!A${rowIndex}:F${rowIndex}`;
      await sheetsService.clearData(range);

      res.json({
        success: true,
        message: 'ลบประกาศสำเร็จ'
      });
    } catch (error) {
      console.error('Delete announcement error:', error);
      res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการลบประกาศ'
      });
    }
  }
}

module.exports = new AnnouncementController();