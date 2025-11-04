# Escrow Services Deployment Documentation

This document provides comprehensive deployment procedures, environment configuration, and operational guidance for the Escrow Services (Escrow Service and API Gateway).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Environment Variables](#environment-variables)
4. [Configuration](#configuration)
5. [Deployment Procedures](#deployment-procedures)
6. [Post-Deployment Verification](#post-deployment-verification)
7. [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Infrastructure Requirements

#### Database
- **PostgreSQL 14+** (required)
  - AWS RDS, Supabase, or self-hosted
  - Minimum: 2 vCPU, 4GB RAM
  - Recommended: 4 vCPU, 8GB RAM for production
  - Connection pooling enabled (recommended: 20-50 connections)
  - Automated backups configured

#### Event Bus
- **Apache Kafka 2.8+** (required)
  - Kafka cluster with at least 3 brokers (production)
  - Topics: `escrow-commands`, `escrow.events.v1`
  - Replication factor: 3 (production)
  - Partitions: 12 for `escrow.events.v1`, 6 for `escrow-commands`
  - Retention: 90 days
  - Compression: `snappy` or `lz4`

#### Optional Components
- **Redis 6+** (optional, for idempotency cache)
  - Used for high-throughput idempotency checks
  - Fallback to database if Redis unavailable
  - TTL: 1 hour for completed commands

#### Hosting Platforms
- **API Gateway**: Node.js hosting (Railway, Render, AWS ECS, Kubernetes)
- **Escrow Service**: Long-running process hosting (same platforms)
- **Outbox Publisher**: Can run as separate worker or integrated with Escrow Service

### External Services

#### Payment Providers
- **Stripe Account** (production mode)
  - API keys configured
  - Webhook endpoint configured
  - Connect account for marketplace payouts

- **Custodian Service** (for USDC/Base)
  - Coinbase Prime or similar custodial service
  - API credentials configured
  - Webhook endpoint configured

#### Risk Screening
- **TRM Labs API** key
- **Chainalysis API** key

#### Storage
- **AWS S3** bucket for contract PDFs and evidence
- **MinIO** (development/testing only)

### Dependencies

- **Node.js 20+** (LTS recommended)
- **pnpm 8+** package manager
- **Docker** and **Docker Compose** (for containerized deployments)
- **PostgreSQL client tools** (`psql`)

## Pre-Deployment Checklist

### 1. Database Setup

```bash
# Verify database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Run migrations
pnpm db:migrate:deploy

# Verify schema
psql $DATABASE_URL -c "\dt" | grep -E "(escrows|escrow_events|outbox|command_idempotency)"
```

**Required Tables:**
- `escrows`
- `escrow_events`
- `outbox`
- `command_idempotency` (if using database idempotency)
- `stripe_escrows`
- `stablecoin_escrows`
- `milestone_escrows`
- `deliveries`
- `disputes`
- `audit_logs`

**Required Indexes:**
- `escrows.offerId`
- `escrows.contractId`
- `escrows.status`
- `escrows.rail`
- `escrows.expiresAt`
- `escrows.autoRefundAt`
- `escrow_events.escrowId`
- `outbox.publishedAt` (partial index for unpublished events)

### 2. Kafka Topics Setup

```bash
# Create escrow-commands topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic escrow-commands \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=7776000000 \
  --config compression.type=snappy

# Create escrow.events.v1 topic
kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic escrow.events.v1 \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=7776000000 \
  --config compression.type=snappy \
  --config cleanup.policy=compact

# Verify topics
kafka-topics.sh --list --bootstrap-server localhost:9092
```

**Topic Configuration:**
- **escrow-commands**: Partition key = `escrowId` (ensures ordering per escrow)
- **escrow.events.v1**: Partition key = `escrowId` (ensures ordering per escrow)

### 3. Secrets Configuration

Ensure all secrets are configured:
- Database credentials
- Kafka broker URLs and credentials
- Stripe API keys and webhook secrets
- Custodian API keys and webhook secrets
- JWT secret (64+ character random string)
- AWS credentials
- TRM Labs and Chainalysis API keys

### 4. Webhook Configuration

**Stripe Webhooks:**
- Endpoint: `https://api.bloxtr8.com/api/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `transfer.created`
- Webhook secret stored in `STRIPE_WEBHOOK_SECRET`

**Custodian Webhooks:**
- Endpoint: `https://api.bloxtr8.com/api/webhooks/custodian`
- Events: Deposit confirmed, transfer completed
- Webhook secret stored in `CUSTODIAN_WEBHOOK_SECRET`

### 5. Health Check Endpoints

Verify health check endpoints are accessible:
- API Gateway: `GET /health`
- Escrow Service: `GET /health` (if exposed)

## Environment Variables

### Required Environment Variables

#### Application Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `production` | Yes |
| `PORT` | API Gateway port | `3000` | Yes |
| `LOG_LEVEL` | Logging level | `info` | No (default: `info`) |

#### Database Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/bloxtr8` | Yes |
| `DATABASE_URL_PRISMA` | Prisma-specific connection string | Same as `DATABASE_URL` | Yes |
| `DATABASE_POOL_SIZE` | Connection pool size | `20` | No (default: `10`) |
| `DATABASE_POOL_TIMEOUT` | Connection pool timeout (ms) | `30000` | No (default: `20000`) |

#### Kafka Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `KAFKA_BROKERS` | Comma-separated Kafka broker URLs | `kafka1:9092,kafka2:9092,kafka3:9092` | Yes |
| `KAFKA_CLIENT_ID` | Kafka client identifier | `escrow-service-prod` | Yes |
| `KAFKA_GROUP_ID` | Consumer group ID | `escrow-service-group` | Yes |
| `KAFKA_COMMANDS_TOPIC` | Commands topic name | `escrow-commands` | No (default: `escrow-commands`) |
| `KAFKA_EVENTS_TOPIC` | Events topic name | `escrow.events.v1` | No (default: `escrow.events.v1`) |
| `KAFKA_SASL_USERNAME` | SASL username (if using SASL) | `kafka-user` | No |
| `KAFKA_SASL_PASSWORD` | SASL password (if using SASL) | `kafka-pass` | No |
| `KAFKA_SASL_MECHANISM` | SASL mechanism | `plain` | No |
| `KAFKA_SSL_ENABLED` | Enable SSL | `true` | No (default: `false`) |

#### API Gateway Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `API_URL` | Public API base URL | `https://api.bloxtr8.com` | Yes |
| `WEB_APP_URL` | Web application URL | `https://app.bloxtr8.com` | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Random 64-char string | Yes |
| `CORS_ORIGINS` | Allowed CORS origins | `https://app.bloxtr8.com,https://www.bloxtr8.com` | No |

#### Escrow Service Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `ESCROW_PAYMENT_DEADLINE_DAYS` | Payment deadline (days) | `7` | No (default: `7`) |
| `ESCROW_AUTO_REFUND_DEADLINE_DAYS` | Auto-refund deadline (days) | `7` | No (default: `7`) |
| `ESCROW_TIMEOUT_POLL_INTERVAL_MINUTES` | Timeout processor interval | `5` | No (default: `5`) |
| `ESCROW_MAX_RETRIES` | Max command retry attempts | `3` | No (default: `3`) |
| `ESCROW_RETRY_DELAY_MS` | Retry delay (milliseconds) | `1000` | No (default: `1000`) |

#### Payment Providers

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | `whsec_...` | Yes |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Connect client ID | `ca_...` | No |
| `CUSTODIAN_API_KEY` | Custodian API key | `api_key_...` | Yes |
| `CUSTODIAN_API_URL` | Custodian API base URL | `https://api.custodian.com` | Yes |
| `CUSTODIAN_WEBHOOK_SECRET` | Custodian webhook secret | `whsec_...` | Yes |

#### Risk Screening

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `TRM_API_KEY` | TRM Labs API key | `trm_key_...` | Yes |
| `TRM_API_URL` | TRM Labs API URL | `https://api.trmlabs.com` | No (default: TRM URL) |
| `CHAINALYSIS_API_KEY` | Chainalysis API key | `chain_key_...` | Yes |
| `CHAINALYSIS_API_URL` | Chainalysis API URL | `https://api.chainalysis.com` | No (default: Chainalysis URL) |

#### Storage

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `AWS_ACCESS_KEY_ID` | AWS access key | `AKIA...` | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `...` | Yes |
| `AWS_S3_BUCKET` | S3 bucket name | `bloxtr8-contracts` | Yes |
| `AWS_REGION` | AWS region | `us-east-1` | Yes |

#### Idempotency Configuration

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `IDEMPOTENCY_STORAGE` | Storage backend (`database` or `redis`) | `database` | No (default: `database`) |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | No (required if `IDEMPOTENCY_STORAGE=redis`) |
| `IDEMPOTENCY_TTL_HOURS` | Idempotency record TTL | `24` | No (default: `24`) |

#### Monitoring

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `SENTRY_DSN` | Sentry error tracking DSN | `https://...@sentry.io/...` | No |
| `SENTRY_ENVIRONMENT` | Sentry environment | `production` | No |
| `METRICS_ENABLED` | Enable metrics collection | `true` | No (default: `false`) |
| `METRICS_PORT` | Metrics endpoint port | `9090` | No (default: `9090`) |

#### Feature Flags

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `FEATURE_MILESTONE_ESCROWS` | Enable milestone escrows | `true` | No (default: `true`) |
| `FEATURE_AUTO_REFUND` | Enable auto-refund | `true` | No (default: `true`) |
| `FEATURE_KYC_GATING` | Enable KYC gating | `true` | No (default: `true`) |

### Environment Variable Validation

The application validates required environment variables on startup. Missing variables will cause the service to fail with a clear error message.

```bash
# Example validation error
Error: Missing required environment variables: DATABASE_URL, KAFKA_BROKERS
Please check your .env file or environment configuration.
```

## Configuration

### State Machine Configuration

The escrow state machine enforces valid transitions:

```typescript
const VALID_TRANSITIONS = {
  AWAIT_FUNDS: ['FUNDS_HELD', 'CANCELLED'],
  FUNDS_HELD: ['DELIVERED', 'DISPUTED', 'REFUNDED'],
  DELIVERED: ['RELEASED', 'DISPUTED', 'REFUNDED'],
  DISPUTED: ['RELEASED', 'REFUNDED'],
  RELEASED: [], // Terminal
  REFUNDED: [], // Terminal
  CANCELLED: [], // Terminal
};
```

**Timeout Configuration:**
- **Payment Deadline**: `ESCROW_PAYMENT_DEADLINE_DAYS` (default: 7 days)
  - Escrows in `AWAIT_FUNDS` expire after this period
  - Automatically transition to `CANCELLED`
  
- **Auto-Refund Deadline**: `ESCROW_AUTO_REFUND_DEADLINE_DAYS` (default: 7 days)
  - Escrows in `DELIVERED` auto-refund if buyer doesn't confirm
  - Automatically transition to `REFUNDED`

**Timeout Processor:**
- Runs every `ESCROW_TIMEOUT_POLL_INTERVAL_MINUTES` (default: 5 minutes)
- Processes expired escrows and auto-refunds
- Idempotent: Multiple instances can run safely

### Kafka Topic Configuration

**Topic: `escrow-commands`**
- Partitions: 6
- Replication Factor: 3 (production)
- Retention: 90 days
- Compression: `snappy`
- Partition Key: `escrowId` (ensures ordering per escrow)

**Topic: `escrow.events.v1`**
- Partitions: 12
- Replication Factor: 3 (production)
- Retention: 90 days
- Compression: `snappy`
- Cleanup Policy: `compact` (key-based deduplication)
- Partition Key: `escrowId` (ensures ordering per escrow)

### Database Connection Pooling

**Prisma Connection Pool:**
- Default pool size: 10 connections
- Configurable via `DATABASE_POOL_SIZE`
- Connection timeout: 20 seconds (configurable)
- Idle timeout: 30 seconds

**Recommendations:**
- Development: 5-10 connections
- Production: 20-50 connections (depending on load)
- Maximum: Database max_connections / number of instances

### Idempotency Configuration

**Storage Backend:**
- **Database** (default): Strong consistency, suitable for all scenarios
- **Redis** (optional): Faster lookups, eventual consistency acceptable

**TTL:**
- Default: 24 hours
- Configurable via `IDEMPOTENCY_TTL_HOURS`
- Records older than TTL are cleaned up daily

**Retry Strategy:**
- Max retries: `ESCROW_MAX_RETRIES` (default: 3)
- Retry delay: `ESCROW_RETRY_DELAY_MS` (default: 1000ms)
- Exponential backoff: Enabled

### Outbox Publisher Configuration

**Polling Interval:**
- Default: 1000ms (1 second)
- Batch size: 100 events per poll
- Ordering: Process events in creation order (`ORDER BY createdAt ASC`)

**Error Handling:**
- Failed events are retried on next poll
- Exponential backoff for persistent failures
- Dead letter queue after 10 failed attempts

### Rate Limiting

**API Gateway Rate Limits:**
- Default: 100 requests/minute per IP
- Configurable per endpoint
- Escrow endpoints: 50 requests/minute per user

**Kafka Consumer:**
- Max concurrent processing: 10 commands per instance
- Configurable via consumer concurrency settings

## Deployment Procedures

### Docker-Based Deployment

#### 1. Build Docker Images

```bash
# Build API Gateway image
docker build -f apps/api/Dockerfile -t bloxtr8-api:latest .

# Build Escrow Service image (if separate)
docker build -f apps/escrow-service/Dockerfile -t bloxtr8-escrow-service:latest .
```

#### 2. Create Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  api-gateway:
    image: bloxtr8-api:latest
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - KAFKA_BROKERS=${KAFKA_BROKERS}
      - JWT_SECRET=${JWT_SECRET}
      # ... other environment variables
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - postgres
      - kafka

  escrow-service:
    image: bloxtr8-escrow-service:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - KAFKA_BROKERS=${KAFKA_BROKERS}
      - KAFKA_GROUP_ID=escrow-service-group
      # ... other environment variables
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3001/health']
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - postgres
      - kafka

  outbox-publisher:
    image: bloxtr8-escrow-service:latest
    command: ["node", "apps/escrow-service/dist/outbox-publisher.js"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - KAFKA_BROKERS=${KAFKA_BROKERS}
      # ... other environment variables
    restart: unless-stopped
    depends_on:
      - postgres
      - kafka

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=bloxtr8
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      - KAFKA_BROKER_ID=1
      - KAFKA_ZOOKEEPER_CONNECT=zookeeper:2181
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
    depends_on:
      - zookeeper
    restart: unless-stopped

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    environment:
      - ZOOKEEPER_CLIENT_PORT=2181
    restart: unless-stopped

volumes:
  postgres_data:
```

#### 3. Deploy

```bash
# Load environment variables
source .env.production

# Deploy stack
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f api-gateway
```

### Railway Deployment

#### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

#### 2. Create Project

```bash
# Initialize Railway project
railway init

# Link to existing project
railway link <project-id>
```

#### 3. Configure Services

**API Gateway Service:**
```bash
railway service create api-gateway
railway service link api-gateway

# Set environment variables
railway variables set NODE_ENV=production
railway variables set DATABASE_URL=$DATABASE_URL
railway variables set KAFKA_BROKERS=$KAFKA_BROKERS
# ... set all required variables

# Configure build and start commands
railway variables set BUILD_COMMAND="pnpm --filter @bloxtr8/api build"
railway variables set START_COMMAND="node apps/api/dist/index.js"
```

**Escrow Service:**
```bash
railway service create escrow-service
railway service link escrow-service

# Set environment variables
railway variables set NODE_ENV=production
railway variables set DATABASE_URL=$DATABASE_URL
railway variables set KAFKA_BROKERS=$KAFKA_BROKERS
railway variables set KAFKA_GROUP_ID=escrow-service-group
# ... set all required variables

# Configure build and start commands
railway variables set BUILD_COMMAND="pnpm --filter @bloxtr8/escrow-service build"
railway variables set START_COMMAND="node apps/escrow-service/dist/index.js"
```

#### 4. Deploy

```bash
# Deploy API Gateway
railway up --service api-gateway

# Deploy Escrow Service
railway up --service escrow-service
```

### Render Deployment

#### 1. Create `render.yaml`

```yaml
services:
  - type: web
    name: bloxtr8-api-gateway
    env: node
    buildCommand: pnpm install && pnpm --filter @bloxtr8/api build
    startCommand: node apps/api/dist/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: bloxtr8-db
          property: connectionString
      - key: KAFKA_BROKERS
        sync: false # Set manually
      # ... other environment variables
    healthCheckPath: /health

  - type: worker
    name: bloxtr8-escrow-service
    env: node
    buildCommand: pnpm install && pnpm --filter @bloxtr8/escrow-service build
    startCommand: node apps/escrow-service/dist/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: bloxtr8-db
          property: connectionString
      - key: KAFKA_BROKERS
        sync: false # Set manually
      - key: KAFKA_GROUP_ID
        value: escrow-service-group
      # ... other environment variables

  - type: worker
    name: bloxtr8-outbox-publisher
    env: node
    buildCommand: pnpm install && pnpm --filter @bloxtr8/escrow-service build
    startCommand: node apps/escrow-service/dist/outbox-publisher.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: bloxtr8-db
          property: connectionString
      - key: KAFKA_BROKERS
        sync: false # Set manually
      # ... other environment variables

databases:
  - name: bloxtr8-db
    databaseName: bloxtr8
    plan: starter
    postgresMajorVersion: 16
```

#### 2. Deploy

```bash
# Install Render CLI
npm install -g render-cli

# Deploy
render deploy
```

### AWS ECS Deployment

#### 1. Build and Push Docker Image

```bash
# Build image
docker build -f apps/api/Dockerfile -t bloxtr8-api:latest .

# Tag for ECR
docker tag bloxtr8-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/bloxtr8-api:latest

# Push to ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/bloxtr8-api:latest
```

#### 2. Create ECS Task Definition

```json
{
  "family": "bloxtr8-api-gateway",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "api-gateway",
      "image": "<account-id>.dkr.ecr.<region>.amazonaws.com/bloxtr8-api:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
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
          "valueFrom": "arn:aws:secretsmanager:<region>:<account-id>:secret:bloxtr8/database-url"
        },
        {
          "name": "KAFKA_BROKERS",
          "valueFrom": "arn:aws:secretsmanager:<region>:<account-id>:secret:bloxtr8/kafka-brokers"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/bloxtr8-api-gateway",
          "awslogs-region": "<region>",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

#### 3. Create ECS Service

```bash
aws ecs create-service \
  --cluster bloxtr8-cluster \
  --service-name bloxtr8-api-gateway \
  --task-definition bloxtr8-api-gateway \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=api-gateway,containerPort=3000"
```

### Kubernetes Deployment

#### 1. Create Deployment Manifests

**api-gateway-deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bloxtr8-api-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bloxtr8-api-gateway
  template:
    metadata:
      labels:
        app: bloxtr8-api-gateway
    spec:
      containers:
      - name: api-gateway
        image: bloxtr8-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: bloxtr8-secrets
              key: database-url
        - name: KAFKA_BROKERS
          valueFrom:
            secretKeyRef:
              name: bloxtr8-secrets
              key: kafka-brokers
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: bloxtr8-api-gateway
spec:
  selector:
    app: bloxtr8-api-gateway
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

#### 2. Apply Manifests

```bash
kubectl apply -f api-gateway-deployment.yaml
kubectl apply -f escrow-service-deployment.yaml
kubectl apply -f outbox-publisher-deployment.yaml
```

## Post-Deployment Verification

### 1. Health Checks

```bash
# API Gateway health
curl https://api.bloxtr8.com/health

# Expected response:
# {"status":"ok","timestamp":"2025-01-02T12:00:00.000Z"}
```

### 2. Database Connectivity

```bash
# Verify database connection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM escrows;"

# Verify migrations applied
psql $DATABASE_URL -c "SELECT version FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;"
```

### 3. Kafka Connectivity

```bash
# Verify Kafka topics exist
kafka-topics.sh --list --bootstrap-server $KAFKA_BROKERS

# Verify consumer groups
kafka-consumer-groups.sh --bootstrap-server $KAFKA_BROKERS --list
```

### 4. Smoke Tests

```bash
# Test escrow creation endpoint
curl -X POST https://api.bloxtr8.com/api/escrow \
  -H "Authorization: Bearer $TEST_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offerId": "test-offer-id",
    "contractId": "test-contract-id",
    "rail": "STRIPE",
    "amount": "10000",
    "currency": "USD"
  }'

# Verify command was emitted to Kafka
kafka-console-consumer.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --topic escrow-commands \
  --from-beginning \
  --max-messages 1
```

### 5. Integration Tests

Run test suite:
```bash
pnpm test:integration
```

### 6. Monitor Logs

```bash
# Docker
docker logs -f bloxtr8-api-gateway

# Kubernetes
kubectl logs -f deployment/bloxtr8-api-gateway

# Railway
railway logs --service api-gateway

# Render
render logs bloxtr8-api-gateway
```

### 7. Verify Metrics

- Check application metrics endpoint: `GET /metrics`
- Verify Prometheus scraping (if configured)
- Check error rates in Sentry
- Monitor database connection pool usage

## Rollback Procedures

### 1. Application Rollback

#### Docker

```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Pull previous image version
docker pull bloxtr8-api:<previous-version>

# Update docker-compose to use previous version
# Edit docker-compose.prod.yml: image: bloxtr8-api:<previous-version>

# Deploy previous version
docker-compose -f docker-compose.prod.yml up -d
```

#### Railway

```bash
# List deployments
railway deployments list

# Rollback to previous deployment
railway rollback <deployment-id>
```

#### Render

Use Render dashboard to rollback to previous deployment.

#### AWS ECS

```bash
# List task definitions
aws ecs list-task-definitions --family-prefix bloxtr8-api-gateway

# Update service to previous task definition
aws ecs update-service \
  --cluster bloxtr8-cluster \
  --service bloxtr8-api-gateway \
  --task-definition bloxtr8-api-gateway:<previous-revision>
```

#### Kubernetes

```bash
# Rollback deployment
kubectl rollout undo deployment/bloxtr8-api-gateway

# Check rollout status
kubectl rollout status deployment/bloxtr8-api-gateway
```

### 2. Database Migration Rollback

```bash
# List migrations
psql $DATABASE_URL -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;"

# Rollback last migration (if using Prisma)
pnpm db:migrate:rollback

# Or manually revert migration
psql $DATABASE_URL -f migrations/rollback/YYYYMMDDHHMMSS_rollback.sql
```

**Warning**: Database rollbacks can cause data loss. Always backup database before rollback.

### 3. Kafka Offset Reset

If messages need to be reprocessed:

```bash
# Reset consumer group offsets
kafka-consumer-groups.sh \
  --bootstrap-server $KAFKA_BROKERS \
  --group escrow-service-group \
  --topic escrow-commands \
  --reset-offsets \
  --to-datetime 2025-01-02T10:00:00.000Z \
  --execute
```

**Warning**: Offset reset causes message reprocessing. Ensure idempotency is working correctly.

### 4. Outbox Replay

If outbox events need to be replayed:

```sql
-- Reset publishedAt for failed events
UPDATE outbox
SET publishedAt = NULL
WHERE publishedAt IS NOT NULL
  AND aggregateId IN (
    SELECT DISTINCT aggregateId
    FROM escrow_events
    WHERE eventType = 'FAILED_EVENT'
  );
```

Then restart outbox publisher to replay events.

### 5. State Machine Recovery

If escrows are stuck in invalid states:

```sql
-- Find escrows with invalid state transitions
SELECT id, status, version, updatedAt
FROM escrows
WHERE status NOT IN ('RELEASED', 'REFUNDED', 'CANCELLED')
  AND (
    (status = 'AWAIT_FUNDS' AND expiresAt < NOW())
    OR (status = 'DELIVERED' AND autoRefundAt < NOW())
  );

-- Manually fix state (with caution)
-- UPDATE escrows SET status = 'CANCELLED' WHERE id = 'escrow-id' AND status = 'AWAIT_FUNDS';
```

**Warning**: Manual state changes bypass business logic. Use with extreme caution and document reasons.

## Additional Resources

- [Escrow Service Design Document](../design/escrow/escrow-service-design.md)
- [API Gateway Design Document](../design/escrow/api-gateway-design.md)
- [General Deployment Guide](../operations/deployment.md)
- [Database Schema Documentation](../architecture/database-schema.md)

