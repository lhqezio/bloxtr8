# Bloxtr8

Discord-native escrow and verification system for Roblox game trading.

## Overview

Bloxtr8 is the first **Discord-native escrow and verification system** for Roblox game trading. Right now, over **$300M** in trades happen in the gray market on Discord with no safety net—causing an estimated **$12M+ in scam losses every year**. Bloxtr8 embeds directly into the places where developers already trade, adding **trust, protection, and liquidity** without forcing anyone to move platforms.

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

## Architecture

### Monorepo Structure

```
bloxtr8/
├── apps/                    # Applications
│   ├── api/                 # Express API server
│   └── discord-bot/         # Discord bot application
├── packages/                # Shared packages
│   ├── database/            # Prisma database package
│   ├── shared/              # Shared utilities and constants
│   └── types/               # Shared TypeScript types
└── package.json             # Root workspace configuration
```

### Applications

- **`@bloxtr8/api`** - Express.js API server handling REST endpoints, webhooks, and business logic
- **`@bloxtr8/discord-bot`** - Discord.js bot handling slash commands, interactions, and Discord-specific features

### Packages

- **`@bloxtr8/database`** - Prisma schema, migrations, and database client
- **`@bloxtr8/shared`** - Shared utilities, constants, and helper functions
- **`@bloxtr8/types`** - Shared TypeScript type definitions and interfaces

## Technology Stack

- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Discord**: Discord.js v14
- **Payments**: Stripe (≤$10k) + USDC on Base (>$10k)
- **Contracts**: DocuSign Embedded Signing
- **Storage**: AWS S3 for contract PDFs
- **Risk**: TRM Labs + Chainalysis wallet screening

## Business Flow

1. **Identity** → Discord OAuth2 + optional KYC
2. **Offer** → Structured offer via slash command
3. **Contract** → Auto-generated PDF contract via DocuSign
4. **Escrow** → Funds locked via Stripe (≤$10k) or USDC on Base (>$10k)
5. **Delivery** → Seller transfers Roblox assets
6. **Release/Dispute** → Buyer confirms or opens dispute
7. **Close** → Audit log + optional ratings

## Environment Setup

This project uses **dotenvx** with **in-repo encrypted environments** for secure environment variable management.

### Quick Start

1. **Environment files are already encrypted** and committed to the repository
2. **Copy the private keys** from `.env.keys` to your local environment or CI secrets
3. **All commands automatically decrypt** environment variables on-the-fly

### Environment Management Commands

- `pnpm env:encrypt:dev` - Encrypt development environment from `.env.development.local`
- `pnpm env:decrypt:dev` - Decrypt development environment to `.env.development.local`
- `pnpm env:encrypt:prod` - Encrypt production environment from `.env.production.local`
- `pnpm env:decrypt:prod` - Decrypt production environment to `.env.production.local`
- `pnpm env:ls` - List all `.env` files in the project
- `pnpm env:rotate` - Rotate encryption keys and re-encrypt files

### Setting Up Private Keys

**Step 1: Get the Private Key**

```bash
# View the private key (never commit this file!)
cat .env.keys
```

**Step 2: Set Up Local Development**

```bash
# Option A: Export in your shell profile (~/.zshrc, ~/.bashrc)
export DOTENV_PRIVATE_KEY_DEV="your_dev_private_key_here"
export DOTENV_PRIVATE_KEY_PRODUCTION="your_prod_private_key_here"

# Option B: Copy .env.keys to your home directory
cp .env.keys ~/.env.keys
```

## Available Scripts

### Root Level

- `pnpm dev` - Start API server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests for all packages
- `pnpm lint` - Lint all packages
- `pnpm lint:fix` - Auto-fix ESLint issues
- `pnpm format` - Format code with Prettier

### Database

- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

## Docker Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

### Quick Start

```bash
# Clone and start development environment
git clone <repo-url>
cd bloxtr8
docker compose up --build
```

This will start:

- **test-db** → Postgres 16 with persistent storage
- **api** → Express API running in watch mode
- **discord-bot** → Discord.js bot running in watch mode

## Documentation

### End-to-End Flows
- **[Complete Transaction Flow](./docs/e2e-flows.md)** - Step-by-step guide through the entire escrow process

### Application Documentation
Each application and package has its own focused README and detailed docs:

- **[API Documentation](./apps/api/README.md)** - Express API server details
  - [API Architecture](./apps/api/docs/architecture.md) - Complete API design and patterns
- **[Discord Bot Documentation](./apps/discord-bot/README.md)** - Discord bot features and commands
  - [Bot Architecture](./apps/discord-bot/docs/architecture.md) - Complete bot design and interactions
- **[Database Documentation](./packages/database/README.md)** - Database schema and operations
  - [Database Schema](./packages/database/docs/schema.md) - Visual ERD and schema diagrams
  - [Database Operations](./packages/database/docs/operations.md) - Prisma usage and best practices
- **[Shared Package Documentation](./packages/shared/README.md)** - Shared utilities and constants
- **[Types Documentation](./packages/types/README.md)** - TypeScript type definitions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm lint` and `pnpm format` to ensure code quality
5. Add tests if applicable
6. Submit a pull request

## License

ISC License - see LICENSE file for details
