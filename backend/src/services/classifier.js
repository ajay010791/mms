function classifyProject(clouds) {
  if (!clouds) return 'unknown';
  const c = clouds.toLowerCase();
  if (c.includes('slack') || c.includes('google chat') || c.includes('teams')) return 'messaging';
  if (c.includes('gmail') || c.includes('outlook')) return 'email';
  if (c.includes('sharepoint') || c.includes('onedrive') || c.includes('google drive')) return 'content';
  return 'unknown';
}

function getCloudBadge(clouds) {
  if (!clouds) return null;
  const c = clouds.toLowerCase();
  if (c.includes('slack')) return 'Slack';
  if (c.includes('google chat')) return 'Google Chat';
  if (c.includes('teams')) return 'Teams';
  if (c.includes('gmail')) return 'Gmail';
  if (c.includes('outlook')) return 'Outlook';
  if (c.includes('sharepoint')) return 'SharePoint';
  if (c.includes('onedrive')) return 'OneDrive';
  if (c.includes('google drive')) return 'Google Drive';
  return clouds;
}

module.exports = { classifyProject, getCloudBadge };
