# VPS Implementation Plan - Mitsubishi Chatbot Deployment

## 📋 Pre-Deployment Checklist

### VPS Requirements
- **OS:** Ubuntu 22.04 LTS (recommended) or Debian 11
- **RAM:** Minimum 2GB (4GB recommended)
- **Storage:** Minimum 20GB SSD
- **Network:** Public IP address, ports 80/443 open
- **Domain:** Registered domain pointing to VPS IP

### What You Need Before Starting
- [ ] VPS server with root/SSH access
- [ ] Domain name configured with A record pointing to VPS IP
- [ ] Facebook App credentials (Page Access Token, Verify Token, App Secret)
- [ ] OpenAI API key (optional, for AI features)
- [ ] SSH key pair for secure access

---

## Phase 1: VPS Setup (30 minutes)

### Step 1: Connect to Your VPS

```bash
# On your local machine, connect via SSH
ssh root@YOUR_VPS_IP_ADDRESS

# Or if using a non-root user
ssh username@YOUR_VPS_IP_ADDRESS
```

### Step 2: Update System & Install Dependencies

```bash
# Update package list
apt update && apt upgrade -y

# Install essential packages
apt install -y \
  curl \
  wget \
  git \
  nano \
  ufw \
  fail2ban \
  htop \
  docker.io \
  docker-compose \
  certbot

# Enable Docker to start on boot
systemctl enable docker
systemctl start docker

# Add your user to docker group (if not running as root)
usermod -aG docker $USER
newgrp docker
```

### Step 3: Configure Firewall

```bash
# Enable UFW firewall
ufw default deny incoming
ufw default allow outgoing

# Allow required ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 443/udp   # HTTPS (QUIC)

# Enable firewall
ufw --force enable

# Check status
ufw status verbose
```

### Step 4: Create Non-Root User (Recommended)

```bash
# Create a new user (replace 'deploy' with your preferred username)
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# Set up SSH key for new user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Switch to new user
su - deploy
```

---

## Phase 2: Project Setup (20 minutes)

### Step 5: Create Project Directory Structure

```bash
# Create directory for the project
mkdir -p ~/mitsubishi-chatbot
cd ~/mitsubishi-chatbot

# Create subdirectories
mkdir -p api nginx
```

### Step 6: Transfer Project Files

**Option A: Using Git (Recommended)**

```bash
# If you have the project in a git repository
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git .

# Or if using SSH
git clone git@github.com:YOUR_USERNAME/YOUR_REPO.git .
```

**Option B: Using SCP (From Local Machine)**

On your local machine:
```bash
# Navigate to your project folder
cd path/to/mitsubishi-chatbot

# Compress the project
tar -czf chatbot.tar.gz .

# Transfer to VPS
scp chatbot.tar.gz deploy@YOUR_VPS_IP:~/mitsubishi-chatbot/

# Or use rsync for better progress visibility
rsync -avz --progress . deploy@YOUR_VPS_IP:~/mitsubishi-chatbot/
```

On VPS:
```bash
cd ~/mitsubishi-chatbot

# Extract if using tar
tar -xzf chatbot.tar.gz
rm chatbot.tar.gz
```

**Option C: Using SFTP**

Use FileZilla or any SFTP client to upload files to `~/mitsubishi-chatbot/`

### Step 7: Verify File Structure

```bash
# Check that all files are present
ls -la

# Should see:
# - api/
# - nginx/
# - docker-compose.prod.yml
# - .env.example
# - README files

# Check api folder
ls -la api/

# Should see:
# - Dockerfile
# - package.json
# - src/
# - prisma/
# - tsconfig.json
```

---

## Phase 3: Environment Configuration (15 minutes)

### Step 8: Create Production Environment File

```bash
cd ~/mitsubishi-chatbot

# Copy example environment file
cp .env.example .env

# Edit with your actual values
nano .env
```

**Fill in your .env file:**

```bash
# ==========================================
# Database Configuration
# ==========================================
POSTGRES_PASSWORD=YourSuperSecurePassword123!@
# Use a strong password: 20+ chars, mixed case, numbers, symbols

# ==========================================
# Domain Configuration
# ==========================================
DOMAIN=chatbot.yourdomain.com
# Replace with your actual domain

# ==========================================
# Meta/Facebook Configuration
# ==========================================
META_PAGE_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxx
# Get from: https://developers.facebook.com/apps → Your App → Messenger → Access Tokens

META_VERIFY_TOKEN=your_webhook_verify_token_123
# Create a random string (you'll need this for Facebook webhook setup)

META_APP_SECRET=your_app_secret_here
# Get from: https://developers.facebook.com/apps → Your App → Settings → Basic

# ==========================================
# LLM Configuration (Optional but Recommended)
# ==========================================
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxx
# Get from: https://platform.openai.com/api-keys
# This enables AI intent detection and FAQ answering

# ==========================================
# Rate Limiting (Optional)
# ==========================================
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=1 minute
WEBHOOK_RATE_LIMIT_MAX=1000
WEBHOOK_RATE_LIMIT_WINDOW=1 minute
```

### Step 9: Secure Environment File

```bash
# Set proper permissions
chmod 600 .env

# Verify it's not readable by others
ls -la .env
# Should show: -rw------- 1 deploy deploy

# Add .env to .gitignore if using git
echo ".env" >> .gitignore
echo "nginx-logs/" >> .gitignore
echo "db-data/" >> .gitignore
```

---

## Phase 4: Initial Deployment (20 minutes)

### Step 10: Build and Start Services

```bash
cd ~/mitsubishi-chatbot

# Build and start in detached mode
docker-compose -f docker-compose.prod.yml up -d

# This will:
# - Build the API Docker image
# - Start PostgreSQL database
# - Expose API on port 3000 for Nginx reverse proxy
```

### Step 10.5: Configure Nginx (If Nginx is already running on your VPS)

If Nginx is already installed and running on your VPS (using ports 80/443), you'll use Nginx as the reverse proxy instead of running Caddy in a container:

```bash
# 1. Copy the Nginx configuration to your VPS
sudo cp ~/mitsubishi-chatbot/nginx/caragent-chatbot.conf /etc/nginx/sites-available/caragent-chatbot

# 2. Edit the configuration with your domain and SSL paths
sudo nano /etc/nginx/sites-available/caragent-chatbot
# Change: server_name _; → server_name yourdomain.com;
# Update SSL certificate paths if you have them already

# 3. Enable the site
sudo ln -s /etc/nginx/sites-available/caragent-chatbot /etc/nginx/sites-enabled/

# 4. Test Nginx configuration
sudo nginx -t

# 5. Reload Nginx
sudo systemctl reload nginx
```

**To obtain SSL certificates with Let's Encrypt:**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Step 11: Check Service Status

```bash
# View running containers
docker-compose -f docker-compose.prod.yml ps

# You should see 2 containers running:
# - mitsubishi-chatbot_api_1
# - mitsubishi-chatbot_db_1

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check specific service logs
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f db
```

### Step 12: Run Database Migrations

```bash
# Wait for database to be ready (about 10-20 seconds)
sleep 20

# Run Prisma migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Expected output:
# Prisma schema loaded from prisma/schema.prisma
# Datasource "db": PostgreSQL database "mitsubishi_chatbot", schema "public"
# X migrations found in prisma/migrations
# Applying migration...
```

### Step 13: Seed Database with Initial Data

```bash
# Seed with car models, variants, and FAQs
docker-compose -f docker-compose.prod.yml exec api npx prisma db seed

# Expected output:
# Start seeding ...
# { xpander: {...}, montero: {...}, priceRule: {...} }
# Seeded 12 FAQs
# Seeding completed!
```

---

## Phase 5: Verification & Testing (15 minutes)

### Step 14: Test Health Endpoint

```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://chatbot.yourdomain.com/health

# Test HTTPS
curl https://chatbot.yourdomain.com/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-02-02T12:00:00.000Z",
  "checks": {
    "database": { "status": "up", "responseTime": 5 },
    "api": { "status": "up", "responseTime": 0 },
    "messenger": { "status": "up" }
  },
  "version": "1.0.0",
  "uptime": 123
}
```

### Step 15: Test Metrics Endpoint

```bash
curl https://chatbot.yourdomain.com/metrics

# Should return metrics data
```

### Step 16: Test Webhook Endpoint (GET - Verification)

```bash
# Test webhook verification
curl "https://chatbot.yourdomain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test_challenge"

# Should return: test_challenge
```

### Step 17: SSL Certificate Verification

```bash
# Check SSL certificate
echo | openssl s_client -servername chatbot.yourdomain.com -connect chatbot.yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Should show valid dates
# notBefore=Feb 2 00:00:00 2026 GMT
# notAfter=May 3 00:00:00 2026 GMT
```

**Note:** If using Let's Encrypt with Nginx, certificates are stored at:
- `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

---

## Phase 6: Facebook Webhook Configuration (20 minutes)

### Step 18: Configure Webhook in Facebook Developer Console

1. **Go to Facebook Developer Console:**
   - Visit: https://developers.facebook.com/apps
   - Select your Mitsubishi Chatbot app

2. **Navigate to Messenger Settings:**
   - Left sidebar → Products → Messenger → Settings

3. **Add Webhook:**
   - Scroll to "Webhooks" section
   - Click "Add Callback URL"
   - **Callback URL:** `https://chatbot.yourdomain.com/webhook`
   - **Verify Token:** (use the same token from your .env file)
   - Click "Verify and Save"

4. **Subscribe to Events:**
   - Under Webhooks, click "Subscribe to events"
   - Select these events:
     - ✅ messages
     - ✅ messaging_postbacks
     - ✅ messaging_optins (optional)
   - Click "Save"

5. **Subscribe Your Page:**
   - Under "Webhooks", select your page from dropdown
   - Click "Subscribe"

6. **Get Page Access Token (if not done):**
   - Under "Access Tokens"
   - Click "Add or Remove Pages"
   - Select your page
   - Click "Generate Token"
   - Copy this token and add to your .env file if not already done

### Step 19: Test Facebook Webhook

1. **Send Test Message:**
   - Go to your Facebook Page
   - Click "Message" button
   - Send "hello"

2. **Check Logs:**
   ```bash
   # On your VPS, watch logs
   docker-compose -f docker-compose.prod.yml logs -f api
   
   # You should see:
   # Received message { senderId: "...", text: "hello" }
   # Sending text message to ...
   ```

3. **Verify Response:**
   - You should receive a welcome message in Messenger

---

## Phase 7: Production Hardening (15 minutes)

### Step 20: Configure Automatic Updates (Optional)

```bash
# Install unattended-upgrades for automatic security updates
apt install -y unattended-upgrades

# Configure
nano /etc/apt/apt.conf.d/50unattended-upgrades

# Enable automatic reboot if needed
# Uncomment: Unattended-Upgrade::Automatic-Reboot "true";
```

### Step 21: Setup Log Rotation

```bash
# Docker logs are already configured in docker-compose.prod.yml
# But let's also set up system log rotation

# Install logrotate configuration for your app
cat > /etc/logrotate.d/mitsubishi-chatbot << 'EOF'
/home/deploy/mitsubishi-chatbot/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        /usr/bin/docker-compose -f /home/deploy/mitsubishi-chatbot/docker-compose.prod.yml restart api
    endscript
}
EOF
```

### Step 22: Configure Fail2Ban (Security)

```bash
# Create custom filter for the chatbot
cat > /etc/fail2ban/filter.d/mitsubishi-chatbot.conf << 'EOF'
[Definition]
failregex = ^.*"POST /webhook.*" 403.*$
            ^.*"POST /webhook.*" 429.*$
ignoreregex =
EOF

# Add jail configuration
cat >> /etc/fail2ban/jail.local << 'EOF'

[mitsubishi-chatbot]
enabled = true
port = http,https
filter = mitsubishi-chatbot
logpath = /var/lib/docker/containers/*/*-json.log
maxretry = 10
bantime = 3600
findtime = 600
EOF

# Restart fail2ban
systemctl restart fail2ban

# Check status
fail2ban-client status mitsubishi-chatbot
```

### Step 23: Setup Backup Script

```bash
# Create backup script
cat > ~/backup-chatbot.sh << 'EOF'
#!/bin/bash

# Configuration
BACKUP_DIR="/home/deploy/backups"
DB_CONTAINER="mitsubishi-chatbot_db_1"
DB_NAME="mitsubishi_chatbot"
DB_USER="postgres"
RETENTION_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

# Create timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup database
echo "Creating database backup..."
docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz

# Backup environment file
cp /home/deploy/mitsubishi-chatbot/.env $BACKUP_DIR/env_backup_$TIMESTAMP

# Backup uploaded media (if any)
if [ -d "/home/deploy/mitsubishi-chatbot/uploads" ]; then
    tar -czf $BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz -C /home/deploy/mitsubishi-chatbot uploads
fi

# Remove old backups (older than retention days)
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "env_backup_*" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "uploads_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $TIMESTAMP"
EOF

# Make executable
chmod +x ~/backup-chatbot.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/deploy/backup-chatbot.sh >> /home/deploy/backup.log 2>&1") | crontab -

# Test backup
~/backup-chatbot.sh

# Check backup files
ls -lh ~/backups/
```

---

## Phase 8: Monitoring Setup (10 minutes)

### Step 24: Setup Basic Monitoring Alerts (Optional)

```bash
# Create health check script
cat > ~/health-check.sh << 'EOF'
#!/bin/bash

# Configuration
DOMAIN="chatbot.yourdomain.com"
EMAIL="your-email@example.com"  # Change this
WEBHOOK_URL="https://$DOMAIN/webhook"
HEALTH_URL="https://$DOMAIN/health"

# Check health endpoint
if ! curl -sf $HEALTH_URL > /dev/null; then
    echo "ALERT: Health check failed at $(date)" | mail -s "Chatbot Down - $DOMAIN" $EMAIL
    # Or use a webhook to Slack/Discord instead
fi

# Check SSL certificate expiration (alert if < 7 days)
EXPIRY=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_UNTIL_EXPIRY -lt 7 ]; then
    echo "WARNING: SSL certificate expires in $DAYS_UNTIL_EXPIRY days" | mail -s "SSL Expiring Soon - $DOMAIN" $EMAIL
fi
EOF

chmod +x ~/health-check.sh

# Run every hour
(crontab -l 2>/dev/null; echo "0 * * * * /home/deploy/health-check.sh") | crontab -
```

---

## Phase 9: Documentation & Handover (10 minutes)

### Step 25: Create Maintenance Documentation

Create a file `~/MAINTENANCE.md`:

```bash
cat > ~/MAINTENANCE.md << 'EOF'
# Mitsubishi Chatbot - Maintenance Guide

## Quick Commands

### View Logs
```bash
cd ~/mitsubishi-chatbot
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f db

# For Nginx logs (if using system Nginx)
sudo tail -f /var/log/nginx/caragent-chatbot-*.log
```

### Restart Services
```bash
cd ~/mitsubishi-chatbot
docker-compose -f docker-compose.prod.yml restart
```

### Update Application
```bash
cd ~/mitsubishi-chatbot
git pull  # If using git
docker-compose -f docker-compose.prod.yml up -d --build
```

### Database Backup
```bash
~/backup-chatbot.sh
```

### Check Service Status
```bash
cd ~/mitsubishi-chatbot
docker-compose -f docker-compose.prod.yml ps
```

### Access Database
```bash
cd ~/mitsubishi-chatbot
docker-compose -f docker-compose.prod.yml exec db psql -U postgres -d mitsubishi_chatbot
```

### View Real-time Metrics
```bash
curl https://chatbot.yourdomain.com/metrics
```

## Troubleshooting

### If API is not responding:
1. Check logs: `docker-compose -f docker-compose.prod.yml logs api`
2. Restart: `docker-compose -f docker-compose.prod.yml restart api`
3. Check database: `docker-compose -f docker-compose.prod.yml exec db pg_isready`

### If SSL certificate issues:
1. Check Nginx error logs: `sudo tail -f /var/log/nginx/caragent-chatbot-error.log`
2. Check Nginx configuration: `sudo nginx -t`
3. Verify SSL certificate paths in `/etc/nginx/sites-available/caragent-chatbot`
4. If using Let's Encrypt, renew certificates: `sudo certbot renew --dry-run`
5. Restart Nginx: `sudo systemctl restart nginx`
6. Verify domain DNS points to this server

### If Facebook webhook not working:
1. Check webhook URL is correct in Facebook settings
2. Verify META_VERIFY_TOKEN matches
3. Check logs: `docker-compose -f docker-compose.prod.yml logs api | grep webhook`

## Important Files
- Environment: `~/mitsubishi-chatbot/.env`
- Backups: `~/backups/`
- Docker Logs: Check with `docker-compose logs`
- Nginx Config: `/etc/nginx/sites-available/caragent-chatbot`
- Nginx Logs: `/var/log/nginx/caragent-chatbot-*.log`
- SSL Certs: `/etc/letsencrypt/live/YOUR_DOMAIN/` (if using Let's Encrypt)

## Support Contacts
- Developer: [Your Name] - [Your Email]
- Hosting Provider: [VPS Provider Support]
- Facebook Developer Support: https://developers.facebook.com/support
EOF
```

---

## 🎉 Deployment Complete!

### Final Verification Checklist

- [ ] All containers running (`docker-compose ps`)
- [ ] Health endpoint returns 200
- [ ] SSL certificate is valid
- [ ] Facebook webhook verified successfully
- [ ] Test message received response in Messenger
- [ ] Database seeded with car models
- [ ] Backups configured
- [ ] Monitoring enabled
- [ ] Documentation created

### What's Running Now

1. **API Server** (Node.js/Fastify)
   - Port 3000 (exposed on localhost for Nginx)
   - Handles webhook requests
   - AI-powered responses

2. **PostgreSQL Database**
   - Stores car data, quotes, sessions, FAQs
   - Persistent storage

3. **Nginx Reverse Proxy** (system service)
   - Port 80/443 (public)
   - SSL termination
   - Security headers and gzip compression

### Access Points

- **Public URL:** https://chatbot.yourdomain.com
- **Health Check:** https://chatbot.yourdomain.com/health
- **Metrics:** https://chatbot.yourdomain.com/metrics
- **Webhook:** https://chatbot.yourdomain.com/webhook

### Next Steps

1. **Test All Features:**
   - Send "hello" to test greeting
   - Send "models" to see car catalog
   - Send "quote" to test quotation flow
   - Ask a FAQ like "What is the warranty?"

2. **Add More Data:**
   - Add more car models via database
   - Upload real car photos
   - Add more FAQs
   - Customize price rules for your region

3. **Monitor Performance:**
   - Check metrics daily initially
   - Review logs weekly
   - Monitor Facebook insights

4. **Maintenance Schedule:**
   - Weekly: Check logs and metrics
   - Monthly: Review and rotate backups
   - Quarterly: Update dependencies
   - As needed: Update car pricing

---

## 📞 Troubleshooting Common Issues

### Issue 1: "Connection Refused" Error
```bash
# Check if containers are running
docker-compose -f docker-compose.prod.yml ps

# Restart if needed
docker-compose -f docker-compose.prod.yml restart

# Check firewall
ufw status
```

### Issue 2: SSL Certificate Issues
```bash
# Check Nginx error logs
sudo tail -f /var/log/nginx/caragent-chatbot-error.log

# Verify domain points to server
dig +short chatbot.yourdomain.com

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# If using Let's Encrypt, check certificate status
sudo certbot certificates
sudo certbot renew --dry-run
```

### Issue 3: Database Connection Failed
```bash
# Check database container
docker-compose -f docker-compose.prod.yml ps db

# Check logs
docker-compose -f docker-compose.prod.yml logs db

# Run migrations manually
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### Issue 4: Facebook Webhook Verification Failed
```bash
# Check environment variables
cat .env | grep META

# Verify token matches Facebook settings
# Test verification manually:
curl "https://chatbot.yourdomain.com/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test"
```

---

**Total Estimated Time: 2.5 - 3 hours**  
**Maintenance Required: Minimal (automated backups & monitoring)**

**You're all set! 🚀**
