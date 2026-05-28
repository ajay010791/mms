export function classifyProject(clouds) {
  if (!clouds) return 'unknown';
  const c = clouds.toLowerCase();
  if (c.includes('slack') || c.includes('google chat') || c.includes('teams')) return 'messaging';
  if (c.includes('gmail') || c.includes('outlook')) return 'email';
  if (c.includes('sharepoint') || c.includes('onedrive') || c.includes('google drive')) return 'content';
  return 'unknown';
}

export function getTypeColor(type) {
  switch (type) {
    case 'messaging': return '#7c3aed';
    case 'email': return '#2563eb';
    case 'content': return '#16a34a';
    default: return '#6b7280';
  }
}

export function getCloudBadgeColor(clouds) {
  if (!clouds) return '#6b7280';
  const c = clouds.toLowerCase();
  if (c.includes('slack')) return '#4a154b';
  if (c.includes('google chat')) return '#1a73e8';
  if (c.includes('teams')) return '#5059c9';
  if (c.includes('gmail')) return '#ea4335';
  if (c.includes('outlook')) return '#0078d4';
  if (c.includes('sharepoint')) return '#038387';
  if (c.includes('onedrive')) return '#0078d4';
  if (c.includes('google drive')) return '#1a73e8';
  return '#6b7280';
}
