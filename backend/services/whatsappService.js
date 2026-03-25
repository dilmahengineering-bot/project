const twilio = require('twilio');

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';

let client;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

/**
 * Send WhatsApp message via Twilio
 * @param {string} toNumber - Recipient phone number (format: +1234567890)
 * @param {string} message - Message text
 * @returns {Promise<Object>} - Twilio response
 */
async function sendWhatsAppMessage(toNumber, message) {
  try {
    if (!client) {
      console.warn('⚠️ Twilio not configured. Message not sent.');
      console.log(`Message to ${toNumber}: ${message}`);
      return { success: false, reason: 'Twilio not configured', preview: message };
    }

    if (!toNumber || !toNumber.startsWith('+')) {
      console.error('❌ Invalid phone number format. Use: +1234567890');
      return { success: false, reason: 'Invalid phone format' };
    }

    const response = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${toNumber}`,
      body: message,
    });

    console.log(`✅ WhatsApp sent to ${toNumber} (SID: ${response.sid})`);
    return { success: true, sid: response.sid, message: message };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp to ${toNumber}:`, error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Send dashboard summary via WhatsApp
 * @param {string} toNumber - Recipient phone
 * @param {Object} summary - Dashboard data {tasks, cncJobs, deadlines, etc}
 * @returns {Promise<Object>}
 */
async function sendDashboardSummary(toNumber, summary) {
  try {
    // Format the dashboard summary message
    const message = formatDashboardMessage(summary);
    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending dashboard summary:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * Format dashboard data into WhatsApp message
 * @param {Object} summary - Dashboard summary data
 * @returns {string} - Formatted message
 */
function formatDashboardMessage(summary) {
  const {
    userName = 'User',
    tasksCount = 0,
    tasksOverdue = 0,
    tasksDueToday = 0,
    tasksDueSoon = 0,
    tasksCompleted = 0,
    cncJobsCount = 0,
    cncJobsActive = 0,
    cncJobsCompleted = 0,
    cncJobsOverdue = 0,
    time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
  } = summary;

  return `📊 TaskFlow Dashboard Summary

👋 Hi ${userName}!

📋 TASKS
• Total: ${tasksCount}
• Completed: ${tasksCompleted}
🚨 Overdue: ${tasksOverdue}
⏰ Due Today: ${tasksDueToday}
⚠️ Due Soon: ${tasksDueSoon}

⚙️ CNC JOBS
• Total: ${cncJobsCount}
• Active: ${cncJobsActive}
✅ Completed: ${cncJobsCompleted}
🚨 Overdue: ${cncJobsOverdue}

⏱️ ${time}

🔗 Open dashboard: ${process.env.FRONTEND_URL || 'https://taskflow.app'}/dashboard`;
}

/**
 * Send task notification
 * @param {string} toNumber - Recipient phone
 * @param {Object} task - Task data
 * @param {string} action - Action type (created, assigned, completed, etc)
 */
async function sendTaskNotification(toNumber, task, action) {
  try {
    let message = '';

    switch (action) {
      case 'created':
        message = `📋 NEW TASK\n"${task.title}"\n⏰ Due: ${new Date(task.deadline).toLocaleDateString()}\n🔗 ${process.env.FRONTEND_URL}/tasks`;
        break;
      case 'assigned':
        message = `👤 TASK ASSIGNED TO YOU\n"${task.title}"\n⏰ Due: ${new Date(task.deadline).toLocaleDateString()}\n🔗 ${process.env.FRONTEND_URL}/tasks`;
        break;
      case 'completed':
        message = `✅ TASK COMPLETED\n"${task.title}"\nGreat work! 🎉\n🔗 ${process.env.FRONTEND_URL}/tasks`;
        break;
      case 'overdue':
        message = `🚨 TASK OVERDUE\n"${task.title}"\n⏰ Due: ${new Date(task.deadline).toLocaleDateString()}\n🔗 ${process.env.FRONTEND_URL}/tasks`;
        break;
      default:
        message = `📋 Task Update: "${task.title}"`;
    }

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending task notification:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * Send CNC job notification
 * @param {string} toNumber - Recipient phone
 * @param {Object} job - Job data
 * @param {string} action - Action type (created, status_changed, completed, etc)
 */
async function sendCNCJobNotification(toNumber, job, action) {
  try {
    let message = '';

    switch (action) {
      case 'created':
        message = `⚙️ NEW CNC JOB\n"${job.job_name}"\nJob #: ${job.job_card_number}\n🔗 ${process.env.FRONTEND_URL}/cnc-kanban`;
        break;
      case 'stage_changed':
        message = `📊 CNC JOB STAGE UPDATE\n"${job.job_name}"\nNew Stage: ${job.current_stage || 'Unknown'}\n🔗 ${process.env.FRONTEND_URL}/cnc-kanban`;
        break;
      case 'completed':
        message = `✅ CNC JOB COMPLETED\n"${job.job_name}"\nJob #: ${job.job_card_number}\n🎉 Great work!\n🔗 ${process.env.FRONTEND_URL}/cnc-kanban`;
        break;
      case 'overdue':
        message = `🚨 CNC JOB OVERDUE\n"${job.job_name}"\nJob #: ${job.job_card_number}\n🔗 ${process.env.FRONTEND_URL}/cnc-kanban`;
        break;
      default:
        message = `⚙️ CNC Job Update: "${job.job_name}"`;
    }

    return await sendWhatsAppMessage(toNumber, message);
  } catch (error) {
    console.error('Error sending CNC notification:', error);
    return { success: false, reason: error.message };
  }
}

/**
 * Send WhatsApp message using Message Template
 * (No 24-hour window restriction)
 * @param {string} toNumber - Recipient phone number
 * @param {string} templateName - Template name (e.g., 'dashboard_summary')
 * @param {Object} templateVariables - Variables to fill in template
 * @returns {Promise<Object>}
 */
/**
 * Send WhatsApp message using approved template
 * Template: dashboard_summary (HXcf72251c358f71217ea2b4b34d9af5db)
 * @param {string} toNumber - Recipient phone number
 * @param {string} templateSid - Template SID
 * @param {Array} variables - Template variables in order [tasks, completed, cncTotal, cncActive]
 * @returns {Promise<Object>}
 */
async function sendWhatsAppTemplate(toNumber, templateSid, templateVariables = {}) {
  try {
    if (!client) {
      console.warn('⚠️ Twilio not configured. Message not sent.');
      return { success: false, reason: 'Twilio not configured' };
    }

    if (!toNumber || !toNumber.startsWith('+')) {
      console.error('❌ Invalid phone number format. Use: +1234567890');
      return { success: false, reason: 'Invalid phone format' };
    }

    // Convert variables object to ordered array
    const variablesArray = Object.keys(templateVariables)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(key => String(templateVariables[key]));

    // Using newer Twilio API for content templates
    const response = await client.messages.create({
      from: `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${toNumber}`,
      contentSid: templateSid,
      contentVariables: JSON.stringify(variablesArray),
    });

    console.log(`✅ WhatsApp template sent to ${toNumber} (SID: ${response.sid})`);
    return { success: true, sid: response.sid, template: 'dashboard_summary' };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp template to ${toNumber}:`, error.message);
    // Fallback to free-form message if template fails
    console.log('Falling back to free-form message...');
    const { 1: tasks, 2: completed, 3: cncTotal, 4: cncActive } = templateVariables;
    const message = `📊 TaskFlow Dashboard Summary\n\nTasks Total: ${tasks}\nCompleted: ${completed}\nCNC Jobs: ${cncTotal}\nActive: ${cncActive}\n\nLog in to your dashboard for full details.`;
    return await sendWhatsAppMessage(toNumber, message);
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendDashboardSummary,
  sendTaskNotification,
  sendCNCJobNotification,
  formatDashboardMessage,
};
