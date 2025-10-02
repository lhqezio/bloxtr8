# Deployment Guide

This guide covers deploying Bloxtr8 to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Application Deployment](#application-deployment)
- [Post-Deployment](#post-deployment)
- [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Infrastructure Requirements

- **Database**: PostgreSQL 14+ (AWS RDS, Supabase, etc.)
- **Hosting**:
  - API: Node.js hosting (Railway, Render, AWS ECS)
  - Bot: Long-running process hosting
  - Web: Static hosting (Vercel, Cloudflare Pages)
- **Storage**: AWS S3 bucket for contract PDFs
- **DNS**: Custom domain configured

### External Services

- Discord Application (Bot + OAuth)
- Roblox OAuth credentials
- Stripe account (production mode)
- TRM Labs API key
- Chainalysis API key
- AWS account (S3 access)

## Environment Setup

### 1. Production Environment Variables

Create `.env.production.local`:

```env
# Node
NODE_ENV=production

# Database
DATABASE_URL="postgresql://user:password@host:5432/bloxtr8"
DATABASE_URL_PRISMA="postgresql://user:password@host:5432/bloxtr8"

# API
PORT=3000
API_URL="https://api.bloxtr8.com"
WEB_APP_URL="https://app.bloxtr8.com"

# Security
JWT_SECRET="<64-char-random-string>"

# Discord
DISCORD_CLIENT_ID="production_client_id"
DISCORD_CLIENT_SECRET="production_client_secret"
DISCORD_BOT_TOKEN="production_bot_token"
DISCORD_GUILD_ID="production_guild_id"

# Roblox
ROBLOX_CLIENT_ID="production_client_id"
ROBLOX_CLIENT_SECRET="production_client_secret"

# Stripe
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# USDC/Base
CUSTODIAN_API_KEY="production_api_key"
CUSTODIAN_WEBHOOK_SECRET="production_webhook_secret"

# AWS S3
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_S3_BUCKET="bloxtr8-contracts"
AWS_REGION="us-east-1"

# Risk Screening
TRM_API_KEY="production_key"
CHAINALYSIS_API_KEY="production_key"

# Monitoring
SENTRY_DSN="https://...@sentry.io/..."
LOG_LEVEL="info"
```

### 2. Encrypt Environment Variables

```bash
# Encrypt production environment
pnpm env:encrypt:prod

# Commit encrypted file
git add .env.production
git commit -m "chore: update production environment"
git push
```

### 3. Set Private Keys

In your deployment platform, set environment variable:

```bash
DOTENV_PRIVATE_KEY_PRODUCTION="your_production_private_key"
```

## Database Setup

### 1. Create Production Database

**AWS RDS**:

```bash
# Create PostgreSQL RDS instance
aws rds create-db-instance \
  --db-instance-identifier bloxtr8-prod \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16.1 \
  --master-username postgres \
  --master-user-password <secure-password> \
  --allocated-storage 20 \
  --backup-retention-period 7 \
  --multi-az
```

**Supabase**:

1. Create new project
2. Copy connection string
3. Enable connection pooling

### 2. Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://..."

# Run migrations
pnpm db:migrate

# Verify
pnpm db:studio
```

### 3. Set Up Backups

**AWS RDS**:

- Automated daily backups (configured above)
- Manual snapshots before deployments

**Supabase**:

- Automatic daily backups included
- Point-in-time recovery enabled

## Application Deployment

### Deployment Options

#### Option 1: Docker Deployment

**Build Image**:

```bash
# Build production image
docker build -f Dockerfile.prod -t bloxtr8-api:latest .

# Tag for registry
docker tag bloxtr8-api:latest registry.example.com/bloxtr8-api:latest

# Push to registry
docker push registry.example.com/bloxtr8-api:latest
```

**Deploy with Docker Compose**:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: registry.example.com/bloxtr8-api:latest
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - DOTENV_PRIVATE_KEY_PRODUCTION=${DOTENV_PRIVATE_KEY_PRODUCTION}
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  bot:
    image: registry.example.com/bloxtr8-bot:latest
    environment:
      - NODE_ENV=production
      - DOTENV_PRIVATE_KEY_PRODUCTION=${DOTENV_PRIVATE_KEY_PRODUCTION}
    restart: unless-stopped
```

```bash
docker-compose -f docker-compose.prod.yml up -d
```

#### Option 2: Railway

**Setup**:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Link to project
railway link

# Deploy
railway up
```

**Environment Variables**: Set in Railway dashboard

**Build Command**: `pnpm build`

**Start Command**: `pnpm start`

#### Option 3: Render

**render.yaml**:

```yaml
services:
  - type: web
    name: bloxtr8-api
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: bloxtr8-db
          property: connectionString
      - key: DOTENV_PRIVATE_KEY_PRODUCTION
        sync: false # Set manually
    healthCheckPath: /health

  - type: worker
    name: bloxtr8-bot
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: pnpm --filter=@bloxtr8/discord-bot start
    envVars:
      - key: NODE_ENV
        value: production

databases:
  - name: bloxtr8-db
    databaseName: bloxtr8
    plan: starter
    postgresMajorVersion: 16
```

Deploy:

```bash
render deploy
```

#### Option 4: AWS ECS

1. **Build and push Docker image** (see Docker option)

2. **Create ECS Task Definition**:

```json
{
  "family": "bloxtr8-api",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "registry.example.com/bloxtr8-api:latest",
      "memory": 512,
      "cpu": 256,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "hostPort": 3000
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:..."
        }
      ]
    }
  ]
}
```

3. **Create ECS Service**
4. **Configure ALB**
5. **Set up Auto Scaling**

### Web App Deployment (Vercel)

**vercel.json**:

```json
{
  "buildCommand": "pnpm --filter=@bloxtr8/web-app build",
  "outputDirectory": "apps/web-app/dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.bloxtr8.com/api/:path*"
    }
  ]
}
```

Deploy:

```bash
vercel --prod
```

## Post-Deployment

### 1. Verify Deployment

```bash
# Check API health
curl https://api.bloxtr8.com/health

# Test authentication
curl -X POST https://api.bloxtr8.com/api/users/ensure \
  -H "Content-Type: application/json" \
  -d '{"discordId":"test","username":"test"}'

# Test Discord bot
# Run /ping in Discord
```

### 2. Monitor Logs

```bash
# Docker
docker logs -f bloxtr8-api

# Railway
railway logs

# Render
render logs
```

### 3. Configure Monitoring

- Set up Sentry error tracking
- Configure uptime monitoring (UptimeRobot, Pingdom)
- Set up log aggregation (Datadog, LogDNA)
- Configure alerts for:
  - API errors
  - Database connection failures
  - High response times
  - Memory/CPU usage

### 4. Set Up Webhooks

**Stripe**:

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://api.bloxtr8.com/api/webhooks/stripe`
3. Select events: `payment_intent.*`, `transfer.*`
4. Copy webhook secret to environment

**Custodian**:

1. Configure webhook URL in custodian dashboard
2. Copy webhook secret to environment

### 5. DNS Configuration

```
A     api.bloxtr8.com    → API server IP
A     app.bloxtr8.com    → Web app IP
CNAME www.bloxtr8.com    → app.bloxtr8.com
```

### 6. SSL Certificates

- Use Let's Encrypt or platform-provided SSL
- Enable HTTPS redirects
- Configure HSTS headers

## CI/CD Pipeline

**GitHub Actions** (`.github/workflows/deploy.yml`):

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install pnpm
        run: corepack enable

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          DOTENV_PRIVATE_KEY_PRODUCTION: ${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}

      - name: Deploy to Railway
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Rollback Procedures

### 1. Application Rollback

**Docker**:

```bash
# Rollback to previous image
docker pull registry.example.com/bloxtr8-api:previous
docker-compose -f docker-compose.prod.yml up -d
```

**Railway**:

```bash
railway rollback
```

**Render**: Use Render dashboard to rollback

### 2. Database Rollback

```bash
# Revert last migration
pnpm db:migrate:rollback

# Restore from backup
pg_restore -h host -U user -d bloxtr8 backup.sql
```

### 3. Hotfix Deployment

```bash
# Create hotfix branch
git checkout -b hotfix/critical-fix

# Make fix
# ...

# Deploy immediately
git push origin hotfix/critical-fix
# Trigger manual deployment
```

## Scaling Considerations

### Horizontal Scaling

- **API**: Add more instances behind load balancer
- **Database**: Enable read replicas
- **Bot**: Single instance (Discord limitation)

### Vertical Scaling

- Upgrade instance types based on metrics
- Monitor CPU, memory, and database connections

### Performance Optimization

- Enable CDN for static assets
- Implement caching (Redis)
- Optimize database queries
- Use connection pooling

## Security Checklist

- [ ] Environment variables encrypted
- [ ] Database credentials secured
- [ ] SSL/TLS enabled
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Webhook signatures verified
- [ ] Logging excludes sensitive data
- [ ] Backups automated
- [ ] Access logs enabled
- [ ] Security headers configured

## Support

For deployment issues:

- Check documentation
- Review logs
- Contact: devops@bloxtr8.com
