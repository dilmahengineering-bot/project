require('dotenv').config();
const axios = require('axios');
const db = require('./db');

const WHAPI_TOKEN = process.env.WHAPI_CLOUD_TOKEN;
const WHAPI_BASE_URL = 'https://gate.whapi.cloud';

// Test diagnostics
async function runDiagnostics() {
  console.log('\n🔍 WhatsApp Message Delivery Diagnostics');
  console.log('=========================================\n');

  // 1. Check token
  console.log('1️⃣ Checking WHAPI_CLOUD_TOKEN...');
  if (!WHAPI_TOKEN) {
    console.error('❌ WHAPI_CLOUD_TOKEN is not set!');
    process.exit(1);
  }
  console.log(`✅ Token found: ${WHAPI_TOKEN.substring(0, 10)}...${WHAPI_TOKEN.substring(WHAPI_TOKEN.length - 5)}\n`);

  // 2. Get Hirusha's info
  console.log('2️⃣ Fetching user information...');
  try {
    const result = await db.query(
      'SELECT id, name, phone_number FROM users WHERE phone_number IS NOT NULL LIMIT 1'
    );
    
    if (!result.rows[0]) {
      console.log('⚠️ No users with phone numbers found in database');
      console.log('Please configure a phone number first via admin interface');
      process.exit(1);
    }

    const user = result.rows[0];
    console.log(`✅ Found: ${user.name}`);
    console.log(`📱 Phone: ${user.phone_number}\n`);

    // 3. Test API connection with Whapi.Cloud
    console.log('3️⃣ Testing Whapi.Cloud API connection...');
    
    const whapiClient = axios.create({
      baseURL: WHAPI_BASE_URL,
      headers: {
        'Authorization': `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    try {
      // Get account status  
      const statusResponse = await whapiClient.get('/contact');
      console.log('✅ API Connection OK');
      console.log(`Account Info: ${JSON.stringify(statusResponse.data, null, 2)}\n`);
    } catch (statusErr) {
      console.log('⚠️ Could not fetch account status, but testing message send...\n');
    }

    // 4. Send actual test message
    console.log('4️⃣ Sending test message to Hirusha...');
    
    const phoneNumber = user.phone_number.replace('+', '');
    const testMessage = `🧪 TEST MESSAGE\n\nThis is a diagnostic test sent at ${new Date().toLocaleTimeString()}\n\nIf you received this, WhatsApp delivery is working! ✓`;

    try {
      const messageResponse = await whapiClient.post('/messages/text', {
        to: phoneNumber,
        body: testMessage,
      });

      console.log('✅ API Response Status:', messageResponse.status);
      console.log('📊 Full Response:');
      console.log(JSON.stringify(messageResponse.data, null, 2));

      const messageId = messageResponse.data?.result?.id || messageResponse.data?.id;
      console.log(`\n📤 Message sent with ID: ${messageId}\n`);

      // 5. Check database logs
      console.log('5️⃣ Recent WhatsApp logs in database:');
      const logsResult = await db.query(`
        SELECT id, phone_number, message_type, status, error_message, sent_at
        FROM whatsapp_logs 
        WHERE phone_number = $1
        ORDER BY sent_at DESC 
        LIMIT 10
      `, [user.phone_number]);

      if (logsResult.rows.length > 0) {
        console.log(`Found ${logsResult.rows.length} logs:\n`);
        logsResult.rows.forEach((log, i) => {
          console.log(`${i + 1}. ${log.sent_at}`);
          console.log(`   Type: ${log.message_type}`);
          console.log(`   Status: ${log.status || 'not recorded'}`);
          if (log.error_message) console.log(`   Error: ${log.error_message}`);
        });
      } else {
        console.log('⚠️ No logs found for this phone number\n');
      }

      // 6. Recommendations
      console.log('\n6️⃣ Troubleshooting Guide:');
      console.log('===============================');
      if (messageId) {
        console.log('✅ Message was sent successfully via API');
        console.log('   If not received on phone:');
        console.log('   - Check if phone number is correct');
        console.log('   - Verify WhatsApp is active on that number');
        console.log('   - Check if spam/blocked filters are enabled');
        console.log('   - Try testing with a different number');
      } else {
        console.log('❌ Message was NOT sent (no ID returned)');
        console.log('   Check the API response above for error details');
      }

    } catch (err) {
      console.error('❌ API Error:', err.message);
      if (err.response) {
        console.error('Status:', err.response.status);
        console.error('Data:', JSON.stringify(err.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    process.exit(0);
  }
}

runDiagnostics();
