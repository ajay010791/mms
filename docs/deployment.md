# Deployment Guide — Migration Monitor

## Prerequisites

- Ubuntu 22.04 LTS server (Azure VM recommended)
- Node.js 20 LTS
- MongoDB 7
- PM2 (process manager)
- Nginx (reverse proxy)
- Domain name with DNS pointing to server

---

## Step 1 — Server Setup

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB 7
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt-get install -y nginx
sudo systemctl enable nginx
```

## Step 2 — Clone Repository

```bash
cd /var/www
git clone https://github.com/ajay010791/monitoring-automation.git
cd monitoring-automation
npm run install:all
```

## Step 3 — Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
nano backend/.env
# Fill in: MONGODB_URI, ENCRYPTION_KEY, JWT_SECRET, DEV_JWT_SECRET

# Frontend
cp frontend/.env.example frontend/.env
nano frontend/.env
# Fill in: VITE_API_URL, VITE_AZURE_CLIENT_ID, VITE_AZURE_TENANT_ID
```

## Step 4 — Restore Database

```bash
# Copy backup from local machine to server
scp -r backup/ user@your-server-ip:/tmp/

# Restore on server
mongorestore --db migration-monitor /tmp/backup/migration-monitor

# Verify
mongosh
use migration-monitor
db.systemconfigs.find({}, { key: 1 }).toArray()
# Should show: azure, metabase, smtp, alertRules, devAdmin
```

## Step 5 — Build Frontend

```bash
cd /var/www/monitoring-automation/frontend
npm run build
# Creates frontend/dist/ folder
```

## Step 6 — Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/migration-monitor
```

Paste this config:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve React frontend
    root /var/www/monitoring-automation/frontend/dist;
    index index.html;

    # Proxy API to Node.js backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # React Router — serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Enable config
sudo ln -s /etc/nginx/sites-available/migration-monitor \
           /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Step 7 — SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Auto-renews every 90 days
```

## Step 8 — Start Backend with PM2

```bash
cd /var/www/monitoring-automation/backend
pm2 start src/server.js --name "migration-monitor"
pm2 save
pm2 startup
# Run the command it outputs
```

## Step 9 — Post-deployment Admin Config

1. Login at https://yourdomain.com/login (dev login)
2. Admin → Azure: update redirect URI to https://yourdomain.com
3. Admin → SMTP: reconnect Microsoft account
4. Admin → Projects: verify all projects and webhook URLs
5. Admin → Alert Rules: verify settings
6. Admin → Password: change dev login password

---

## Updating the App

```bash
cd /var/www/monitoring-automation

# Pull latest code
git pull origin main

# Install new dependencies if any
npm run install:all

# Rebuild frontend
cd frontend && npm run build && cd ..

# Restart backend
pm2 restart migration-monitor
```

---

## Useful PM2 Commands

```bash
pm2 status                    # Check if running
pm2 logs migration-monitor    # View live logs
pm2 restart migration-monitor # Restart
pm2 stop migration-monitor    # Stop
```

---

## Troubleshooting

```bash
# Check backend logs
pm2 logs migration-monitor --lines 100

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Check MongoDB
sudo systemctl status mongod
mongosh --eval "db.adminCommand('ping')"

# Test API
curl http://localhost:5000/api/health
```
