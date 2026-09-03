const fs = require('fs');
const path = require('path');

// โหลดข้อมูลที่อยู่
const addressDataPath = path.join(__dirname, '../data/thai-address.json');
let addressData = [];

try {
  const rawData = fs.readFileSync(addressDataPath, 'utf8');
  addressData = JSON.parse(rawData);
  console.log(`✅ โหลดข้อมูลที่อยู่สำเร็จ: ${addressData.length} รายการ`);
} catch (error) {
  console.error('❌ โหลดข้อมูลที่อยู่ล้มเหลว:', error.message);
}

// ============================================================
//  ฟังก์ชันค้นหา
// ============================================================

/**
 * ค้นหาจังหวัด (unique)
 */
function searchProvinces(keyword = '') {
  const provinces = [...new Set(addressData.map(item => item.province))];
  if (!keyword) return provinces;
  return provinces.filter(p => p.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * ค้นหาอำเภอตามจังหวัด
 */
function searchDistricts(province, keyword = '') {
  let districts = addressData
    .filter(item => item.province === province)
    .map(item => item.amphoe);
  districts = [...new Set(districts)];
  if (!keyword) return districts;
  return districts.filter(d => d.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * ค้นหาตำบลตามจังหวัดและอำเภอ
 */
function searchSubDistricts(province, district, keyword = '') {
  let subDistricts = addressData
    .filter(item => item.province === province && item.amphoe === district)
    .map(item => item.district);
  subDistricts = [...new Set(subDistricts)];
  if (!keyword) return subDistricts;
  return subDistricts.filter(s => s.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * ค้นหารหัสไปรษณีย์ตามจังหวัด อำเภอ ตำบล
 */
function getPostalCode(province, district, subDistrict) {
  const found = addressData.find(
    item => item.province === province && 
             item.amphoe === district && 
             item.district === subDistrict
  );
  return found ? found.zipcode : null;
}

/**
 * ค้นหาแบบเต็ม (ใช้คำค้นเดียว)
 */
function searchAll(keyword) {
  const lowerKeyword = keyword.toLowerCase();
  return addressData.filter(item => 
    item.province.toLowerCase().includes(lowerKeyword) ||
    item.amphoe.toLowerCase().includes(lowerKeyword) ||
    item.district.toLowerCase().includes(lowerKeyword) ||
    String(item.zipcode).includes(keyword)
  );
}

/**
 * แปลงข้อมูลให้อยู่ในรูปแบบที่ใช้ใน Dropdown
 */
function formatAddressOptions(items) {
  return items.map(item => ({
    value: item.district,
    label: `${item.district} - ${item.amphoe} - ${item.province} (${item.zipcode})`
  }));
}

module.exports = {
  addressData,
  searchProvinces,
  searchDistricts,
  searchSubDistricts,
  getPostalCode,
  searchAll,
  formatAddressOptions
};
