# Database Operations

## Prisma Client Usage

### Basic Operations

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

### Complex Transactions

```typescript
// Create a complete transaction flow
const transaction = await prisma.$transaction(async (tx) => {
  // 1. Create offer
  const offer = await tx.offer.create({
    data: {
      amount: 50000,
      currency: 'USD',
      conditions: 'Standard terms',
      expiry: new Date(Date.now() + 72 * 60 * 60 * 1000),
      status: 'PENDING',
      listingId: 'listing-id',
      buyerId: 'buyer-id',
      sellerId: 'seller-id',
    },
  });

  // 2. Accept offer
  const acceptedOffer = await tx.offer.update({
    where: { id: offer.id },
    data: { status: 'ACCEPTED' },
  });

  // 3. Create contract
  const contract = await tx.contract.create({
    data: {
      pdfUrl: 'https://s3.amazonaws.com/contract.pdf',
      sha256: 'abc123...',
      status: 'PENDING_SIGNATURE',
      offerId: acceptedOffer.id,
    },
  });

  // 4. Create escrow
  const escrow = await tx.escrow.create({
    data: {
      rail: 'STRIPE',
      amount: acceptedOffer.amount,
      currency: acceptedOffer.currency,
      status: 'AWAIT_FUNDS',
      offerId: acceptedOffer.id,
      contractId: contract.id,
    },
  });

  return { offer: acceptedOffer, contract, escrow };
});
```

## Migration Management

### Creating Migrations

```bash
# Create a new migration
pnpm db:migrate:dev --name add_user_wallet_screening

# Reset database (development only)
pnpm db:reset

# Deploy migrations to production
pnpm db:migrate:deploy
```

### Migration Best Practices

1. **Always backup before migrations**
2. **Test migrations on staging first**
3. **Use descriptive migration names**
4. **Review generated SQL before applying**
5. **Have rollback plan ready**

## Performance Optimization

### Indexing Strategy

```sql
-- Example indexes for common queries
CREATE INDEX idx_user_discord_id ON "User"("discordId");
CREATE INDEX idx_listing_status ON "Listing"("status");
CREATE INDEX idx_offer_status ON "Offer"("status");
CREATE INDEX idx_escrow_status ON "Escrow"("status");
CREATE INDEX idx_audit_log_created_at ON "AuditLog"("createdAt");
```

### Query Optimization

```typescript
// Use select to limit fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    username: true,
    kycVerified: true,
  },
});

// Use pagination for large datasets
const listings = await prisma.listing.findMany({
  skip: 0,
  take: 20,
  orderBy: { createdAt: 'desc' },
});

// Use raw queries for complex operations
const result = await prisma.$queryRaw`
  SELECT u.username, COUNT(l.id) as listing_count
  FROM "User" u
  LEFT JOIN "Listing" l ON u.id = l."userId"
  GROUP BY u.id, u.username
  HAVING COUNT(l.id) > 5
`;
```

## Data Seeding

### Seed Scripts

```typescript
// packages/database/src/seed.ts
import { PrismaClient } from '@bloxtr8/database';

const prisma = new PrismaClient();

async function main() {
  // Create test users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        discordId: '123456789',
        username: 'test_user_1',
        email: 'user1@example.com',
        kycTier: 'TIER_1',
        kycVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        discordId: '987654321',
        username: 'test_user_2',
        email: 'user2@example.com',
        kycTier: 'TIER_2',
        kycVerified: true,
      },
    }),
  ]);

  // Create test listings
  const listings = await Promise.all([
    prisma.listing.create({
      data: {
        title: 'Premium Roblox Group',
        summary: 'High-quality group with 50k+ members',
        price: 100000, // $1000
        category: 'GROUPS',
        status: 'ACTIVE',
        userId: users[0].id,
      },
    }),
    prisma.listing.create({
      data: {
        title: 'Game Development Service',
        summary: 'Custom game development for Roblox',
        price: 250000, // $2500
        category: 'SERVICES',
        status: 'ACTIVE',
        userId: users[1].id,
      },
    }),
  ]);

  console.log('Seed data created:', { users, listings });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## Monitoring & Maintenance

### Health Checks

```typescript
// Database health check
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

### Connection Pooling

```typescript
// Configure connection pool
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['query', 'info', 'warn', 'error'],
});
```

## Security Considerations

### Data Protection

- **Encrypt sensitive data** (PII, financial information)
- **Use parameterized queries** (Prisma handles this)
- **Implement row-level security** where needed
- **Regular security audits** of database access

### Access Control

- **Principle of least privilege** for database users
- **Separate read/write permissions**
- **Audit all database access**
- **Use connection pooling** to limit connections
