const { google } = require('googleapis');
const { Readable } = require('stream');
const { getOAuthClient } = require('../config/oauth');
const { DRIVE_FOLDER_ID } = require('../config/google');

// แทนที่การใช้ auth แบบ Service Account
// มาเป็น OAuth 2.0 แบบ Dynamic
let driveInstance = null;
let oAuthClient = null;

/**
 * ฟังก์ชันสำหรับ获取 Drive Instance (พร้อม OAuth)
 */
async function getDrive() {
  if (!driveInstance || !oAuthClient) {
    try {
      oAuthClient = await getOAuthClient();
      driveInstance = google.drive({ version: 'v3', auth: oAuthClient });
    } catch (error) {
      console.error('❌ ไม่สามารถเชื่อมต่อ OAuth:', error.message);
      throw new Error('ไม่สามารถเชื่อมต่อกับ Google Drive ด้วย OAuth');
    }
  }
  return driveInstance;
}

class DriveService {
  // อัปโหลดไฟล์ไปยัง Google Drive (ใช้ OAuth)
  async uploadFile(fileBuffer, fileName, mimeType, folderId = DRIVE_FOLDER_ID) {
    try {
      console.log(`📁 กำลังอัปโหลดไฟล์: ${fileName}`);
      console.log(`📂 ไปยังโฟลเดอร์: ${folderId || 'My Drive'}`);

      const drive = await getDrive();

      // สร้าง stream จาก buffer
      const bufferStream = new Readable();
      bufferStream.push(fileBuffer);
      bufferStream.push(null);

      // เตรียม metadata
      const fileMetadata = {
        name: fileName,
      };

      // ถ้ามี folderId ให้ระบุ parents
      if (folderId) {
        fileMetadata.parents = [folderId];
      }

      const media = {
        mimeType: mimeType || 'application/pdf',
        body: bufferStream,
      };

      // อัปโหลดไฟล์
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink',
      });

      console.log('✅ อัปโหลดสำเร็จ! File ID:', response.data.id);

      // ตั้งค่าการแชร์ไฟล์ (ให้ผู้อื่นดูได้)
      try {
        await drive.permissions.create({
          fileId: response.data.id,
          resource: {
            type: 'anyone',
            role: 'reader',
          },
        });
        console.log('🔓 ตั้งค่าการแชร์ไฟล์เรียบร้อย');
      } catch (permError) {
        console.log('⚠️ ไม่สามารถตั้งค่าการแชร์ไฟล์ (แต่อัปโหลดสำเร็จ)');
      }

      return {
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink,
        directDownloadLink: `https://drive.google.com/uc?export=download&id=${response.data.id}`
      };
    } catch (error) {
      console.error('❌ Error uploading file:', error);
      
      // ถ้าเป็น error เกี่ยวกับ OAuth ให้แจ้งผู้ใช้
      if (error.message && error.message.includes('OAuth')) {
        throw new Error('⚠️ ปัญหาเกี่ยวกับ OAuth กรุณาล็อกอินใหม่');
      }
      
      throw error;
    }
  }

  // ลบไฟล์
  async deleteFile(fileId) {
    try {
      const drive = await getDrive();
      const response = await drive.files.delete({ fileId: fileId });
      console.log(`🗑️ ลบไฟล์ ${fileId} สำเร็จ`);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting file:', error);
      throw error;
    }
  }

  // สร้างโฟลเดอร์
  async createFolder(folderName, parentId = DRIVE_FOLDER_ID) {
    try {
      const drive = await getDrive();
      
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      
      if (parentId) {
        fileMetadata.parents = [parentId];
      }

      const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, webViewLink',
      });

      console.log(`📁 สร้างโฟลเดอร์ ${folderName} สำเร็จ`);
      return {
        folderId: response.data.id,
        webViewLink: response.data.webViewLink,
      };
    } catch (error) {
      console.error('❌ Error creating folder:', error);
      throw error;
    }
  }

  // รับข้อมูลไฟล์
  async getFileInfo(fileId) {
    try {
      const drive = await getDrive();
      const response = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, size, webViewLink, createdTime, modifiedTime',
      });
      return response.data;
    } catch (error) {
      console.error('❌ Error getting file info:', error);
      throw error;
    }
  }
}

module.exports = new DriveService();