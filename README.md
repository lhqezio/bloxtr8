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

This project uses **dotenvx** with **in-repo encrypted environments** for secure environment variable management. All environment files are encrypted and safely committed to Git, while private keys remain local.

#### Quick Start

1. **Environment files are already encrypted** and committed to the repository
2. **Copy the private keys** from `.env.keys` to your local environment or CI secrets
3. **All commands automatically decrypt** environment variables on-the-fly

#### How It Works

- **Encrypted `.env` files** are committed to Git (safe for version control)
- **Private keys** (`.env.keys`) are never committed and stay local/CI-only
- **`dotenvx run`** automatically decrypts environment variables for all commands
- **Environment-specific files** are automatically used based on the command:
  - `pnpm dev` → uses `.env.development`
  - `pnpm build` → uses `.env.production`
  - `pnpm test` → uses `.env.development`

#### Environment Management Commands

- `pnpm env:encrypt:dev` - Encrypt development environment from `.env.development.local`
- `pnpm env:decrypt:dev` - Decrypt development environment to `.env.development.local`
- `pnpm env:encrypt:prod` - Encrypt production environment from `.env.production.local`
- `pnpm env:decrypt:prod` - Decrypt production environment to `.env.production.local`
- `pnpm env:ls` - List all `.env` files in the project
- `pnpm env:rotate` - Rotate encryption keys and re-encrypt files
- `pnpm env:keypair` - Generate new encryption keypairs

#### Setting Up Private Keys

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

**Step 3: Set Up CI/CD**
```bash
# Add as environment variables in your CI system
DOTENV_PRIVATE_KEY_DEV="your_dev_private_key_here"
DOTENV_PRIVATE_KEY_PRODUCTION="your_prod_private_key_here"
```

**Step 4: Verify Setup**
```bash
# Test that environment variables are loaded
pnpm dev --dry-run
```

#### Environment Workflow Guide

This project uses **encrypted environment files** with a **local editing workflow** for security and convenience.

##### **File Structure**

**Committed Files (Safe for Git):**
- `.env.development` - Encrypted development environment
- `.env.production` - Encrypted production environment
- `.env.local.example` - Template for new developers

**Local Files (Never Committed):**
- `.env.development.local` - Editable development environment
- `.env.production.local` - Editable production environment
- `.env.keys` - Private decryption keys

##### **Development Workflow**

**1. Decrypt Environment for Editing**
```bash
# Decrypt development environment
pnpm env:decrypt:dev
# This creates .env.development.local (editable)
```

**2. Edit Environment Variables**
```bash
# Edit the local file with your changes
nano .env.development.local
# or
code .env.development.local
```

**3. Encrypt and Commit**
```bash
# Encrypt from local file
pnpm env:encrypt:dev
# This reads .env.development.local → encrypts to .env.development

# Commit the encrypted file
git add .env.development
git commit -m "Update development environment"
```

##### **Production Workflow**

**1. Decrypt Production Environment**
```bash
# Decrypt production environment
pnpm env:decrypt:prod
# This creates .env.production.local (editable)
```

**2. Edit Production Variables**
```bash
# Edit production values
nano .env.production.local
```

**3. Encrypt Production Environment**
```bash
# Encrypt production environment
pnpm env:encrypt:prod
# This reads .env.production.local → encrypts to .env.production
```

##### **Running Applications**

**Development:**
```bash
pnpm dev     # Uses .env.development (automatically decrypted)
pnpm test    # Uses .env.development (automatically decrypted)
```

**Production:**
```bash
pnpm build   # Uses .env.production (automatically decrypted)
```

##### **Security Features**

- **Encrypted at rest** - All environment files are encrypted
- **Local editing** - Work with unencrypted `.local` files
- **Git-safe** - Only encrypted files are committed
- **Environment isolation** - Dev and prod use different keys
- **Automatic decryption** - Applications decrypt on-the-fly

##### **Available Commands**

| Command | Purpose |
|---------|---------|
| `pnpm env:decrypt:dev` | Decrypt dev env → `.env.development.local` |
| `pnpm env:encrypt:dev` | Encrypt `.env.development.local` → `.env.development` |
| `pnpm env:decrypt:prod` | Decrypt prod env → `.env.production.local` |
| `pnpm env:encrypt:prod` | Encrypt `.env.production.local` → `.env.production` |
| `pnpm env:ls` | List all environment files |
| `pnpm env:rotate` | Rotate encryption keys |

##### **Shell Scripts**

The project includes helper shell scripts in the `scripts/` directory for cleaner command execution:

- `scripts/env-dev.sh` - Sets up development environment
- `scripts/env-prod.sh` - Sets up production environment  
- `scripts/env-encrypt-dev.sh` - Encrypts development environment
- `scripts/env-decrypt-dev.sh` - Decrypts development environment
- `scripts/env-encrypt-prod.sh` - Encrypts production environment
- `scripts/env-decrypt-prod.sh` - Decrypts production environment

#### Environment Variables

See `.env.local.example` for the complete list of required environment variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/bloxtr8"

# Discord
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_GUILD_ID="your_discord_guild_id"

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
docker exec -it bloxtr8-api-1 sh

```
to get into the running container, then run:
```bash
echo $NODE_ENV
# The result will be either 'development' or 'production'
```

To check if the database volume is mounted correctly run:
```bash
docker volume ls
# You should see: local     bloxtr8_pgdata
# Bonus: run docker volume inspect bloxtr8_pgdata to check the inspect the volume
# Or
ls /var/lib/docker/volumes/bloxtr8_pgdata/_data 
# To see the actual database on the host machine
```
Also for development container, you can ctrl+c to stop it while when run in production mode, the command ends immediately and the 2 containers will just be running in the back ground
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
