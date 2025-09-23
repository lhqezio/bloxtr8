# Bloxtr8 Database Package

Prisma ORM package with PostgreSQL database schema, migrations, and client for the Bloxtr8 escrow platform.

## Features

- **Prisma ORM**: Type-safe database operations
- **PostgreSQL**: Robust relational database
- **Schema Management**: Comprehensive data model for escrow platform
- **Migrations**: Version-controlled database changes
- **Client Generation**: Type-safe database client

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Open Prisma Studio
pnpm db:studio
```

## Database Schema

The schema supports a complete Discord-native escrow and verification system for Roblox game trading.

### Core Models

- **User**: Discord identity, KYC tiers, wallet screening
- **Guild**: Discord server integration
- **Listing**: Roblox asset listings with pricing and metadata
- **Offer**: Structured offers with negotiation flow
- **Contract**: Digital contracts with PDF storage and signatures
- **Escrow**: Multi-rail escrow system (Stripe/USDC-Base)
- **Delivery**: Item/service delivery tracking
- **Dispute**: Transaction dispute resolution

### Supporting Models

- **RobloxSnapshot**: Asset verification snapshots
- **AuditLog**: Comprehensive audit trail
- **WebhookEvent**: External service event tracking
- **MilestoneEscrow**: Multi-step delivery support

## Key Features

### 🔐 Security & Compliance
- KYC tiers and verification
- Wallet risk assessment
- Comprehensive audit logging
- Immutable transaction records

### 💰 Multi-Rail Payments
- Stripe for traditional payments (≤$10k)
- USDC on Base blockchain (>$10k)
- Milestone-based releases
- Automatic refund capabilities

### 🏛️ Guild System
- Discord server integration
- Role-based permissions
- Community trading
- Guild-specific listings

### 📦 Delivery Tracking
- Status-based workflow
- Confirmation system
- Dispute integration
- Audit trail

## Database Operations

### Prisma Client Usage

```typescript
import { PrismaClient } from '@bloxtr8/database';

const prisma = new PrismaClient();

// Create a new user
const user = await prisma.user.create({
  data: {
    discordId: '123456789',
    username: 'example_user',
    email: 'user@example.com',
    kycTier: 'TIER_1',
    kycVerified: false,
  },
});

// Create a listing
const listing = await prisma.listing.create({
  data: {
    title: 'Roblox Group for Sale',
    summary: 'High-quality Roblox group with 10k+ members',
    price: 50000, // $500.00 in cents
    category: 'GROUPS',
    status: 'ACTIVE',
    userId: user.id,
  },
});

// Create an offer
const offer = await prisma.offer.create({
  data: {
    amount: 45000, // $450.00 in cents
    currency: 'USD',
    conditions: 'Payment within 24 hours',
    expiry: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
    status: 'PENDING',
    listingId: listing.id,
    buyerId: user.id,
    sellerId: listing.userId,
  },
});
```

### Common Queries

```typescript
// Get user with listings
const userWithListings = await prisma.user.findUnique({
  where: { discordId: '123456789' },
  include: {
    listings: true,
    offers: true,
  },
});

// Get active listings
const activeListings = await prisma.listing.findMany({
  where: { status: 'ACTIVE' },
  include: {
    user: true,
    offers: true,
  },
});

// Get escrow with related data
const escrow = await prisma.escrow.findUnique({
  where: { id: 'escrow-id' },
  include: {
    offer: {
      include: {
        listing: true,
        buyer: true,
        seller: true,
      },
    },
    contract: true,
    deliveries: true,
    disputes: true,
  },
});
```

## Environment Variables

```env
# Database Connection
DATABASE_URL="postgresql://username:password@localhost:5432/bloxtr8"

# Optional: Database connection pool settings
DATABASE_CONNECTION_LIMIT=10
DATABASE_TIMEOUT=20000
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL database

### Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database (optional)
pnpm db:seed
```

### Database Management

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create new migration
pnpm db:migrate:dev

# Reset database (development only)
pnpm db:reset

# Deploy migrations to production
pnpm db:migrate:deploy

# Open Prisma Studio
pnpm db:studio
```

## Schema Design Principles

### Data Integrity
- All foreign keys are indexed for efficient joins
- Status fields are indexed for filtering
- Unique constraints prevent data integrity issues
- Timestamps are indexed for time-based queries

### Audit Trail
- Comprehensive logging of all user actions
- Immutable audit records
- Compliance-ready transaction history
- Dispute resolution support

### Scalability
- Composite indexes support common query patterns
- Efficient relationship modeling
- Optimized for read-heavy workloads
- Support for high-volume transactions

## Testing

```bash
# Run database tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- user.test.ts
```

## Migration Strategy

### Development Workflow

1. **Schema Changes**: Modify `prisma/schema.prisma`
2. **Generate Migration**: `pnpm db:migrate:dev`
3. **Review Migration**: Check generated SQL
4. **Test Migration**: Run on development database
5. **Deploy**: Apply to production with `pnpm db:migrate:deploy`

### Production Deployments

- Always backup database before migrations
- Test migrations on staging environment
- Use `pnpm db:migrate:deploy` for production
- Monitor migration performance
- Have rollback plan ready

## Performance Considerations

### Indexing Strategy

- Primary keys: Automatic indexing
- Foreign keys: Indexed for joins
- Status fields: Indexed for filtering
- Timestamps: Indexed for time queries
- Composite indexes: For complex queries

### Query Optimization

- Use `include` and `select` to limit data
- Leverage Prisma's query optimization
- Monitor slow queries
- Use database connection pooling

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make schema changes
4. Generate and test migrations
5. Add tests for new functionality
6. Run `pnpm lint` and `pnpm test`
7. Submit a pull request

## License

ISC License - see LICENSE file for details
