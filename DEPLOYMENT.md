# Mitsubishi Car Agent Chatbot - Deployment Guide

## 📋 Project Overview

A production-ready Facebook Messenger chatbot for Mitsubishi car dealerships with:
- ✅ Car catalog (models, variants, specs, photos)
- ✅ Automated quotations (cash & financing)
- ✅ AI-powered FAQ with guardrails
- ✅ Rate limiting & monitoring
- ✅ Automatic HTTPS

## 🚀 Quick Start (Production)

### Prerequisites
- Linux server with Docker & Docker Compose
- Domain name pointing to your server
- Facebook App with Messenger product configured

### 1. Clone & Setup
```bash
# Clone repository
git clone <your-repo-url>
cd mitsubishi-chatbot

# Copy environment file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### 2. Configure Environment Variables
Edit `.env` with your actual values:

```bash
# Required
DOMAIN=chatbot.yourcompany.com
POSTGRES_PASSWORD=your_secure_password_123
META_PAGE_ACCESS_TOKEN=your_facebook_token
META_VERIFY_TOKEN=your_webhook_token
META_APP_SECRET=your_app_secret

# Optional but recommended
OPENAI_API_KEY=your_openai_key
```

### 3. Deploy
```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
```

### 4. Run Migrations & Seed Data
```bash
# Apply database migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# Seed with initial data
docker-compose -f docker-compose.prod.yml exec api npx prisma db seed
```

### 5. Configure Facebook Webhook
1. Go to https://developers.facebook.com/apps
2. Select your app → Messenger → Settings
3. Webhooks → Edit Callback URL
4. Enter: `https://chatbot.yourcompany.com/webhook`
5. Verify Token: (match your META_VERIFY_TOKEN)
6. Subscribe to events: messages, messaging_postbacks

## 📊 Milestones Completed

### ✅ Milestone 1: Foundation
- [x] Node.js/TypeScript project setup
- [x] Docker & docker-compose configuration
- [x] Environment variable management
- [x] Health check endpoint
- [x] Prisma ORM with PostgreSQL
- [x] Database migrations
- [x] Seed scripts

### ✅ Milestone 2: Messenger Plumbing
- [x] Webhook verification (GET /webhook)
- [x] Message receiver (POST /webhook)
- [x] Send API client (text, images, carousels)
- [x] Basic greeting & echo responses
- [x] Structured logging

### ✅ Milestone 3: Catalog & Media
- [x] Full database schema (CarModel, CarVariant, CarMedia)
- [x] "Show Models" flow
- [x] "Show Photos" flow (carousel gallery)
- [x] "Show Specs" flow with PDF support
- [x] Fuzzy search for variants

### ✅ Milestone 4: Quotation
- [x] Pricing engine (SRP + fees + promos)
- [x] Quote flow state machine
- [x] Cash & financing calculations
- [x] Quote generation & storage
- [x] Database schema for quotes

### ✅ Milestone 5: LLM Q&A + Guardrails
- [x] LLM client (OpenAI, Anthropic, Gemini support)
- [x] Intent detection with entity extraction
- [x] RAG for FAQs (12 initial FAQs)
- [x] Content safety guardrails
- [x] Pricing/specs guardrails
- [x] Input sanitization

### ✅ Milestone 6: Production Hardening
- [x] Caddy reverse proxy with auto HTTPS
- [x] Rate limiting (100 req/min general, 1000 req/min webhook)
- [x] Monitoring & metrics endpoint
- [x] Health checks with database status
- [x] Security headers & HSTS
- [x] Structured logging
- [x] Production docker-compose

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              User (Facebook Messenger)           │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────┐
│              Caddy Reverse Proxy                │
│  • Auto HTTPS (Let's Encrypt)                   │
│  • Security headers                             │
│  • Rate limiting                                │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              API (Node.js/Fastify)              │
│  • Webhook handlers                             │
│  • Intent detection (LLM)                       │
│  • RAG FAQ service                              │
│  • Quote flow engine                            │
│  • Guardrails                                   │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│              PostgreSQL Database                │
│  • Car models & variants                        │
│  • Media (photos, PDFs)                         │
│  • Quotes & sessions                            │
│  • FAQs                                         │
└─────────────────────────────────────────────────┘
```

## 🔧 Available Commands

### Development
```bash
# Local development
docker-compose up

# Run migrations
cd api && npx prisma migrate dev

# Seed database
cd api && npx prisma db seed

# View logs
docker-compose logs -f api
```

### Production
```bash
# Deploy
docker-compose -f docker-compose.prod.yml up -d

# Scale API (if needed)
docker-compose -f docker-compose.prod.yml up -d --scale api=2

# View logs
docker-compose -f docker-compose.prod.yml logs -f api

# Update (after code changes)
docker-compose -f docker-compose.prod.yml up -d --build

# Backup database
docker-compose -f docker-compose.prod.yml exec db pg_dump -U postgres mitsubishi_chatbot > backup.sql
```

## 🔍 Monitoring & Debugging

### Health Checks
```bash
# Overall health
curl https://chatbot.yourcompany.com/health

# Response example:
{
  "status": "healthy",
  "timestamp": "2026-02-02T12:00:00.000Z",
  "checks": {
    "database": { "status": "up", "responseTime": 5 },
    "api": { "status": "up", "responseTime": 0 },
    "messenger": { "status": "up" }
  },
  "version": "1.0.0",
  "uptime": 86400
}
```

### Metrics
```bash
# Get metrics
curl https://chatbot.yourcompany.com/metrics

# Response example:
{
  "timestamp": "2026-02-02T12:00:00.000Z",
  "totalRequests": 1500,
  "successfulRequests": 1480,
  "failedRequests": 20,
  "averageResponseTime": 245,
  "activeUsers": 45,
  "popularIntents": [],
  "uptime": "1d 2h 30m"
}
```

### Logs
```bash
# View API logs
docker-compose -f docker-compose.prod.yml logs -f api

# View Caddy logs
docker-compose -f docker-compose.prod.yml logs -f caddy

# View database logs
docker-compose -f docker-compose.prod.yml logs -f db
```

## 🛡️ Security Features

### Implemented
- ✅ Automatic HTTPS (Let's Encrypt)
- ✅ HSTS (HTTP Strict Transport Security)
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ Rate limiting per IP
- ✅ Input sanitization
- ✅ Content security policy
- ✅ Helmet.js protection
- ✅ CORS configured

### Best Practices
- Never commit `.env` to git
- Use strong database password (20+ chars)
- Rotate Facebook tokens periodically
- Monitor logs for suspicious activity
- Keep dependencies updated
- Use non-root user in containers (future improvement)

## 📝 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes | localhost | Your domain name |
| `POSTGRES_PASSWORD` | Yes | - | Database password |
| `META_PAGE_ACCESS_TOKEN` | Yes | - | Facebook Page token |
| `META_VERIFY_TOKEN` | Yes | - | Webhook verify token |
| `META_APP_SECRET` | Yes | - | Facebook App secret |
| `OPENAI_API_KEY` | No | - | For AI features |
| `RATE_LIMIT_MAX` | No | 100 | Max requests per window |
| `RATE_LIMIT_WINDOW` | No | 1 minute | Rate limit window |

## 🚨 Troubleshooting

### Common Issues

**Webhook verification fails:**
- Check META_VERIFY_TOKEN matches Facebook settings
- Ensure domain is accessible from internet
- Verify SSL certificate is valid

**Database connection errors:**
- Check POSTGRES_PASSWORD is set correctly
- Ensure database container is running: `docker-compose ps`
- Check logs: `docker-compose logs db`

**Rate limiting too strict:**
- Increase RATE_LIMIT_MAX in .env
- Restart: `docker-compose up -d`

**Messenger messages not received:**
- Verify webhook URL in Facebook settings
- Check page subscription is active
- Review API logs for errors

### Getting Help
- Check logs: `docker-compose logs -f`
- Review this documentation
- Check Facebook Developer documentation
- Open an issue in the repository

## 📚 Additional Resources

- [Facebook Messenger Platform Docs](https://developers.facebook.com/docs/messenger-platform)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Caddy Documentation](https://caddyserver.com/docs/)

## 🎯 Next Steps / Future Enhancements

- [ ] Vector embeddings for better FAQ matching
- [ ] Admin dashboard for managing cars/FAQs
- [ ] Analytics dashboard
- [ ] Multi-language support
- [ ] Voice messages support
- [ ] Appointment booking integration
- [ ] CRM integration
- [ ] A/B testing for responses

## 📄 License

MIT License - See LICENSE file for details

---

**Version:** 1.0.0  
**Last Updated:** February 2026  
**Maintainer:** Your Name
