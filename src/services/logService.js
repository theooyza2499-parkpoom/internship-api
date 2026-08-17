const sheetsService = require('./sheetsService');

class LogService {
  // บันทึกประวัติการแก้ไข
  async addLog(requestId, action, details, user) {
    try {
      const timestamp = new Date().toISOString();
      const values = [
        requestId,              // เลขที่คำร้อง
        timestamp,              // วันที่-เวลา
        user,                   // ผู้กระทำ
        action,                 // การกระทำ
        details                 // รายละเอียดเพิ่มเติม
      ];
      
      await sheetsService.appendData('ประวัติการแก้ไข!A:E', values);
      return true;
    } catch (error) {
      console.error('Error adding log:', error);
      throw error;
    }
  }

  // ดึงประวัติของคำร้อง
  async getLogsByRequestId(requestId) {
    try {
      const data = await sheetsService.getSheetDataWithHeaders('ประวัติการแก้ไข');
      return data.filter(row => row['เลขที่คำร้อง'] === requestId);
    } catch (error) {
      console.error('Error getting logs:', error);
      throw error;
    }
  }

  // ดึงประวัติทั้งหมด
  async getAllLogs() {
    try {
      return await sheetsService.getSheetDataWithHeaders('ประวัติการแก้ไข');
    } catch (error) {
      console.error('Error getting all logs:', error);
      throw error;
    }
  }
}

module.exports = new LogService();