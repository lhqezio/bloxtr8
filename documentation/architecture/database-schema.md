# Database Schema

PostgreSQL database schema using Prisma ORM.

## Core Models

### User

User accounts with authentication and KYC.

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified Boolean   @default(false)
  phone         String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // KYC
  kycTier       KycTier   @default(TIER_0)
  kycVerified   Boolean   @default(false)

  // Wallet
  walletAddress String?
  walletRisk    WalletRisk @default(UNKNOWN)

  // Relations
  sessions             Session[]
  accounts             Account[]
  listings             Listing[]
  buyerOffers          Offer[]   @relation("BuyerOffers")
  sellerOffers         Offer[]   @relation("SellerOffers")
  signatures           Signature[]
  auditLogs            AuditLog[]
  deliveries           Delivery[]
  disputes             Dispute[] @relation("DisputeUser")
  guildMemberships     GuildMember[]
  assetVerifications   AssetVerification[]
}
```

**Indexes**: `email`, `walletAddress`

### Account

OAuth account linking (Better Auth).

```prisma
model Account {
  id                    String    @id
  accountId             String    // Provider user ID
  providerId            String    // 'discord' | 'roblox'
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}
```

### Session

User sessions (Better Auth).

```prisma
model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Listing

Game listings for sale.

```prisma
model Listing {
  id        String        @id @default(cuid())
  title     String
  summary   String
  price     Int           // Price in cents
  category  String
  status    ListingStatus @default(ACTIVE)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  userId          String
  user            User             @relation(fields: [userId], references: [id])
  guildId         String?
  guild           Guild?           @relation(fields: [guildId], references: [id])
  offers          Offer[]
  robloxSnapshots RobloxSnapshot[]
  deliveries      Delivery[]
}
```

**Indexes**: `userId`, `guildId`, `status`, `category`

### Offer

Purchase offers with negotiation support.

```prisma
model Offer {
  id         String      @id @default(cuid())
  amount     Int         // Amount in cents
  currency   Currency    @default(USD)
  conditions String?
  expiry     DateTime
  status     OfferStatus @default(PENDING)
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  listingId String
  listing   Listing @relation(fields: [listingId], references: [id])
  buyerId   String
  buyer     User    @relation("BuyerOffers", fields: [buyerId], references: [id])
  sellerId  String
  seller    User    @relation("SellerOffers", fields: [sellerId], references: [id])

  // Counter-offers
  parentId String?
  parent   Offer?  @relation("OfferCounter", fields: [parentId], references: [id])
  counters Offer[] @relation("OfferCounter")

  contracts  Contract[]
  escrows    Escrow[]
  deliveries Delivery[]
}
```

**Indexes**: `listingId`, `buyerId`, `sellerId`, `status`, `expiry`

### Contract

Legal agreements with PDF storage and execution tracking.

```prisma
model Contract {
  id              String         @id @default(cuid())
  pdfUrl          String?        // S3 URL
  sha256          String?        // File hash for integrity
  status          ContractStatus @default(PENDING_SIGNATURE)
  robloxAssetData Json?          // Snapshot of Roblox asset details at contract time
  templateVersion String         @default("1.0.0") // Contract template version used
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  offerId       String
  offer         Offer                  @relation(fields: [offerId], references: [id])
  signatures    Signature[]
  escrows       Escrow[]
  deliveries    Delivery[]
  executionJobs ContractExecutionJob[]
}
```

**Indexes**: `offerId`, `status`

**State Flow**:

```
PENDING_SIGNATURE → EXECUTING → EXECUTED
                        ↓
                   EXECUTION_FAILED
                        ↓
                      VOID
```

**Fields**:

- `robloxAssetData`: JSON snapshot preserving asset details at time of contract generation
- `templateVersion`: Tracks which contract template version was used for legal compliance
- `executionJobs`: One-to-many relation for queue-based contract execution

### ContractExecutionJob

Queue-based contract execution with automatic retry logic.

```prisma
model ContractExecutionJob {
  id                  String    @id @default(cuid())
  contractId          String
  contract            Contract  @relation(fields: [contractId], references: [id])
  status              JobStatus @default(PENDING)
  attempts            Int       @default(0)
  maxAttempts         Int       @default(3)
  lastError           String?
  nextRetryAt         DateTime?
  processingStartedAt DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  completedAt         DateTime?

  @@unique([contractId])
  @@index([contractId])
  @@index([status, nextRetryAt])
}
```

**Indexes**: `contractId`, `status + nextRetryAt` (composite)

**Unique Constraint**: One job per contract (prevents duplicate execution)

**Purpose**:

- Prevents race conditions when both parties sign simultaneously
- Automatic retry with exponential backoff (up to 3 attempts)
- Tracks execution status and errors for debugging
- Queue-based processing ensures reliable contract execution

**State Flow**:

```
PENDING → PROCESSING → COMPLETED
             ↓
          FAILED (retries if attempts < maxAttempts)
```

### Signature

Contract signatures with enhanced audit trail.

```prisma
model Signature {
  id              String          @id @default(cuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id])
  contractId      String
  contract        Contract        @relation(fields: [contractId], references: [id])
  signedAt        DateTime        @default(now())
  ipAddress       String?         // IP address at time of signing
  userAgent       String?         // Browser/client user agent
  signatureMethod SignatureMethod @default(DISCORD_NATIVE)

  @@unique([userId, contractId])
  @@index([userId])
  @@index([contractId])
}
```

**Indexes**: `userId`, `contractId`

**Unique Constraint**: One signature per user per contract

**Audit Fields**:

- `ipAddress`: Captures IP address for legal compliance
- `userAgent`: Records client/browser information
- `signatureMethod`: Tracks how signature was captured (Discord native vs web-based)

### Escrow

Payment escrow with multi-rail support.

```prisma
model Escrow {
  id        String       @id @default(cuid())
  rail      EscrowRail   // STRIPE | USDC_BASE
  amount    Int
  currency  Currency     @default(USD)
  status    EscrowStatus @default(AWAIT_FUNDS)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  offerId    String
  offer      Offer    @relation(fields: [offerId], references: [id])
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])

  // Rail-specific data
  stripeEscrow     StripeEscrow?
  stablecoinEscrow StablecoinEscrow?
  milestoneEscrow  MilestoneEscrow[]

  auditLogs  AuditLog[]
  deliveries Delivery[]
  disputes   Dispute[]
}
```

**Indexes**: `offerId`, `contractId`, `status`, `rail`

**State Flow**:

```
AWAIT_FUNDS → FUNDS_HELD → DELIVERED → RELEASED
                ↓
            DISPUTED → REFUNDED
                ↓
            CANCELLED
```

### StripeEscrow

Stripe-specific escrow data (≤$10k).

```prisma
model StripeEscrow {
  id              String  @id @default(cuid())
  paymentIntentId String  @unique
  transferId      String?
  refundId        String?
  escrowId        String  @unique
  escrow          Escrow  @relation(fields: [escrowId], references: [id])
}
```

### StablecoinEscrow

USDC on Base escrow data (>$10k).

```prisma
model StablecoinEscrow {
  id          String  @id @default(cuid())
  chain       String  @default("BASE")
  depositAddr String  // Unique deposit address
  depositTx   String? // Transaction hash
  releaseTx   String? // Release transaction
  escrowId    String  @unique
  escrow      Escrow  @relation(fields: [escrowId], references: [id])
}
```

### AssetVerification

Roblox game ownership verification.

```prisma
model AssetVerification {
  id                 String             @id @default(cuid())
  userId             String
  gameId             String
  verificationStatus VerificationStatus @default(PENDING)
  verificationMethod VerificationMethod
  ownershipType      GameOwnershipType  @default(OWNER)
  verifiedAt         DateTime?
  expiresAt          DateTime?          // 24-hour cache
  metadata           Json?              // API response
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, gameId])
}
```

**Indexes**: `userId`, `gameId`, `verificationStatus`

**Cache**: 24 hours

### RobloxSnapshot

Game state snapshots for listings.

```prisma
model RobloxSnapshot {
  id                String            @id @default(cuid())
  gameId            String
  gameName          String
  gameDescription   String?
  thumbnailUrl      String?
  playerCount       Int?
  visits            Int?
  createdDate       DateTime?
  verifiedOwnership Boolean           @default(false)
  ownershipType     GameOwnershipType @default(OWNER)
  verificationDate  DateTime?
  metadata          Json?
  createdAt         DateTime          @default(now())

  listingId String?
  listing   Listing? @relation(fields: [listingId], references: [id])
}
```

**Indexes**: `gameId`, `listingId`, `verifiedOwnership`

### AuditLog

Complete audit trail.

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  action    String   // 'user_created', 'listing_created', etc.
  details   Json?
  createdAt DateTime @default(now())

  userId   String?
  user     User?   @relation(fields: [userId], references: [id])
  escrowId String?
  escrow   Escrow? @relation(fields: [escrowId], references: [id])
}
```

**Indexes**: `userId`, `escrowId`, `action`, `createdAt`

### ContractTemplate

Versioned contract legal terms for compliance and updates.

```prisma
model ContractTemplate {
  id           String    @id @default(cuid())
  version      String    @unique // e.g., "1.0.0", "1.1.0"
  name         String    // e.g., "Roblox Asset Sale Agreement"
  terms        Json      // Contract terms and clauses
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deprecatedAt DateTime? // When this version was deprecated
}
```

**Indexes**: `version`, `isActive`

**Unique Constraint**: `version` - Each version is unique

**Purpose**:

- Maintains multiple contract template versions for legal compliance
- Allows updating terms while preserving historical contracts
- Tracks when templates are deprecated
- JSON storage allows flexible term structures

**Versioning**:

- Semantic versioning (e.g., "1.0.0", "1.1.0", "2.0.0")
- Only one active template at a time
- Historical templates remain for reference

### ContractSignToken

One-time magic link tokens for secure web-based contract signing.

```prisma
model ContractSignToken {
  id         String    @id @default(cuid())
  token      String    @unique
  contractId String
  userId     String
  expiresAt  DateTime
  usedAt     DateTime? // Timestamp when the token was used
  createdAt  DateTime  @default(now())
}
```

**Indexes**: `token`, `contractId`, `userId`, `expiresAt`

**Unique Constraint**: `token` - Each token is globally unique

**Security Features**:

- **Single-use**: Token is marked as used (`usedAt`) after first use
- **Time-limited**: 15-minute expiry from creation
- **User-specific**: Bound to specific user and contract
- **Cryptographically secure**: Generated with 32-byte random token

**Purpose**:

- Enables secure web-based contract signing via magic links
- Prevents unauthorized access to contract signing
- Automatic cleanup of expired/used tokens

## Enums

### KycTier

```prisma
enum KycTier {
  TIER_0  // No Roblox account - browse only
  TIER_1  // Roblox linked - can create listings
  TIER_2  // Team verified - trusted seller badge
}
```

### WalletRisk

```prisma
enum WalletRisk {
  UNKNOWN
  LOW
  MEDIUM
  HIGH
  SANCTIONED
}
```

### ListingStatus

```prisma
enum ListingStatus {
  ACTIVE
  INACTIVE
  SOLD
}
```

### OfferStatus

```prisma
enum OfferStatus {
  PENDING
  ACCEPTED
  COUNTERED
  DECLINED
  EXPIRED
}
```

### ContractStatus

```prisma
enum ContractStatus {
  PENDING_SIGNATURE  // Awaiting one or both signatures
  EXECUTING          // Both signed, processing contract execution
  EXECUTED           // Successfully executed and active
  EXECUTION_FAILED   // Execution failed, may retry
  VOID               // Contract cancelled or expired
}
```

### EscrowRail

```prisma
enum EscrowRail {
  STRIPE      // ≤$10k
  USDC_BASE   // >$10k
}
```

### EscrowStatus

```prisma
enum EscrowStatus {
  AWAIT_FUNDS
  FUNDS_HELD
  DELIVERED
  RELEASED
  DISPUTED
  REFUNDED
  CANCELLED
}
```

### VerificationStatus

```prisma
enum VerificationStatus {
  PENDING
  VERIFIED
  FAILED
  EXPIRED
}
```

### GameOwnershipType

```prisma
enum GameOwnershipType {
  OWNER
  ADMIN
  DEVELOPER
}
```

### SignatureMethod

```prisma
enum SignatureMethod {
  DISCORD_NATIVE  // Quick sign via Discord button (type "I AGREE")
  WEB_BASED       // Full review and sign via web app (magic link)
  API             // Programmatic signature (future use)
}
```

**Usage**:

- `DISCORD_NATIVE`: Fast signing directly in Discord with confirmation modal
- `WEB_BASED`: Detailed review with full contract preview before signing
- `API`: Reserved for future programmatic signing capabilities

### JobStatus

```prisma
enum JobStatus {
  PENDING      // Waiting to be processed
  PROCESSING   // Currently being executed
  COMPLETED    // Successfully finished
  FAILED       // Failed after max retry attempts
}
```

**Usage**: Tracks contract execution job lifecycle in the queue system.

## Relationships

### User Relationships

- User → Listings (one-to-many)
- User → Offers as buyer (one-to-many)
- User → Offers as seller (one-to-many)
- User → Accounts (one-to-many, OAuth providers)
- User → Sessions (one-to-many)
- User → AssetVerifications (one-to-many)

### Transaction Flow

```
Listing
  ↓
Offer (PENDING → ACCEPTED)
  ↓
Contract (PENDING_SIGNATURE → EXECUTING → EXECUTED)
  ↓
ContractExecutionJob (PENDING → PROCESSING → COMPLETED)
  ↓
Escrow (AWAIT_FUNDS → FUNDS_HELD → DELIVERED → RELEASED)
  ↓
Delivery (PENDING → DELIVERED → CONFIRMED)
```

**Contract Execution**:

- Both parties sign → Contract status: EXECUTING
- Execution job created → Process in queue
- On success → Contract status: EXECUTED, proceed to escrow
- On failure → Contract status: EXECUTION_FAILED, retry up to 3 times

## Indexes

All foreign keys are indexed by default. Additional indexes:

- `User.email` - Unique index for authentication
- `User.walletAddress` - Lookup by wallet
- `Listing.status` - Filter active listings
- `Listing.category` - Category browsing
- `Offer.status` - Filter by offer state
- `Offer.expiry` - Find expired offers
- `Contract.status` - Filter by contract state
- `ContractExecutionJob.status + nextRetryAt` - Queue processing and retry scheduling
- `ContractTemplate.version` - Unique index for template versioning
- `ContractTemplate.isActive` - Find active template
- `ContractSignToken.token` - Unique index for token lookup
- `ContractSignToken.expiresAt` - Cleanup expired tokens
- `Escrow.status` - Filter by escrow state
- `AssetVerification.verificationStatus` - Find verified games
- `AuditLog.action` - Query by action type
- `AuditLog.createdAt` - Time-based queries

## Migrations

Located in `packages/database/prisma/migrations/`

**Commands**:

```bash
# Create migration
pnpm db:migrate

# Apply migrations
pnpm db:push

# Generate Prisma client
pnpm db:generate

# Open Prisma Studio
pnpm db:studio
```

## Connection

**Environment Variable**:

```env
DATABASE_URL="postgresql://user:password@host:5432/bloxtr8"
```

**Connection Pooling**: Managed by Prisma

**Client Usage**:

```typescript
import { prisma } from '@bloxtr8/database';

const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { accounts: true },
});
```
