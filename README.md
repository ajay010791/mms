# Migration Monitor

Real-time migration monitoring dashboard for CloudFuze.
Tracks Slack/Teams/Google Chat message migration progress
with live status, alerts, and reports.

## Features

- Live migration progress from Metabase
- RAG status for channels and DMS
- Automated stall and conflict email alerts
- Microsoft 365 login (Azure AD)
- Admin panel for all configuration
- Export PDF reports

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | MongoDB |
| Data source | Metabase |
| Auth | Azure AD (MS365) + Dev login |
| Email | Office 365 OAuth2 SMTP |
| Process manager | PM2 |
| Reverse proxy | Nginx |

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/ajay010791/monitoring-automation.git
cd monitoring-automation

# 2. Install all dependencies
npm run install:all

# 3. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit both files with your values

# 4. Start MongoDB locally
mongod

# 5. Start development servers
npm run dev
# Backend: http://localhost:5000
# Frontend: http://localhost:3000

# 6. Login
# Dev login: use credentials set in Admin panel
# MS login: requires Azure AD configuration
```

## Project Structure

```
monitoring-automation/
├── backend/
│   ├── src/
│   │   ├── middleware/       # auth, adminAuth
│   │   ├── models/           # MongoDB schemas
│   │   │   ├── ProjectConfig.js
│   │   │   ├── SystemConfig.js
│   │   │   ├── Snapshot.js
│   │   │   └── AdminLog.js
│   │   ├── routes/           # Express route handlers
│   │   │   ├── admin.js      # Admin config & alert endpoints
│   │   │   ├── auth.js       # Login / Azure AD
│   │   │   ├── projects.js   # Live project data
│   │   │   └── reports.js    # Export endpoints
│   │   ├── services/
│   │   │   ├── cronService.js    # Stall/conflict alert cron
│   │   │   ├── emailService.js   # SMTP + OAuth2 email
│   │   │   ├── metabase.js       # Metabase API client
│   │   │   ├── snapshotStore.js  # In-memory snapshot cache
│   │   │   └── teamsService.js   # Teams webhook
│   │   └── index.js          # Express app entry point
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/       # Shared UI components
│   │   │   ├── ProjectCard.jsx
│   │   │   ├── TopBar.jsx
│   │   │   └── AlertBadge.jsx
│   │   ├── hooks/            # Custom React hooks
│   │   │   ├── useProjects.js
│   │   │   └── useAuth.js
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   └── admin/        # Admin panel pages
│   │   ├── utils/
│   │   │   ├── axios.js      # Axios instance with auth
│   │   │   └── classifier.js
│   │   └── main.jsx
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── deployment.md         # Server deployment guide
│   └── database-export.md    # DB backup & restore guide
├── .gitignore
├── package.json              # Root scripts (dev, build, install:all)
└── README.md
```

## Environment Variables

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example).

Only 5 backend variables are required — all other configuration (Azure, Metabase, SMTP, Projects, Alert Rules) is stored in MongoDB and managed via the Admin panel.

## Deployment

See [`docs/deployment.md`](docs/deployment.md) for the full server setup guide.

## Database Backup & Restore

See [`docs/database-export.md`](docs/database-export.md).

## Admin Panel

After first login, configure everything in order:

1. **Admin → Metabase** — connect your Metabase instance
2. **Admin → SMTP** — email server (supports Office 365 OAuth2)
3. **Admin → Azure** — Azure AD for MS365 login
4. **Admin → Projects** — add migration projects with Metabase DB IDs
5. **Admin → Alert Rules** — set stall check interval and cooldown hours
6. **Admin → Webhooks** — per-project Teams webhook URLs

## License

Internal — CloudFuze
