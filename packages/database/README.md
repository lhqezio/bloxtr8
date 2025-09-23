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

## Documentation

- **[Database Schema](./docs/schema.md)** - Complete ERD and visual schema diagrams
- **[Database Operations](./docs/operations.md)** - Prisma usage, queries, and best practices

## Database Schema Overview

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

## Testing

```bash
# Run database tests
pnpm test

# Run tests with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- user.test.ts
```

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