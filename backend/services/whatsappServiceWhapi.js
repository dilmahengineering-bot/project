/**
 * WhatsApp Service using Whapi.Cloud
 * Replaces Twilio with Whapi.Cloud API for better delivery
 */

const axios = require('axios');
const db = require('../db');

const WHAPI_TOKEN = process.env.WHAPI_CLOUD_TOKEN;
const WHAPI_BASE_URL = 'https://gate.whapi.cloud';

// Whapi.Cloud API client
const whapiClient = axios.create({
  baseURL: WHAPI_BASE_URL,
  headers: {
    'Authorization': `Bearer ${WHAPI_TOKEN}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Send WhatsApp message via Whapi.Cloud
 * @param {string} toNumber - Recipient phone number (with country code, e.g., +1234567890)
 * @param {string} message - Message text
 * @returns {Promise<Object>}
 */
async function sendWhatsAppMessage(toNumber, message) {
  try {
    if (!WHAPI_TOKEN) {
      console.warn('⚠️ Whapi.Cloud token not configured. Message not sent.');
      return { success: false, reason: 'Whapi.Cloud token not configured' };
    }

    if (!toNumber || !toNumber.startsWith('+')) {
      console.error('❌ Invalid phone number format. Use: +1234567890');
      return { success: false, reason: 'Invalid phone format' };
    }

    // Remove + from number for Whapi.Cloud API
    const phoneNumber = toNumber.replace('+', '');

    // Send message via Whapi.Cloud
    const response = await whapiClient.post('/messages/text', {
      to: phoneNumber,
      body: message,
    });

    console.log('Whapi.Cloud Response:', JSON.stringify(response.data, null, 2));

    // Whapi.Cloud returns nested structure
    const messageId = response.data?.result?.id || response.data?.id || response.data?.message?.id;

    if (!messageId) {
      throw new Error(`No message ID found. Response: ${JSON.stringify(response.data)}`);
    }

    console.log(`✅ WhatsApp message sent to ${toNumber} (ID: ${messageId})`);

    // Log to database (don't insert user_id here - let routes handle it)
    // This is for direct API calls only

    return { 
      success: true, 
      sid: messageId,
      provider: 'whapi.cloud'
    };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${toNumber}:`, error.message);
    
    return { 
      success: false, 
      reason: error.message || 'Failed to send message',
      provider: 'whapi.cloud'
    };
  }
}

/**
 * Send WhatsApp message using template
 * Whapi.Cloud messages can be formatted as templates
 * @param {string} toNumber - Recipient phone number
 * @param {string} templateSid - Template ID (ignored for Whapi.Cloud, using message body instead)
 * @param {Object} templateVariables - Variables to fill template
 * @returns {Promise<Object>}
 */
async function sendWhatsAppTemplate(toNumber, templateSid, templateVariables = {}) {
  try {
    // Format message from template variables
    const { 1: tasks, 2: completed, 3: cncTotal, 4: cncActive } = templateVariables;
    
    const message = `📊 TaskFlow Dashboard Summary

Tasks Total: ${tasks || 0}
Tasks Completed: ${completed || 0}

CNC Jobs Total: ${cncTotal || 0}
CNC Jobs Active: ${cncActive || 0}

Please log in to your dashboard to see full details and manage your tasks efficiently.`;

    // Send via Whapi.Cloud
    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error(`❌ Failed to send template to ${toNumber}:`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send dashboard summary notification
 * @param {string} toNumber - Recipient phone number
 * @param {Object} summary - Dashboard summary data
 * @returns {Promise<Object>}
 */
async function sendDashboardSummary(toNumber, summary) {
  try {
    const message = `📊 TaskFlow Dashboard Summary
    
Tasks Count: ${summary.tasksCount || 0}
Tasks Completed: ${summary.tasksCompleted || 0}

CNC Jobs: ${summary.cncJobsCount || 0}
CNC Jobs Active: ${summary.cncJobsActive || 0}

Time: ${summary.time || 'Check your dashboard'}`;

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending dashboard summary:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send task notification
 * @param {string} toNumber - Recipient phone number
 * @param {Object} task - Task information
 * @param {string} action - Action type (created, updated, completed, assigned)
 * @returns {Promise<Object>}
 */
async function sendTaskNotification(toNumber, task, action = 'updated') {
  try {
    let message = '';

    switch (action) {
      case 'created':
        message = `🆕 New Task Created\n\nTitle: ${task.title}\nAssigned to: ${task.assignedTo}\nDeadline: ${task.deadline}`;
        break;
      case 'completed':
        message = `✅ Task Completed\n\nTitle: ${task.title}\nCompleted at: ${new Date().toLocaleString()}`;
        break;
      case 'assigned':
        message = `📋 Task Assigned to You\n\nTitle: ${task.title}\nAssigned by: ${task.assignedBy}\nDeadline: ${task.deadline}`;
        break;
      default:
        message = `📝 Task Update\n\nTitle: ${task.title}\nStatus: ${task.status}`;
    }

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending task notification:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send CNC job notification
 * @param {string} toNumber - Recipient phone number
 * @param {Object} job - CNC job information
 * @param {string} action - Action type (started, completed, delayed, ready)
 * @returns {Promise<Object>}
 */
async function sendCNCJobNotification(toNumber, job, action = 'updated') {
  try {
    let message = '';

    switch (action) {
      case 'started':
        message = `🔧 CNC Job Started\n\nJob: ${job.jobName}\nMachine: ${job.machine}\nEstimated Duration: ${job.duration}`;
        break;
      case 'completed':
        message = `✅ CNC Job Completed\n\nJob: ${job.jobName}\nCompleted at: ${new Date().toLocaleString()}`;
        break;
      case 'ready':
        message = `📦 CNC Job Ready\n\nJob: ${job.jobName}\nReady for pickup/delivery`;
        break;
      case 'delayed':
        message = `⚠️ CNC Job Delayed\n\nJob: ${job.jobName}\nReason: ${job.delayReason}`;
        break;
      default:
        message = `🔧 CNC Job Update\n\nJob: ${job.jobName}\nStatus: ${job.status}`;
    }

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending CNC notification:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Test Whapi.Cloud connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    if (!WHAPI_TOKEN) {
      console.error('❌ Whapi.Cloud token not configured');
      return false;
    }

    console.log('🧪 Testing Whapi.Cloud connection...');
    
    // Try a test message send (better than profile check)
    // We'll send to admin for testing, but return success if API responds
    const testResponse = await whapiClient.post('/messages/text', {
      to: '15551234567', // Dummy test
      body: 'Test',
    });
    
    if (testResponse.status === 200 || testResponse.status === 201) {
      console.log('✅ Whapi.Cloud connection successful');
      return true;
    }
    
    return false;
  } catch (error) {
    // Even if test message fails, if token headers are accepted, connection is ok
    if (error.response && error.response.status === 400) {
      // 400 likely means invalid phone, but token is valid
      console.log('✅ Whapi.Cloud connection successful (token validated)');
      return true;
    }
    
    console.error('❌ Whapi.Cloud connection failed:', error.message);
    return false;
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendDashboardSummary,
  sendTaskNotification,
  sendCNCJobNotification,
  testConnection,
};
