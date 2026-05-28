# Database Export & Restore Guide

## Export from local machine (Windows)

```bash
# Export all collections
mongodump --db migration-monitor --out ./backup

# What gets exported:
# backup/migration-monitor/systemconfigs.bson  ← All admin config
# backup/migration-monitor/projectconfigs.bson ← All projects
# backup/migration-monitor/snapshots.bson      ← Recent snapshots
```

## What is in each collection

### systemconfigs
Contains all admin configuration:
- key: "azure"      → Azure AD client ID + tenant ID
- key: "metabase"   → Metabase URL + credentials
- key: "smtp"       → SMTP/OAuth2 config
- key: "alertRules" → Stall interval, cooldown settings
- key: "devAdmin"   → Dev login credentials (hashed)

### projectconfigs
One document per project:
- projectName, metabaseDatabaseId
- source, destination, migrationType
- alertEmail, teamsWebhookUrl
- isActive

### snapshots
Auto-generated every cron interval.
24-hour TTL — old ones deleted automatically.
No need to migrate these — they regenerate from Metabase.

## Import to production server

```bash
# Copy backup folder to server
scp -r ./backup user@YOUR_SERVER_IP:/tmp/

# SSH into server
ssh user@YOUR_SERVER_IP

# Restore
mongorestore --db migration-monitor \
             /tmp/backup/migration-monitor

# Verify all collections restored
mongosh
use migration-monitor
show collections
db.systemconfigs.find({}, { key: 1 }).toArray()
db.projectconfigs.find({}, { projectName: 1 }).toArray()
```

## After restore — update for production

These values in systemconfigs need updating
after restore to production:

1. Azure redirect URI:
```js
db.systemconfigs.updateOne(
  { key: "azure" },
  { $set: { "data.redirectUri": "https://yourdomain.com" } }
)
```

2. SMTP OAuth — reconnect from Admin panel
   (tokens expire and are environment-specific)

3. Dev admin password — change from Admin panel
