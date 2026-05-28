const { classifyProject } = require('./classifier');

const MOCK_PROJECTS = [
  {
    id: 'proj-1',
    project_name: 'Acme Corp — Slack Migration',
    combination_type: 'Slack→Teams',
    clouds: 'Slack',
    created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    total_channels: 240,
    completed: 198,
    in_progress: 22,
    conflict: 5,
    no_message: 15,
    processed_count: 184320,
    in_progress_count: 4200,
    conflict_count: 890,
    stalled: true
  },
  {
    id: 'proj-2',
    project_name: 'Beta Inc — Google Chat',
    combination_type: 'Google Chat→Teams',
    clouds: 'Google Chat',
    created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    total_channels: 180,
    completed: 95,
    in_progress: 67,
    conflict: 3,
    no_message: 15,
    processed_count: 92400,
    in_progress_count: 18300,
    conflict_count: 240,
    stalled: false
  },
  {
    id: 'proj-3',
    project_name: 'Corp Ltd — Teams Consolidation',
    combination_type: 'Teams→Teams',
    clouds: 'Teams',
    created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    total_channels: 90,
    completed: 44,
    in_progress: 18,
    conflict: 22,
    no_message: 6,
    processed_count: 67800,
    in_progress_count: 8900,
    conflict_count: 3400,
    stalled: false,
    longConflict: true
  },
  {
    id: 'proj-4',
    project_name: 'Delta — Slack Workspace',
    combination_type: 'Slack→Teams',
    clouds: 'Slack',
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    total_channels: 320,
    completed: 12,
    in_progress: 88,
    conflict: 2,
    no_message: 218,
    processed_count: 9800,
    in_progress_count: 31200,
    conflict_count: 180,
    stalled: false
  },
  {
    id: 'proj-5',
    project_name: 'Acme Gmail Migration',
    combination_type: 'Gmail→Outlook',
    clouds: 'Gmail',
    created_at: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    total_channels: 1200,
    completed: 980,
    in_progress: 180,
    conflict: 10,
    no_message: 30,
    processed_count: 4280000,
    in_progress_count: 620000,
    conflict_count: 24000,
    stalled: false
  },
  {
    id: 'proj-6',
    project_name: 'Beta Outlook Migration',
    combination_type: 'Outlook→Exchange',
    clouds: 'Outlook',
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    total_channels: 800,
    completed: 512,
    in_progress: 240,
    conflict: 8,
    no_message: 40,
    processed_count: 2180000,
    in_progress_count: 890000,
    conflict_count: 18000,
    stalled: false
  },
  {
    id: 'proj-7',
    project_name: 'Gamma Gmail',
    combination_type: 'Gmail→Microsoft 365',
    clouds: 'Gmail',
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    total_channels: 2400,
    completed: 800,
    in_progress: 900,
    conflict: 420,
    no_message: 280,
    processed_count: 3200000,
    in_progress_count: 2800000,
    conflict_count: 980000,
    stalled: false,
    longConflict: false
  },
  {
    id: 'proj-8',
    project_name: 'Corp SharePoint Migration',
    combination_type: 'SharePoint→SharePoint Online',
    clouds: 'SharePoint',
    created_at: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString(),
    total_channels: 280,
    completed: 241,
    in_progress: 28,
    conflict: 4,
    no_message: 7,
    processed_count: 1840000,
    in_progress_count: 120000,
    conflict_count: 8400,
    stalled: false
  },
  {
    id: 'proj-9',
    project_name: 'Delta OneDrive Migration',
    combination_type: 'OneDrive→SharePoint',
    clouds: 'OneDrive',
    created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
    total_channels: 150,
    completed: 89,
    in_progress: 48,
    conflict: 7,
    no_message: 6,
    processed_count: 420000,
    in_progress_count: 180000,
    conflict_count: 12000,
    stalled: false
  }
];

const processedCountHistory = new Map();

MOCK_PROJECTS.forEach(p => {
  processedCountHistory.set(p.id, p.processed_count);
});

function getMockProjects() {
  return MOCK_PROJECTS.map(p => {
    const type = classifyProject(p.clouds);
    const prev = processedCountHistory.get(p.id) || p.processed_count;
    const diff30 = p.stalled ? 0 : Math.floor(Math.random() * 500) + 100;
    if (!p.stalled) {
      processedCountHistory.set(p.id, p.processed_count);
    }
    return {
      ...p,
      type,
      diff30min: p.stalled ? 0 : diff30,
      isStalled: p.stalled,
      hasLongConflict: p.longConflict || false
    };
  });
}

function getMockProjectById(id) {
  const projects = getMockProjects();
  return projects.find(p => p.id === id) || null;
}

module.exports = { getMockProjects, getMockProjectById };
