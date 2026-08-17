const nodemailer = require('nodemailer');
require('dotenv').config();

// ============================================================
//  ตั้งค่า Transporter (ใช้ Gmail SMTP)
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,      // อีเมลที่ใช้ส่ง (เช่น your-email@gmail.com)
        pass: process.env.EMAIL_PASSWORD   // รหัสผ่าน หรือ App Password
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ============================================================
//  ฟังก์ชันส่ง Email
// ============================================================
async function sendEmail({ to, subject, html, text }) {
    try {
        const mailOptions = {
            from: `"ระบบฝึกประสบการณ์" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text || '',
            html: html || text || ''
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ ส่ง Email ไปยัง ${to} สำเร็จ`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ ส่ง Email ล้มเหลว:', error.message);
        return { success: false, error: error.message };
    }
}

// ============================================================
//  ฟังก์ชันแจ้งเตือน Admin (อีเมลเดียว หรือหลายอีเมล)
// ============================================================
async function notifyAdmins(subject, message) {
    const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
    
    if (adminEmails.length === 0) {
        console.warn('⚠️ ไม่มีอีเมล Admin ใน .env');
        return;
    }

    const emailPromises = adminEmails.map(email => 
        sendEmail({
            to: email.trim(),
            subject: `🔔 [Admin] ${subject}`,
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4f46e5;">📢 แจ้งเตือนจากระบบฝึกประสบการณ์</h2>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #4f46e5;">
                        ${message}
                    </div>
                    <p style="color: #6b7280; font-size: 0.9rem; margin-top: 20px;">
                        ระบบแจ้งเตือนอัตโนมัติ • ${new Date().toLocaleString('th-TH')}
                    </p>
                </div>`
        })
    );

    await Promise.all(emailPromises);
}

// ============================================================
//  ฟังก์ชันแจ้งเตือนนักศึกษา (ส่งรายบุคคล)
// ============================================================
async function notifyStudent(studentEmail, studentName, subject, message) {
    if (!studentEmail) {
        console.warn(`⚠️ ไม่มีอีเมลของนักศึกษา ${studentName}`);
        return;
    }

    return await sendEmail({
        to: studentEmail,
        subject: `📋 [ระบบฝึกประสบการณ์] ${subject}`,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">สวัสดีคุณ ${studentName}</h2>
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #4f46e5;">
                    ${message}
                </div>
                <p style="color: #6b7280; font-size: 0.9rem; margin-top: 20px;">
                    ระบบแจ้งเตือนอัตโนมัติ • ${new Date().toLocaleString('th-TH')}
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0;">
                <p style="color: #94a3b8; font-size: 0.8rem;">
                    หากมีข้อสงสัย กรุณาติดต่อฝ่ายวิชาการ
                </p>
            </div>`
    });
}

// ============================================================
//  ฟังก์ชันแจ้งเตือนแบบสรุป (ส่งให้นักศึกษาและ Admin พร้อมกัน)
// ============================================================
async function notifyAll(studentEmail, studentName, adminSubject, studentSubject, message) {
    // ส่งให้นักศึกษา
    await notifyStudent(studentEmail, studentName, studentSubject, message);
    
    // ส่งให้ Admin
    await notifyAdmins(adminSubject, 
        `<p><strong>นักศึกษา:</strong> ${studentName}</p>
         <p><strong>อีเมล:</strong> ${studentEmail}</p>
         ${message}`
    );
}

module.exports = {
    sendEmail,
    notifyAdmins,
    notifyStudent,
    notifyAll
};