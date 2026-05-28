const axios = require('axios');

const sendWebhook = async (webhookUrl, payload) => {
  try {
    console.log('[Teams] Sending webhook...');

    const response = await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log('[Teams] ✓ Webhook sent — status:', response.status);
    return true;

  } catch (err) {
    console.error('[Teams] ✗ Webhook failed:', err.message);
    if (err.response) {
      console.error('[Teams] Response:', err.response.status, err.response.data);
    }
    throw err;
  }
};

const sendTestWebhook = async (webhookUrl, projectName) => {
  const payload = {
    '@type':    'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '185FA5',
    summary:    `✅ Test — Migration Monitor`,
    sections: [{
      activityTitle:    `✅ Test Notification — Migration Monitor`,
      activitySubtitle: `Webhook configured successfully for: ${projectName}`,
      facts: [
        { name: 'Project', value: projectName },
        { name: 'Status',  value: '✅ Webhook is working correctly' },
        { name: 'Time',    value: new Date().toLocaleString() }
      ]
    }]
  };
  return sendWebhook(webhookUrl, payload);
};

// Backward-compat aliases used by older admin routes
const sendTestMessage  = sendTestWebhook;
const sendTeamsMessage = sendWebhook;

module.exports = { sendWebhook, sendTestWebhook, sendTestMessage, sendTeamsMessage };
