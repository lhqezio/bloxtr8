# Bloxtr8

Discord-native escrow and verification system for Roblox game trading.

## Overview

Bloxtr8 is the first **Discord-native escrow and verification system** for Roblox game trading. Right now, over **$300M** in trades happen in the gray market on Discord with no safety net—causing an estimated **$12M+ in scam losses every year**. Bloxtr8 embeds directly into the places where developers already trade, adding **trust, protection, and liquidity** without forcing anyone to move platforms.

## Monorepo Structure

This is a pnpm workspace monorepo with the following structure:

```
bloxtr8/
├── apps/                    # Applications
│   ├── api/                 # Express API server
│   └── discord-bot/         # Discord bot application
├── packages/                # Shared packages
│   ├── database/            # Prisma database package
│   ├── shared/              # Shared utilities and constants
│   └── types/               # Shared TypeScript types
├── docs/                    # Documentation
└── package.json             # Root workspace configuration
```

### Applications (`apps/`)

- **`@bloxtr8/api`** - Express.js API server handling REST endpoints, webhooks, and business logic
- **`@bloxtr8/discord-bot`** - Discord.js bot handling slash commands, interactions, and Discord-specific features

### Packages (`packages/`)

- **`@bloxtr8/database`** - Prisma schema, migrations, and database client
- **`@bloxtr8/shared`** - Shared utilities, constants, and helper functions
- **`@bloxtr8/types`** - Shared TypeScript type definitions and interfaces

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- PostgreSQL database

### Installation

```bash
# Install dependencies for all workspaces
pnpm install

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate
```

### Development

```bash
# Start API server in development mode
pnpm dev

# Start Discord bot (in separate terminal)
pnpm --filter=@bloxtr8/discord-bot dev

# Open Prisma Studio
pnpm db:studio
```

### Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/bloxtr8"

# Discord
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
DISCORD_BOT_TOKEN="your_discord_bot_token"

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Custodian (for USDC on Base)
CUSTODIAN_API_KEY="your_custodian_api_key"
CUSTODIAN_WEBHOOK_SECRET="your_webhook_secret"

# Security
JWT_SECRET="your_jwt_secret"

# AWS S3 (for contract storage)
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_S3_BUCKET="your_s3_bucket"

# Risk screening
TRM_API_KEY="your_trm_api_key"
CHAINALYSIS_API_KEY="your_chainalysis_api_key"
```

## Architecture

### Core Flow

1. **Identity** → Discord OAuth2 + optional KYC
2. **Offer** → Structured offer via slash command
3. **Contract** → Auto-generated PDF contract via DocuSign
4. **Escrow** → Funds locked via Stripe (≤$10k) or USDC on Base (>$10k)
5. **Delivery** → Seller transfers Roblox assets
6. **Release/Dispute** → Buyer confirms or opens dispute
7. **Close** → Audit log + optional ratings

### Technology Stack

- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Discord**: Discord.js v14
- **Payments**: Stripe (≤$10k) + USDC on Base (>$10k)
- **Contracts**: DocuSign Embedded Signing
- **Storage**: AWS S3 for contract PDFs
- **Risk**: TRM Labs + Chainalysis wallet screening

## Available Scripts

### Root Level
- `pnpm dev` - Start API server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests for all packages
- `pnpm lint` - Lint all packages

### Database
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

## Development Workflow

1. **Feature Development**: Create feature branches from `main`
2. **Package Changes**: Make changes in appropriate packages
3. **Testing**: Run tests before committing
4. **Database Changes**: Update Prisma schema and run migrations
5. **Documentation**: Update relevant docs in `docs/` folder

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see LICENSE file for details
