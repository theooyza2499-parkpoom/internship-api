const { sheets, SPREADSHEET_ID } = require('../config/google');

class SheetsService {
  // ============================================================
  //  1. อ่านข้อมูลทั้งหมดจากแผ่นงาน (แบบ Array)
  // ============================================================
  async getSheetData(range) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
      });
      return response.data.values || [];
    } catch (error) {
      console.error('Error reading sheet:', error);
      throw error;
    }
  }

  // ============================================================
  //  2. อ่านข้อมูลแบบมี Header (Object Array)
  // ============================================================
  async getSheetDataWithHeaders(range) {
    const data = await this.getSheetData(range);
    if (data.length < 2) return [];
    
    const headers = data[0];
    const rows = data.slice(1);
    
    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });
      return obj;
    });
  }

  // ============================================================
  //  3. เพิ่มข้อมูลใหม่ลงในแผ่นงาน
  // ============================================================
  async appendData(range, values) {
    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [values]
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error appending data:', error);
      throw error;
    }
  }

  // ============================================================
  //  4. อัปเดตข้อมูลในแผ่นงาน (ทั้งแถว)
  // ============================================================
  async updateData(range, values) {
    try {
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [values]
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error updating data:', error);
      throw error;
    }
  }

  // ============================================================
  //  5. อัปเดตเซลล์เดียว
  // ============================================================
  async updateCell(sheetName, row, column, value) {
    try {
      const range = `${sheetName}!${column}${row}`;
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[value]]
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error updating cell:', error);
      throw error;
    }
  }

  // ============================================================
  //  6. ลบข้อมูล (เคลียร์ช่วงข้อมูล)
  // ============================================================
  async clearData(range) {
    try {
      const response = await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
      });
      return response.data;
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  // ============================================================
  //  7. หาแถวว่างถัดไป
  // ============================================================
  async getNextEmptyRow(sheetName) {
    const data = await this.getSheetData(sheetName);
    return data.length + 1;
  }

  // ============================================================
  //  8. ค้นหาหมายเลขแถวตามรหัสนักศึกษา
  // ============================================================
  async findRowByStudentId(studentId) {
    const data = await this.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
    for (let i = 0; i < data.length; i++) {
      if (data[i][1] === studentId) { // คอลัมน์ B = รหัสนักศึกษา
        return i + 1; // +1 เพราะ Sheets เริ่มที่ 1
      }
    }
    return null;
  }

  // ============================================================
  //  9. ค้นหาหมายเลขแถวตามเลขที่คำร้อง
  // ============================================================
  async findRowByRequestNumber(requestNumber) {
    const data = await this.getSheetData('คำร้องขอฝึกประสบการณ์!A:AH');
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === requestNumber) { // คอลัมน์ A = เลขที่คำร้อง
        return i + 1;
      }
    }
    return null;
  }

  // ============================================================
  //  10. ตรวจสอบว่ามีคำร้องที่ยังไม่เสร็จสิ้นหรือไม่
  // ============================================================
  async hasIncompleteRequest(studentId) {
    const data = await this.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
    return data.some(row => 
      row['รหัสนักศึกษา'] === studentId && 
      row['สถานะ'] !== '✅ เสร็จสิ้น'
    );
  }

  // ============================================================
  //  11. ดึงข้อมูลนักศึกษาตามรหัสนักศึกษา
  // ============================================================
  async getStudentInfo(studentId) {
    const data = await this.getSheetDataWithHeaders('คำร้องขอฝึกประสบการณ์');
    const student = data.find(row => row['รหัสนักศึกษา'] === studentId);
    if (!student) return null;
    
    return {
      name: `${student['คำนำหน้า']}${student['ชื่อ']} ${student['นามสกุล']}`,
      email: student['อีเมล'] || '',
      phone: student['เบอร์โทรศัพท์'] || '',
      level: student['ระดับชั้น'] || '',
      major: student['สาขาวิชา'] || '',
      requestNumber: student['เลขที่คำร้อง'] || '',
      status: student['สถานะ'] || ''
    };
  }

  // ============================================================
  //  12. อัปเดตสถานะการแจ้งเตือน
  // ============================================================
  async updateNotificationStatus(studentId, status = 'แจ้งแล้ว') {
    const rowIndex = await this.findRowByStudentId(studentId);
    if (!rowIndex) return false;
    
    // คอลัมน์ AH = แจ้งเตือนแล้ว (33 = AH)
    await this.updateCell('คำร้องขอฝึกประสบการณ์', rowIndex, 'AH', status);
    return true;
  }
}

module.exports = new SheetsService();