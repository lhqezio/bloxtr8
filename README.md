# Bloxtr8

[![CI](https://github.com/your-username/bloxtr8/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/bloxtr8/actions/workflows/ci.yml)

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

| Command                 | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `pnpm env:decrypt:dev`  | Decrypt dev env → `.env.development.local`            |
| `pnpm env:encrypt:dev`  | Encrypt `.env.development.local` → `.env.development` |
| `pnpm env:decrypt:prod` | Decrypt prod env → `.env.production.local`            |
| `pnpm env:encrypt:prod` | Encrypt `.env.production.local` → `.env.production`   |
| `pnpm env:ls`           | List all environment files                            |
| `pnpm env:rotate`       | Rotate encryption keys                                |

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

# Object Storage (MinIO for dev, S3 for prod)
STORAGE_ENDPOINT="http://localhost:9000"  # MinIO endpoint for dev
STORAGE_ACCESS_KEY="minioadmin"           # MinIO access key for dev
STORAGE_SECRET_KEY="minioadmin123"        # MinIO secret key for dev
STORAGE_BUCKET="contracts"                # Bucket name for contract PDFs
STORAGE_REGION="us-east-1"                # Storage region

# AWS S3 (for production)
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_S3_BUCKET="your_s3_bucket"

# Risk screening
TRM_API_KEY="your_trm_api_key"
CHAINALYSIS_API_KEY="your_chainalysis_api_key"
```

## Docker Development

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- [Node.js](https://nodejs.org/) (v20+) if you want to run scripts outside containers
- [pnpm](https://pnpm.io/) (`corepack enable` recommended)

### Performance Optimizations

This project includes several Docker performance optimizations:

- **Shared Base Image**: Single base image with all dependencies installed once
- **Layer Caching**: Optimized Dockerfile structure for faster builds
- **Selective Volume Mounting**: Only mount source code, not `node_modules`
- **Build Context Optimization**: `.dockerignore` excludes unnecessary files
- **Multi-stage Builds**: Smaller production images

### Quick Start

#### 1. Clone and Install

```bash
git clone <repo-url>
cd bloxtr8
```

#### 2. Build Base Image (First Time Only)

```bash
pnpm docker:build-base
```

#### 3. Start Development Environment

```bash
pnpm docker:dev
```

This will start:

- **test-db** → PostgreSQL 16 with persistent storage
- **api** → Express API running in watch mode with hot reloading
- **discord-bot** → Discord.js bot running in watch mode
- **minio** → S3-compatible storage for development

### Available Docker Commands

#### Build Commands

```bash
pnpm docker:build-base    # Build the shared base image (run first)
pnpm docker:build         # Build all services with optimizations
pnpm docker:rebuild       # Force rebuild all images (no cache)
```

#### Development Commands

```bash
pnpm docker:dev           # Start optimized development environment
pnpm docker:up            # Start all services in background
pnpm docker:down          # Stop all services
```

#### Production Commands

```bash
pnpm docker:prod          # Start production environment
```

#### Monitoring & Maintenance

```bash
pnpm docker:logs          # Show logs for all services
pnpm docker:stats         # Show resource usage statistics
pnpm docker:clean         # Clean up Docker resources
pnpm docker:prune         # Remove unused Docker resources
```

### Development Workflow

#### First Time Setup

```bash
# Build the shared base image (includes all dependencies)
pnpm docker:build-base

# Start development environment
pnpm docker:dev
```

#### Daily Development

```bash
# Start development with hot reloading
pnpm docker:dev

# Check logs if needed
pnpm docker:logs

# Monitor resource usage
pnpm docker:stats
```

#### Cleanup

```bash
# Stop services
pnpm docker:down

# Clean up resources
pnpm docker:clean
```

### Service Details

#### Development Services

- **API Server**: `http://localhost:3000`
  - Hot reloading enabled
  - Source code mounted for live updates
  - Environment: `development`

- **PostgreSQL**: `localhost:5432`
  - Database: `bloxtr8-db`
  - User: `postgres`
  - Password: `postgres`
  - Persistent volume: `bloxtr8_pgdata`

- **MinIO Storage**: `http://localhost:9001`
  - Username: `minioadmin`
  - Password: `minioadmin123`
  - Console: `http://localhost:9001`

- **Discord Bot**: Runs in background
  - Hot reloading enabled
  - Source code mounted for live updates

#### Database Access

```bash
# Connect to database from host
psql postgresql://postgres:postgres@localhost:5432/bloxtr8-db

# Or exec into container
docker exec -it bloxtr8 psql -U postgres -d bloxtr8-db
```

#### Volume Management

```bash
# List volumes
docker volume ls

# Inspect database volume
docker volume inspect bloxtr8_pgdata

# View volume data on host
ls /var/lib/docker/volumes/bloxtr8_pgdata/_data
```

### Production Deployment

#### Start Production Environment

```bash
pnpm docker:prod
```

**Note**: Production mode requires a valid `DATABASE_URL` environment variable pointing to an external database. No local database volume is mounted in production.

### Performance Tips

1. **Use BuildKit**: Enable for better performance

   ```bash
   export DOCKER_BUILDKIT=1
   ```

2. **Regular Cleanup**: Free up disk space

   ```bash
   pnpm docker:clean
   pnpm docker:prune
   ```

3. **Monitor Resources**: Check resource usage

   ```bash
   pnpm docker:stats
   ```

4. **Layer Caching**: The optimized Dockerfiles use layer caching for faster rebuilds

### Troubleshooting

#### Container Not Starting

```bash
# Check logs
pnpm docker:logs

# Check container status
docker ps -a

# Restart services
pnpm docker:down
pnpm docker:dev
```

#### Build Issues

```bash
# Force rebuild without cache
pnpm docker:rebuild

# Clean up and rebuild
pnpm docker:clean
pnpm docker:build-base
pnpm docker:dev
```

#### Database Connection Issues

```bash
# Check if database is running
docker ps | grep postgres

# Check database logs
docker logs bloxtr8

# Test connection
psql postgresql://postgres:postgres@localhost:5432/bloxtr8-db
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
import { User } from '../../../packages/types/src/user';

// Use clean aliases
import { User } from '@bloxtr8/types';
import { DatabaseClient } from '@bloxtr8/database';
import { validateInput } from '@bloxtr8/shared';
```

### ESM Modules

All packages are configured as ESM modules with:

- `"type": "module"` in package.json files
- `.js` extensions in import statements (TypeScript handles the resolution)
- NodeNext module resolution for optimal compatibility

## PDF Storage System

Bloxtr8 uses a secure object storage system for contract PDFs with presigned URLs for both upload and download operations.

### How It Works

1. **Storage Backend**:
   - **Development**: MinIO (S3-compatible local storage)
   - **Production**: AWS S3

2. **Upload Flow**:

   ```
   Client → POST /contracts/:id/upload → API returns presigned PUT URL
   Client → PUT to presigned URL → PDF stored in bucket
   ```

3. **Download Flow**:
   ```
   Client → GET /contracts/:id/pdf → API returns presigned GET URL
   Client → GET from presigned URL → PDF downloaded
   ```

### API Endpoints

- **`POST /contracts/:id/upload`** - Get presigned URL for PDF upload
  - Returns: `{ uploadUrl, key, expiresIn }`
  - Expiration: 15 minutes

- **`GET /contracts/:id/pdf`** - Get presigned URL for PDF download
  - Returns: `{ downloadUrl, key, expiresIn }`
  - Expiration: 1 hour

### Security Features

- **Presigned URLs**: No direct bucket access required
- **Time-limited**: URLs expire automatically
- **S3-compatible**: Works with MinIO and AWS S3
- **Path-based keys**: Files stored as `contracts/{contractId}.pdf`

### Environment Configuration

```env
# Development (MinIO)
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_ACCESS_KEY="minioadmin"
STORAGE_SECRET_KEY="minioadmin123"
STORAGE_BUCKET="contracts"

# Production (AWS S3)
STORAGE_ENDPOINT="https://s3.amazonaws.com"
STORAGE_ACCESS_KEY="${AWS_ACCESS_KEY_ID}"
STORAGE_SECRET_KEY="${AWS_SECRET_ACCESS_KEY}"
STORAGE_BUCKET="${AWS_S3_BUCKET}"
```

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment. The CI pipeline automatically runs on every pull request and push to the main branch.

### CI Pipeline Features

- **Multi-Node Testing**: Tests on Node.js 18, 20, and 22
- **Intelligent Caching**: pnpm, Prisma, and Turbo caches for fast builds
- **Comprehensive Testing**: Unit tests, integration tests, and database tests
- **Code Quality**: ESLint linting and Prettier formatting checks
- **Artifact Management**: Build artifacts and test reports uploaded on failure
- **Database Testing**: Separate PostgreSQL service for database integration tests

### Pipeline Steps

1. **Setup**: Node.js, pnpm, and environment configuration
2. **Install**: Dependencies with intelligent caching
3. **Generate**: Prisma client for database operations
4. **Build**: All packages using Turbo build system
5. **Lint**: ESLint checks across all packages
6. **Format**: Prettier formatting validation
7. **Test**: Jest test suites across all packages
8. **Database Tests**: Integration tests with PostgreSQL service

### Artifacts on Failure

When the CI pipeline fails, the following artifacts are automatically uploaded:

- **Build Artifacts**: Compiled `dist/` folders from all packages
- **Test Results**: Jest coverage reports and test outputs
- **Logs**: Detailed execution logs and Turbo cache information

### Branch Protection

The main branch is protected with the following requirements:

- ✅ CI pipeline must pass before merging
- ✅ All checks must be green
- ✅ No direct pushes to main (PR required)

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
