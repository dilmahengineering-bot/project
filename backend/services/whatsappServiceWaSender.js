/**
 * WhatsApp Service using WaSender
 * Replaces Whapi.Cloud with WaSender for better message delivery
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../db');

const WASENDER_API_KEY = process.env.WASENDER_API_KEY;
const WASENDER_DEVICE_ID = process.env.WASENDER_DEVICE_ID;
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://api.wasender.com';

// Verify credentials are loaded
if (!WASENDER_API_KEY) {
  console.warn('⚠️ WARNING: WASENDER_API_KEY not loaded from environment');
  console.warn('Set WASENDER_API_KEY in .env file');
}

// WaSender API client
const wasenderClient = axios.create({
  baseURL: WASENDER_BASE_URL,
  headers: {
    'Authorization': `Bearer ${WASENDER_API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Send WhatsApp message via WaSender
 * @param {string} toNumber - Recipient phone number (with country code, e.g., +1234567890)
 * @param {string} message - Message text
 * @returns {Promise<Object>}
 */
async function sendWhatsAppMessage(toNumber, message) {
  try {
    if (!WASENDER_API_KEY) {
      console.warn('⚠️ WaSender API key not configured. Message not sent.');
      return { success: false, reason: 'WaSender API key not configured' };
    }

    if (!toNumber || !toNumber.startsWith('+')) {
      console.error('❌ Invalid phone number format. Use: +1234567890');
      return { success: false, reason: 'Invalid phone format' };
    }

    // Remove + from number for WaSender API (it expects 1234567890 format or with +)
    const phoneNumber = toNumber.replace('+', '');

    // Send message via WaSender
    // WaSender endpoint: POST /send-message
    const response = await wasenderClient.post('/send-message', {
      to: toNumber,  // Include country code
      text: message,
    });

    console.log('WaSender Response:', JSON.stringify(response.data, null, 2));

    // WaSender typically returns messageId in response
    const messageId = response.data?.data?.messageId 
      || response.data?.messageId 
      || response.data?.id 
      || `wasender_${Date.now()}`;

    const messageStatus = response.data?.status || 'sent';

    if (!messageId) {
      throw new Error(`No message ID found. Response: ${JSON.stringify(response.data)}`);
    }

    console.log(`✅ WhatsApp message sent to ${toNumber} (ID: ${messageId}, Status: ${messageStatus})`);

    return { 
      success: true, 
      sid: messageId,
      status: messageStatus,
      provider: 'wasender'
    };
  } catch (error) {
    // Capture full error details including HTTP status
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    const fullMessage = `HTTP ${statusCode}: ${error.message}. Details: ${JSON.stringify(errorData)}`;
    
    console.error(`❌ Failed to send WhatsApp message to ${toNumber}:`, fullMessage);
    
    return { 
      success: false, 
      reason: fullMessage || 'Failed to send message',
      statusCode: statusCode,
      provider: 'wasender'
    };
  }
}

/**
 * Send WhatsApp message using template
 * WaSender messages can be formatted as templates
 * @param {string} toNumber - Recipient phone number
 * @param {string} templateId - Template ID (ignored for now, using message body)
 * @param {Object} templateVariables - Variables to fill template
 * @returns {Promise<Object>}
 */
async function sendWhatsAppTemplate(toNumber, templateId, templateVariables = {}) {
  try {
    // Format message from template variables
    const { 1: tasks, 2: completed, 3: cncTotal, 4: cncActive } = templateVariables;
    
    const message = `📊 TaskFlow Dashboard Summary

Tasks Total: ${tasks || 0}
Tasks Completed: ${completed || 0}

CNC Jobs Total: ${cncTotal || 0}
CNC Jobs Active: ${cncActive || 0}

Please log in to your dashboard to see full details and manage your tasks efficiently.`;

    // Send via WaSender
    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error(`❌ Failed to send template to ${toNumber}:`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send dashboard summary notification
 * @param {string} toNumber - Recipient phone number
 * @param {Object} summaryData - Summary statistics
 * @returns {Promise<Object>}
 */
async function sendDashboardSummary(toNumber, summaryData) {
  try {
    const message = `📊 Dashboard Summary

Tasks: ${summaryData.tasks || 0}
Completed: ${summaryData.completed || 0}
In Progress: ${summaryData.inProgress || 0}

CNC Jobs: ${summaryData.cncJobs || 0}
Active: ${summaryData.active || 0}`;

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error(`❌ Failed to send dashboard summary:`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Check message delivery status
 * @param {string} messageId - Message ID returned from send
 * @returns {Promise<Object>}
 */
async function checkMessageStatus(messageId) {
  try {
    // WaSender endpoint: GET /check-message-status/:messageId
    const response = await wasenderClient.get(`/check-message-status/${messageId}`);
    
    return { 
      success: true,
      status: response.data?.status || 'unknown',
      data: response.data
    };
  } catch (error) {
    console.error(`❌ Failed to check message status:`, error.message);
    return { success: false, reason: error.message };
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendDashboardSummary,
  checkMessageStatus,
};
