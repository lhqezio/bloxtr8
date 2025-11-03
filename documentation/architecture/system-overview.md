# System Architecture

## Overview

Bloxtr8 is a Discord-native escrow and verification platform built on a modern microservices-inspired monorepo architecture. The system handles **$300M+** in annual Roblox game trades with enterprise-grade security and reliability.

## Architecture Principles

- **Security First**: Multi-layer security with wallet screening, input validation, and audit logging
- **Event-Driven**: Kafka-based event-driven architecture for loose coupling and scalability
- **Reliability**: Transactional outbox pattern ensures consistency between database and event publishing
- **Scalability**: Horizontal scaling via stateless services and Kafka consumer groups
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
│  │  Discord Bot   │       │   API Gateway │          │
│  │  (Discord.js)  │──────▶│   (Express)    │          │
│  └────────────────┘       └────────┬───────┘          │
│                                    │                   │
└────────────────────────────────────┼───────────────────┘
                                     │ REST + JSON
                                     ▼
┌─────────────────────────────────────────────────────────┐
│              Event Bus (Apache Kafka)                  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  Commands & Events (Protobuf)                    │ │
│  │  escrow.commands.v1 │ escrow.events.v1          │ │
│  │  payments.commands.v1 │ payments.events.v1      │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│              Business Logic Layer (Event-Driven)         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Escrow       │  │ Payments     │  │ Notifications│ │
│  │ Service      │  │ Service      │  │ Service      │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────────────────────────┬───────────────┘
                                         │
┌────────────────────────────────────────┼───────────────┐
│              Data Layer                │               │
│  ┌─────────────────────────────────────▼─────────────┐│
│  │           PostgreSQL Database                     ││
│  │              (Prisma ORM)                         ││
│  │  Escrow State │ Payment Artifacts │ Outbox       ││
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

### 2. API Gateway (`apps/api`)

**Purpose**: Request validation, authentication, and command emission

**Technology**:

- Express.js
- TypeScript
- Prisma ORM
- Better Auth
- Kafka Producer

**Responsibilities**:

- Authentication (Discord + Roblox OAuth)
- User management
- Listing CRUD operations
- Offer management
- Asset verification
- Webhook ingestion (validates and emits events)
- Contract generation
- Emit escrow commands to Kafka
- Query read models for GET requests
- Return 202 Accepted for async operations

**Communication**:

- **Inbound**: REST + JSON (Discord Bot, Web App)
- **Outbound**: Kafka commands (Protobuf)

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
API → Generate OAuth URL + state (10min expiry)
    ↓
User → Opens URL in browser (Web App)
    ↓
User authenticates with Roblox
    ↓
Roblox → Redirects to /api/oauth/roblox/callback
    ↓
API → Validates OAuth code + state
    ↓
API → Links Roblox account to User
    ↓
API → Updates KYC tier to TIER_1
    ↓
API → Clean up OAuth state token
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
Discord Bot → Fetch user's Roblox experiences
    ↓
Discord Bot → Show experience selection dropdown
    ↓
User selects experience → Verify ownership automatically
    ↓
Discord Bot → Show listing modal (title, description, price)
    ↓
User submits → POST /api/listings
    ↓
API → Validate input (Zod schema)
    ↓
API → Create Listing record
    ↓
API → Use cached verification result
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
Roblox API → Get user experiences (if available)
    ↓
Roblox API → Get game details
    ↓
Roblox API → Verify ownership/permissions
    ↓
Roblox API → Resolve creator names (if needed)
    ↓
GameVerificationService → Create/update AssetVerification
    ↓
GameVerificationService → Store metadata + game details
    ↓
API ← Verification result with game details
```

### 5. Contract Generation & Signing Flow

```
Offer ACCEPTED
    ↓
POST /api/contracts/generate
    ↓
API → Fetch offer + listing + parties + Roblox snapshots
    ↓
API → Generate PDF contract with all details
    ↓
API → Upload PDF to S3
    ↓
API → Calculate SHA-256 hash for integrity verification
    ↓
API → Create Contract (status: PENDING_SIGNATURE)
    ↓
API → Store robloxAssetData JSON snapshot
    ↓
Discord Bot → Send contract notifications to both parties
    ↓
Users receive DMs with buttons:
  - ✍️ Quick Sign (Discord native)
  - 🌐 Web Sign (magic link)
  - 📄 Review Contract (download PDF)
```

**Quick Sign Flow (Discord Native)**:

```
User → Clicks "Quick Sign" button
    ↓
Bot → Show confirmation modal
    ↓
User → Types "I AGREE" to confirm
    ↓
POST /api/contracts/:id/sign
  { userId, signatureMethod: "DISCORD_NATIVE", ipAddress, userAgent }
    ↓
API → Create Signature record with metadata
    ↓
API → Check if both parties signed
    ↓
If both signed → Update Contract.status = EXECUTED
    ↓
Notify both parties → Proceed to escrow
```

**Web Sign Flow**:

```
User → Clicks "Web Sign" button
    ↓
POST /api/contracts/:id/sign-token
    ↓
API → Generate secure token (32 bytes, 15min expiry)
    ↓
API → Create magic link: /contract/:id/sign?token=...
    ↓
User → Opens link in browser
    ↓
Web App → Validates token (checks expiry, single-use)
    ↓
Web App → Displays contract preview
    ↓
User → Confirms signature
    ↓
POST /api/contracts/:id/sign
  { userId, signatureMethod: "WEB_BASED", ipAddress, userAgent }
    ↓
API → Create Signature record
    ↓
API → Clean up used token
    ↓
If both signed → Contract EXECUTED
    ↓
Web App → Show success page
    ↓
Discord Bot → Send confirmation DM
```

**Signature Metadata Captured**:

- User ID and contract ID
- Timestamp (signedAt)
- IP address and user agent (audit trail)
- Signature method (DISCORD_NATIVE or WEB_BASED)
- Immutable once recorded

**Contract States**:

- `PENDING_SIGNATURE`: Awaiting one or both signatures
- `EXECUTED`: Both parties signed, proceeds to escrow
- `VOID`: Contract cancelled or expired

### 6. Payment Escrow Flow (Event-Driven)

The escrow system uses an event-driven architecture with Apache Kafka. See [Escrow System Architecture](escrow/escrow-system-architecture.md) for complete details.

**High-Level Flow**:

```
Contract EXECUTED
    ↓
API Gateway → Kafka: CreateEscrow command
    ↓
Escrow Service → Kafka: EscrowCreated + EscrowAwaitFunds events
    ↓
Escrow Service → Kafka: CreatePaymentIntent command
    ↓
Payments Service → Stripe: Create PaymentIntent
    ↓
User → Completes payment (Stripe UI)
    ↓
Stripe → Webhook: payment_intent.succeeded
    ↓
Payments Service → Verify webhook signature
    ↓
Payments Service → Kafka: PaymentSucceeded event
    ↓
Escrow Service → Kafka: EscrowFundsHeld event
    ↓
Seller → POST /api/escrow/:id/mark-delivered
    ↓
API Gateway → Kafka: MarkDelivered command
    ↓
Escrow Service → Kafka: EscrowDelivered event
    ↓
Buyer → POST /api/escrow/:id/release
    ↓
API Gateway → Kafka: ReleaseFunds command
    ↓
Escrow Service → Kafka: TransferToSeller command
    ↓
Payments Service → Stripe: Create Transfer
    ↓
Payments Service → Kafka: TransferSucceeded event
    ↓
Escrow Service → Kafka: EscrowReleased event
    ↓
Notifications Service → Discord DMs to both parties
```

**Key Points**:

- All state changes flow through Kafka events
- Services communicate asynchronously via events
- Idempotency ensured via event_id deduplication
- See [Sequence Flows](escrow/sequence-flows.md) for detailed diagrams

## External Integrations

### 1. Discord

- **Purpose**: User authentication, bot interactions
- **Integration**: Discord.js SDK, OAuth 2.0
- **Endpoints**: Gateway WebSocket, REST API v10
- **Security**: Bot token, OAuth client credentials

### 2. Roblox

- **Purpose**: Game ownership verification and experience management
- **Integration**: Open Cloud API, OAuth 2.0
- **APIs**:
  - Game Details API
  - User Experiences API (public games)
  - User Games API
  - Permissions API
  - Users API (creator name resolution)
- **Security**: OAuth credentials, API rate limiting
- **Features**:
  - Automatic experience fetching for listing creation
  - Creator name resolution for cached games
  - Enhanced ownership verification with game details

### 3. Apache Kafka

- **Purpose**: Event bus for event-driven communication
- **Integration**: KafkaJS (Node.js), Confluent Schema Registry
- **Features**:
  - Command/Event topics for escrow and payments
  - Protobuf schema serialization
  - Partitioning by escrow_id for ordering guarantees
  - Dead letter queues (DLQ) for poison messages
- **Security**: SASL/SCRAM authentication, TLS encryption
- **Topics**: See [Topic Catalog](escrow/topic-catalog.md) for complete inventory

### 4. Stripe

- **Purpose**: Payment processing (≤$10k)
- **Integration**: Stripe SDK, Webhooks
- **Features**:
  - PaymentIntent API
  - Transfers API
  - Webhook events (validated and emitted as Kafka events)
- **Security**: API keys, webhook signature verification

### 5. Base Network (USDC)

- **Purpose**: Crypto payments (>$10k)
- **Integration**: Custodian API
- **Features**:
  - Deposit address generation
  - Transaction monitoring
  - Fund transfers
- **Security**: Wallet screening, API keys

### 6. TRM Labs + Chainalysis

- **Purpose**: Wallet risk screening
- **Integration**: REST APIs
- **Features**:
  - Risk scoring
  - Sanctions screening
  - AML compliance
- **Security**: API keys, encrypted responses

### 7. AWS S3

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

### OAuth Security

- **State Parameter Management**:
  - Cryptographically secure random state tokens (32 bytes)
  - Server-side storage with 10-minute expiration
  - Automatic cleanup after successful/unsuccessful flows
  - Race condition protection with atomic token validation using updateMany
  - CSRF protection via state validation
  - Atomic operations prevent concurrent access and TOCTOU vulnerabilities

- **Token Lifecycle**:
  - Generation: Random bytes + database storage
  - Validation: Purpose, expiration, and usage checks
  - Cleanup: Automatic deletion after use or error
  - Memory leak prevention: Comprehensive cleanup in all scenarios

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
  - Atomic operations to prevent race conditions
  - Eliminated unnecessary re-queries in user creation flow

- **Caching**:
  - Asset verification cache (24h)
  - API rate limit caching
  - OAuth state caching (10min with automatic cleanup)

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

## Escrow Architecture

The escrow system implements an event-driven architecture with Apache Kafka. For detailed documentation, see:

- [Escrow System Architecture](escrow/escrow-system-architecture.md) - Complete event-driven architecture
- [Topic Catalog](escrow/topic-catalog.md) - Kafka topic inventory
- [Event Schemas](escrow/event-schemas.md) - Protobuf schema definitions
- [State Machine](escrow/state-machine.md) - Escrow state transitions
- [Sequence Flows](escrow/sequence-flows.md) - Detailed flow diagrams
- [Error Handling](escrow/error-handling-retries.md) - Retry and DLQ strategies
- [Observability](escrow/observability.md) - Tracing, metrics, logging
- [Security & Compliance](escrow/security-compliance.md) - Security requirements

---

**See Also**:

- [Database Schema](database-schema.md)
- [Business Flow](business-flow.md)
- [Payment System](payment-system.md)
- [API Reference](../api/README.md)
