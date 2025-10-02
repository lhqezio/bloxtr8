# System Architecture

## Overview

Bloxtr8 is a Discord-native escrow and verification platform built on a modern microservices-inspired monorepo architecture. The system handles **$300M+** in annual Roblox game trades with enterprise-grade security and reliability.

## Architecture Principles

- **Security First**: Multi-layer security with wallet screening, input validation, and audit logging
- **Reliability**: Webhook-driven state management for consistent transaction handling
- **Scalability**: Horizontal scaling via stateless API design
- **Maintainability**: Monorepo with shared packages and TypeScript strict mode
- **User Experience**: Discord-native interactions with minimal friction

## High-Level Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Discord    │      │   Web App    │      │  Third-Party │
│   Client     │      │  (React)     │      │   APIs       │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       │ Interactions        │ HTTP                │
       ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│              Application Layer                          │
│  ┌────────────────┐       ┌────────────────┐          │
│  │  Discord Bot   │       │   API Server   │          │
│  │  (Discord.js)  │──────▶│   (Express)    │          │
│  └────────────────┘       └────────┬───────┘          │
│                                    │                   │
└────────────────────────────────────┼───────────────────┘
                                     │
┌────────────────────────────────────┼───────────────────┐
│              Business Logic Layer   │                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Auth Service │  │ Verification │  │ Escrow       │ │
│  │              │  │ Service      │  │ Service      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────┬───────────────┘
                                         │
┌────────────────────────────────────────┼───────────────┐
│              Data Layer                │               │
│  ┌─────────────────────────────────────▼─────────────┐│
│  │           PostgreSQL Database                     ││
│  │              (Prisma ORM)                         ││
│  └───────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Stripe  │          │   Base   │          │   AWS    │
│  (≤$10k) │          │  (>$10k) │          │    S3    │
└──────────┘          └──────────┘          └──────────┘
```

## Core Components

### 1. Discord Bot (`apps/discord-bot`)

**Purpose**: User interface via Discord interactions

**Technology**:

- Discord.js v14
- TypeScript
- Slash commands, Modals, Buttons

**Responsibilities**:

- Command handling (`/signup`, `/link`, `/listing create`, `/verify`)
- User interaction management
- Modal and button interactions
- Real-time user notifications
- Integration with API backend

**Deployment**: Single instance with Gateway connection

### 2. API Server (`apps/api`)

**Purpose**: Core business logic and external integrations

**Technology**:

- Express.js
- TypeScript
- Prisma ORM
- Better Auth

**Responsibilities**:

- Authentication (Discord + Roblox OAuth)
- User management
- Listing CRUD operations
- Offer management
- Asset verification
- Webhook processing (Stripe, custodian)
- Contract generation
- Escrow management
- Audit logging

**Deployment**: Horizontally scalable stateless instances

### 3. Web Application (`apps/web-app`)

**Purpose**: OAuth redirect handling and web-based features

**Technology**:

- React 19
- Vite
- TanStack Router
- Better Auth Client

**Responsibilities**:

- OAuth callback handling
- Account linking interface
- Future: marketplace browsing, dashboard

**Deployment**: Static hosting (Vercel, Cloudflare Pages)

### 4. Database (`packages/database`)

**Purpose**: Persistent data storage

**Technology**:

- PostgreSQL 14+
- Prisma ORM
- ESM module support

**Key Models**:

- `User` - User accounts with KYC tiers
- `Account` - OAuth account linking
- `Listing` - Game listings
- `Offer` - Purchase offers
- `Contract` - Legal agreements
- `Escrow` - Payment escrow
- `AssetVerification` - Roblox ownership verification
- `AuditLog` - Complete audit trail

**Deployment**: Managed PostgreSQL (AWS RDS, Supabase)

### 5. Shared Packages

#### `@bloxtr8/shared`

- Common utilities
- Constants
- Domain enums
- Validation helpers

#### `@bloxtr8/types`

- TypeScript type definitions
- Interface contracts
- Shared types across apps

#### `@bloxtr8/storage`

- AWS S3 client wrapper
- Presigned URL generation
- File upload/download utilities

## Data Flow

### 1. User Signup Flow

```
User (Discord) → /signup command
    ↓
Discord Bot → Show consent modal
    ↓
User accepts → POST /api/users/ensure
    ↓
API → Create User + Account records
    ↓
Discord Bot ← Success response
    ↓
User ← Welcome message
```

### 2. Roblox Linking Flow

```
User (Discord) → /link command
    ↓
Discord Bot → POST /api/oauth/roblox/url
    ↓
API → Generate OAuth URL + state
    ↓
User → Opens URL in browser (Web App)
    ↓
User authenticates with Roblox
    ↓
Roblox → Redirects to /api/oauth/roblox/callback
    ↓
API → Validates OAuth code
    ↓
API → Links Roblox account to User
    ↓
API → Updates KYC tier to TIER_1
    ↓
Web App ← Success page
    ↓
Discord Bot → Sends DM confirmation
```

### 3. Listing Creation Flow

```
User (Discord) → /listing create
    ↓
Discord Bot → Verify KYC tier (must be TIER_1+)
    ↓
Discord Bot → Show listing modal (title, description, price)
    ↓
User submits → POST /api/listings
    ↓
API → Validate input (Zod schema)
    ↓
API → Create Listing record
    ↓
API → Trigger game verification
    ↓
API → Create RobloxSnapshot
    ↓
Discord Bot ← Listing ID
    ↓
User ← Success embed with listing details
```

### 4. Asset Verification Flow

```
API → POST /api/asset-verification/verify
    ↓
GameVerificationService → Check cache (24h TTL)
    ↓
Cache miss → Call Roblox API
    ↓
Roblox API → Get game details
    ↓
Roblox API → Verify ownership/permissions
    ↓
GameVerificationService → Create/update AssetVerification
    ↓
GameVerificationService → Store metadata
    ↓
API ← Verification result
```

### 5. Payment Escrow Flow (Stripe)

```
Offer accepted → Create Contract
    ↓
Both parties sign → Contract EXECUTED
    ↓
API → Create Escrow (AWAIT_FUNDS)
    ↓
API → Create Stripe PaymentIntent
    ↓
User → Completes payment (Stripe UI)
    ↓
Stripe → Webhook: payment_intent.succeeded
    ↓
API → Verify webhook signature
    ↓
API → Update Escrow (FUNDS_HELD)
    ↓
Seller delivers → POST /api/escrow/:id/mark-delivered
    ↓
API → Update Escrow (DELIVERED)
    ↓
Buyer confirms → POST /api/escrow/:id/release
    ↓
API → Create Stripe Transfer to seller
    ↓
API → Update Escrow (RELEASED)
    ↓
Both parties ← Completion notification
```

## External Integrations

### 1. Discord

- **Purpose**: User authentication, bot interactions
- **Integration**: Discord.js SDK, OAuth 2.0
- **Endpoints**: Gateway WebSocket, REST API v10
- **Security**: Bot token, OAuth client credentials

### 2. Roblox

- **Purpose**: Game ownership verification
- **Integration**: Open Cloud API, OAuth 2.0
- **APIs**:
  - Game Details API
  - User Games API
  - Permissions API
- **Security**: OAuth credentials, API rate limiting

### 3. Stripe

- **Purpose**: Payment processing (≤$10k)
- **Integration**: Stripe SDK, Webhooks
- **Features**:
  - PaymentIntent API
  - Transfers API
  - Webhook events
- **Security**: API keys, webhook signature verification

### 4. Base Network (USDC)

- **Purpose**: Crypto payments (>$10k)
- **Integration**: Custodian API
- **Features**:
  - Deposit address generation
  - Transaction monitoring
  - Fund transfers
- **Security**: Wallet screening, API keys

### 5. TRM Labs + Chainalysis

- **Purpose**: Wallet risk screening
- **Integration**: REST APIs
- **Features**:
  - Risk scoring
  - Sanctions screening
  - AML compliance
- **Security**: API keys, encrypted responses

### 6. AWS S3

- **Purpose**: Contract PDF storage
- **Integration**: AWS SDK
- **Features**:
  - Presigned URLs
  - Secure upload/download
- **Security**: IAM credentials, bucket policies

## Security Architecture

### Authentication

```
┌──────────────────────────────────────────────┐
│         Better Auth                          │
│  ┌────────────────────────────────────────┐ │
│  │  OAuth Providers                       │ │
│  │  - Discord (with account linking)      │ │
│  │  - Roblox (with account linking)       │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  Session Management                    │ │
│  │  - JWT tokens                          │ │
│  │  - HTTP-only cookies                   │ │
│  │  - Session rotation                    │ │
│  └────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Authorization

- **KYC Tiers**:
  - TIER_0: Browse only
  - TIER_1: Create listings, make offers
  - TIER_2: Verified seller status

- **Endpoint Protection**:
  - JWT validation middleware
  - Role-based access control
  - Resource ownership verification

### Data Protection

- **In Transit**: TLS 1.3
- **At Rest**: Database encryption
- **Environment**: dotenvx encryption
- **Secrets**: Never committed to Git

## Scalability

### Horizontal Scaling

- **API Server**: Stateless, can scale horizontally
- **Database**: Read replicas for queries
- **Bot**: Single instance (Discord limitation)
- **Web App**: Static CDN deployment

### Performance Optimizations

- **Database**:
  - Indexed foreign keys
  - Composite indexes for common queries
  - Connection pooling

- **Caching**:
  - Asset verification cache (24h)
  - API rate limit caching
  - OAuth state caching (5min)

- **Async Processing**:
  - Webhook processing
  - Email notifications
  - Report generation

## Monitoring & Observability

### Logging

- **Structured Logging**: JSON format
- **Levels**: error, warn, info, debug
- **Correlation IDs**: Track request flows
- **Audit Trail**: Complete transaction history

### Metrics

- **System Metrics**: CPU, memory, disk
- **Application Metrics**:
  - Request rate
  - Response time
  - Error rate
- **Business Metrics**:
  - Listings created
  - Offers accepted
  - Escrows completed

### Error Tracking

- **API Errors**: Logged with stack traces
- **Bot Errors**: Interaction failures logged
- **Database Errors**: Query errors logged
- **External API Errors**: Integration failures logged

## Disaster Recovery

### Backups

- **Database**: Daily automated backups, 30-day retention
- **S3**: Versioning enabled
- **Environment**: Encrypted backup of .env files

### Recovery Procedures

1. Database restore from backup
2. Replay webhooks if needed
3. Verify data integrity
4. Resume operations

---

**See Also**:

- [Database Schema](database-schema.md)
- [Business Flow](business-flow.md)
- [API Reference](../api/README.md)
