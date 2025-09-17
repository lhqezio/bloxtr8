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
│   ├── eslint-config/      # Shared ESLint configuration
│   ├── shared/              # Shared utilities and constants
│   ├── tsconfig/            # Shared TypeScript configuration
│   └── types/               # Shared TypeScript types
├── docs/                    # Documentation
└── package.json             # Root workspace configuration
```

### Applications (`apps/`)

- **`@bloxtr8/api`** - Express.js API server handling REST endpoints, webhooks, and business logic
- **`@bloxtr8/discord-bot`** - Discord.js bot handling slash commands, interactions, and Discord-specific features

### Packages (`packages/`)

- **`@bloxtr8/database`** - Prisma schema, migrations, and database client
- **`@bloxtr8/eslint-config`** - Shared ESLint configuration for the monorepo
- **`@bloxtr8/shared`** - Shared utilities, constants, and helper functions
- **`@bloxtr8/types`** - Shared TypeScript type definitions and interfaces
- **`@bloxtr8/tsconfig`** - Shared TypeScript configuration with monorepo path mapping

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

### Docker
To run either the server in development or production mode using Docker, run:

```bash
# For  development mode
docker compose up --build

# For production mode
docker compose -f docker-compose.yml up --build -d
```
To see if the docker images are running correctly run:

```bash
docker exec -it bloxtr8_api_1 sh

```
to get into the running container, then run:
```bash
echo $NODE_ENV
# The result will be either 'development' or 'production'

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
- **Code Quality**: ESLint + Prettier + TypeScript strict mode
- **Module System**: ESM (ECMAScript Modules) with NodeNext resolution

## TypeScript Configuration

### Centralized Configuration

The project uses a centralized TypeScript configuration (`packages/tsconfig/tsconfig.base.json`) that provides:

- **ESM Support**: All packages use `"type": "module"` for modern JavaScript modules
- **Strict Type Checking**: Enabled `strict`, `noUncheckedIndexedAccess`, and `noImplicitOverride`
- **Monorepo Path Mapping**: Automatic imports using `@bloxtr8/*` aliases
- **Modern Target**: ES2022 with NodeNext module resolution
- **Library Configuration**: Composite builds with declaration maps for monorepo packages

### Path Mapping

The TypeScript configuration includes convenient path mappings:

```typescript
// Instead of relative imports
import { User } from '../../../packages/types/src/user'

// Use clean aliases
import { User } from '@bloxtr8/types'
import { DatabaseClient } from '@bloxtr8/database'
import { validateInput } from '@bloxtr8/shared'
```

### ESM Modules

All packages are configured as ESM modules with:
- `"type": "module"` in package.json files
- `.js` extensions in import statements (TypeScript handles the resolution)
- NodeNext module resolution for optimal compatibility

## Available Scripts

### Root Level

- `pnpm dev` - Start API server in development mode
- `pnpm build` - Build all packages
- `pnpm test` - Run tests for all packages
- `pnpm lint` - Lint all packages
- `pnpm lint:fix` - Auto-fix ESLint issues
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check if code is properly formatted

### Database

- `pnpm db:generate` - Generate Prisma client
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Run database migrations
- `pnpm db:studio` - Open Prisma Studio

## Code Quality & Development Tools

### ESLint Configuration

The project uses a centralized ESLint configuration (`@bloxtr8/eslint-config`) that provides:

- **TypeScript Support**: Full TypeScript ESLint rules with strict type checking
- **Import Organization**: Automatic import sorting and grouping
- **Code Quality Rules**: Consistent code style and best practices
- **Prettier Integration**: No conflicts between ESLint and Prettier
- **Monorepo Ready**: Shared configuration across all packages

#### Available Configurations

- `@bloxtr8/eslint-config/base` - Base configuration for all packages
- `@bloxtr8/eslint-config/node` - Node.js specific rules for backend apps
- `@bloxtr8/eslint-config/react` - React specific rules (ready for frontend)

#### Key ESLint Rules

- TypeScript strict mode with `no-explicit-any` warnings
- Consistent type imports with `consistent-type-imports`
- Import ordering and organization
- No unused variables (with `_` prefix exception)
- Object shorthand and template literal preferences

### Prettier Configuration

Consistent code formatting with:

- Single quotes
- Semicolons
- 2-space indentation
- 80 character line width
- Trailing commas (ES5 style)
- LF line endings

### Development Workflow

1. **Code Quality**: Run `pnpm lint` before committing
2. **Auto-fix**: Use `pnpm lint:fix` to automatically fix issues
3. **Formatting**: Use `pnpm format` to format code with Prettier
4. **Pre-commit**: Consider adding pre-commit hooks for automatic linting

## Monorepo Architecture

### Package Dependencies

The monorepo uses a hierarchical dependency structure:

```
apps/
├── api/                     # Depends on: database, shared, types
└── discord-bot/             # Depends on: database, shared, types

packages/
├── database/                # Depends on: types
├── shared/                  # Depends on: types
├── types/                   # No internal dependencies
├── eslint-config/           # Shared dev dependency
└── tsconfig/                # Shared TypeScript config
```

### Build System

- **Turbo**: Fast, cached builds across the monorepo
- **Composite Builds**: TypeScript composite mode for incremental compilation
- **Dependency Graph**: Automatic build ordering based on package dependencies
- **Caching**: Build outputs cached for faster subsequent builds

## Development Workflow

1. **Feature Development**: Create feature branches from `main`
2. **Package Changes**: Make changes in appropriate packages
3. **Code Quality**: Run `pnpm lint` and `pnpm format` before committing
4. **Testing**: Run tests before committing
5. **Database Changes**: Update Prisma schema and run migrations
6. **Documentation**: Update relevant docs in `docs/` folder

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `pnpm lint` and `pnpm format` to ensure code quality
5. Add tests if applicable
6. Submit a pull request

## License

ISC License - see LICENSE file for details
