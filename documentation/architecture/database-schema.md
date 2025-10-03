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

Legal agreements with PDF storage.

```prisma
model Contract {
  id        String         @id @default(cuid())
  pdfUrl    String?        // S3 URL
  sha256    String?        // File hash for integrity
  status    ContractStatus @default(PENDING_SIGNATURE)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  offerId    String
  offer      Offer       @relation(fields: [offerId], references: [id])
  signatures Signature[]
  escrows    Escrow[]
  deliveries Delivery[]
}
```

**Indexes**: `offerId`, `status`

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
  PENDING_SIGNATURE
  EXECUTED
  VOID
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
Contract (PENDING_SIGNATURE → EXECUTED)
  ↓
Escrow (AWAIT_FUNDS → FUNDS_HELD → DELIVERED → RELEASED)
  ↓
Delivery (PENDING → DELIVERED → CONFIRMED)
```

## Indexes

All foreign keys are indexed by default. Additional indexes:

- `User.email` - Unique index for authentication
- `User.walletAddress` - Lookup by wallet
- `Listing.status` - Filter active listings
- `Listing.category` - Category browsing
- `Offer.status` - Filter by offer state
- `Offer.expiry` - Find expired offers
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
