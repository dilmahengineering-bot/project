# TaskFlow — Full Production Deployment Guide

## Prerequisites
- Ubuntu 22.04 VPS (DigitalOcean, AWS EC2, Hetzner, etc.) — min 1GB RAM
- Domain name pointed to server IP
- SSH access

---

## OPTION A — Docker Compose (Recommended, ~15 min)

### 1. Install Docker on your server

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### 2. Clone / upload your project

```bash
# On your local machine, zip and upload:
scp -r ./taskflow user@YOUR_SERVER_IP:/home/user/taskflow

# Or on the server, clone from git:
git clone https://github.com/yourname/taskflow.git
cd taskflow
```

### 3. Create your .env file

```bash
cp backend/.env.example .env
nano .env
```

Fill in:
```
DB_PASSWORD=choose_a_strong_password
JWT_SECRET=run_this_to_generate:_openssl rand -hex 32
CLIENT_URL=https://yourdomain.com
```

### 4. Build and start all services

```bash
docker compose up -d --build
```

Check everything is running:
```bash
docker compose ps
docker compose logs api    # backend logs
docker compose logs postgres
```

### 5. Install Nginx + SSL

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# Copy your nginx config
sudo cp nginx/taskflow.conf /etc/nginx/sites-available/taskflow
sudo ln -s /etc/nginx/sites-available/taskflow /etc/nginx/sites-enabled/

# Edit domain name
sudo nano /etc/nginx/sites-available/taskflow
# Replace yourdomain.com with your actual domain

# Test config
sudo nginx -t

# Get free SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Start nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

Your app is live at **https://yourdomain.com** 🎉

---

## OPTION B — Manual (No Docker)

### 1. Install dependencies

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql nginx

# Node 20 (if needed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Setup PostgreSQL

```bash
sudo -u postgres psql -f backend/db/schema.sql
```

### 3. Setup backend

```bash
cd backend
cp .env.example .env
nano .env          # fill in your values

npm install
```

Install PM2 (process manager):
```bash
sudo npm install -g pm2
pm2 start server.js --name taskflow-api
pm2 save
pm2 startup         # follow the printed command
```

### 4. Build React frontend

```bash
cd ../frontend
npm install
REACT_APP_API_URL=/api npm run build

# Copy build to nginx web root
sudo mkdir -p /var/www/taskflow
sudo cp -r build/* /var/www/taskflow/
```

### 5. Nginx + SSL

```bash
sudo cp ../nginx/taskflow.conf /etc/nginx/sites-available/taskflow
sudo ln -s /etc/nginx/sites-available/taskflow /etc/nginx/sites-enabled/

# Replace domain in config
sudo nano /etc/nginx/sites-available/taskflow

sudo nginx -t
sudo certbot --nginx -d yourdomain.com
sudo systemctl restart nginx
```

---

## OPTION C — Cloud Platforms

### Render.com (easiest, free tier available)

1. Push code to GitHub
2. **Backend:**
   - New → Web Service → your repo → `/backend`
   - Build: `npm install`  Start: `node server.js`
   - Add environment variables from `.env.example`
3. **Database:**
   - New → PostgreSQL → copy the connection string
   - Set `DATABASE_URL` env var in backend service
   - Update `db/index.js` to use `process.env.DATABASE_URL`
4. **Frontend:**
   - New → Static Site → `/frontend`
   - Build: `npm run build`  Publish: `build`
   - Set `REACT_APP_API_URL=https://your-backend.onrender.com/api`

### Railway.app

```bash
npm install -g @railway/cli
railway login
railway init
railway add postgresql
railway up
```

---

## Updating the app

### Docker:
```bash
git pull
docker compose up -d --build
```

### PM2 (manual):
```bash
git pull
cd backend && npm install
pm2 restart taskflow-api
cd ../frontend && npm run build
sudo cp -r build/* /var/www/taskflow/
```

---

## Useful commands

```bash
# View backend logs (Docker)
docker compose logs -f api

# View backend logs (PM2)
pm2 logs taskflow-api

# Backup database
docker compose exec postgres pg_dump -U taskflow_user taskflow > backup.sql

# Restore database
docker compose exec -T postgres psql -U taskflow_user taskflow < backup.sql

# Connect to DB shell
docker compose exec postgres psql -U taskflow_user -d taskflow
```

---

## API Endpoints Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/login | Public | Login |
| GET  | /api/auth/me | Any | Current user |
| POST | /api/auth/register | Admin | Create user |
| GET  | /api/users | Any | List users |
| GET  | /api/tasks | Any | List tasks |
| POST | /api/tasks | Any | Create task |
| PATCH| /api/tasks/:id | Any | Update task |
| POST | /api/tasks/:id/confirm | Admin | Confirm completion |
| POST | /api/tasks/:id/extensions | User | Request extension |
| PATCH| /api/tasks/:id/extensions/:extId | Admin | Approve/reject |
| GET  | /api/reports/summary | Admin | Stats overview |
| GET  | /api/reports/tasks | Admin | Filtered task report |
| GET  | /api/reports/overdue | Admin | Overdue tasks |
| GET  | /health | Public | Health check |

---

## Security Checklist

- [ ] Strong DB_PASSWORD (20+ chars)
- [ ] Strong JWT_SECRET (openssl rand -hex 32)  
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] Firewall: only ports 22, 80, 443 open
- [ ] Change default admin password after first login
- [ ] Set up automated DB backups
