# Bloxtr8

Discord-native escrow and verification for Roblox game trading.

## Overview

Addresses the $300M+ Roblox trading market on Discord with enterprise-grade escrow, verification, and dispute resolution.

**Features**:

- Secure escrow (Stripe ≤$10k, USDC on Base >$10k)
- Roblox game ownership verification
- Digital contracts (DocuSign)
- Wallet screening (TRM Labs, Chainalysis)
- Discord slash commands and interactions
- 3-tier KYC system

## Quick Start

```bash
# Install
pnpm install

# Setup environment
cp .env.local.example .env.development.local
# Edit with your credentials

# Database
pnpm db:generate
pnpm db:migrate

# Run
pnpm dev
```

See [Getting Started](documentation/guides/getting-started.md) for details.

## Project Structure

```
bloxtr8/
├── apps/
│   ├── api/              # Express.js API
│   ├── discord-bot/      # Discord.js bot
│   └── web-app/          # React app
├── packages/
│   ├── database/         # Prisma + PostgreSQL
│   ├── shared/           # Common utilities
│   ├── storage/          # S3 client
│   └── types/            # TypeScript types
└── documentation/        # Technical docs
```

## Commands

### Development Commands

```bash
pnpm dev              # Start API
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm build            # Build all
pnpm db:studio        # Prisma Studio
pnpm db:migrate       # Run migrations
```

### Discord Bot Commands

The Discord bot provides slash commands for managing listings and accounts:

- `/help` - Show available commands and help information
- `/signup` - Create your Bloxtr8 account
- `/link` - Link your Roblox account to Bloxtr8
- `/verify [id]` - Check account verification status
- `/listing create` - Create a new verified game ownership listing
- `/listing view` - View all available listings with filtering and pagination
- `/ping` - Check bot latency

## Documentation

- [Getting Started](documentation/guides/getting-started.md)
- [Development Guide](documentation/guides/development.md)
- [API Reference](documentation/api/README.md)
- [System Architecture](documentation/architecture/system-overview.md)
- [Database Schema](documentation/architecture/database-schema.md)

## Tech Stack

- **Backend**: Express.js, TypeScript, Prisma
- **Database**: PostgreSQL
- **Bot**: Discord.js v14
- **Web**: React 19, Vite, TanStack Router
- **Auth**: Better Auth (Discord + Roblox OAuth)
- **Payments**: Stripe, USDC on Base
- **Build**: Turborepo, pnpm workspaces

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## Security

Report vulnerabilities to security@bloxtr8.com

See [SECURITY.md](SECURITY.md)

## License

ISC
