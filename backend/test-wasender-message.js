require('dotenv').config();
const whatsappService = require('./services/whatsappServiceWaSender');

async function sendTestMessage() {
  try {
    console.log('📤 Sending Test Message via WaSender\n');
    console.log('Recipient: +94772452955');
    console.log('Provider: WaSender');
    console.log('---\n');

    const testMessage = `✅ *WaSender Integration Test*
${new Date().toLocaleString()}

Your TaskFlow WhatsApp notification system is working!

Features:
- 📊 Personalized dashboard summaries
- 🔴 Overdue task alerts
- 🟡 Due soon notifications
- 🕐 Scheduled at 7 AM & 7 PM UTC
- ✏️ Manual send from admin panel

Have a productive day! 💪`;

    const result = await whatsappService.sendWhatsAppMessage('+94772452955', testMessage);
    
    console.log('\n📊 Result:');
    console.log('Success:', result.success);
    console.log('Message ID:', result.sid);
    console.log('Status:', result.status);
    console.log('Provider:', result.provider);
    
    if (!result.success) {
      console.log('Error:', result.reason);
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal Error:', error.message);
    process.exit(1);
  }
}

sendTestMessage();
