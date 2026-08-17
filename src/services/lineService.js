const axios = require('axios');

const LINE_TOKEN = process.env.LINE_NOTIFY_TOKEN || 'YOUR_LINE_TOKEN';

async function sendLineNotify(message) {
    try {
        await axios.post('https://notify-api.line.me/api/notify',
            `message=${encodeURIComponent(message)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${LINE_TOKEN}`
                }
            }
        );
        console.log('✅ Line Notify sent');
    } catch (error) {
        console.error('❌ Line Notify error:', error.message);
    }
}

module.exports = { sendLineNotify };