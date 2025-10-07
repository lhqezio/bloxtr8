# Bloxtr8

Discord-native escrow and verification for Roblox game trading.

## Overview

Addresses the $300M+ Roblox trading market on Discord with enterprise-grade escrow, verification, and dispute resolution.

**Features**:

- **Thread-Based Marketplace**: Dedicated Discord threads for each listing with rich embeds
- **Smart Organization**: Automatic price-range channels ($1k-5k, $5k-25k, $25k-100k, $100k+)
- **Cross-Guild Visibility**: PUBLIC listings appear in all servers automatically
- **Secure Escrow**: Stripe ≤$10k, USDC on Base >$10k
- **Roblox Game Verification**: Automated ownership verification
- **Digital Contracts**: DocuSign integration
- **Wallet Screening**: TRM Labs, Chainalysis
- **Discord Native**: Slash commands, threads, rich interactions
- **3-Tier KYC System**: TIER_0 → TIER_1 → TIER_2

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

```bash
pnpm dev              # Start API
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm build            # Build all
pnpm db:studio        # Prisma Studio
pnpm db:migrate       # Run migrations
```

## Documentation

- [Getting Started](documentation/guides/getting-started.md)
- [Development Guide](documentation/guides/development.md)
- [API Reference](documentation/api/README.md)
- [System Architecture](documentation/architecture/system-overview.md)
- [Database Schema](documentation/architecture/database-schema.md)
- [Discord Bot Flow](apps/discord-bot/FLOW_DIAGRAM.md)

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
