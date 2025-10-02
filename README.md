# Bloxtr8

**Discord-Native Escrow & Verification Platform for Roblox Game Trading**

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-≥18.0.0-green)](https://nodejs.org/)

[Documentation](documentation/) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

---

## Overview

Bloxtr8 addresses the **$300M+ Roblox game trading market** operating on Discord with no safety net—causing **$12M+ in annual scam losses**. We provide enterprise-grade escrow, verification, and dispute resolution embedded directly into Discord.

### Key Features

- 🔒 **Secure Escrow** - Multi-rail payment system (Stripe ≤$10k, USDC on Base >$10k)
- ✅ **Ownership Verification** - Automated Roblox game ownership verification
- 📝 **Digital Contracts** - DocuSign integration for legally binding agreements
- 🛡️ **Risk Management** - TRM Labs + Chainalysis wallet screening
- 🤖 **Discord Native** - Slash commands, modals, interactive components
- 📊 **KYC System** - Three-tier verification for trust and compliance

## Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.local.example .env.development.local

# Generate Prisma client and run migrations
pnpm db:generate && pnpm db:migrate

# Start development
pnpm dev
```

**Full Guide**: [Getting Started](documentation/guides/getting-started.md)

## Project Structure

```
bloxtr8/
├── apps/                  # Applications
│   ├── api/              # Express.js REST API
│   ├── discord-bot/      # Discord.js bot
│   └── web-app/          # React web application
├── packages/             # Shared packages
│   ├── database/         # Prisma ORM + schema
│   ├── shared/           # Utilities & constants
│   ├── storage/          # AWS S3 utilities
│   └── types/            # TypeScript types
└── documentation/        # Comprehensive docs
```

## Documentation

### Developers

- [Development Guide](documentation/guides/development.md)
- [API Reference](documentation/api/README.md)
- [Contributing](CONTRIBUTING.md)

### Architecture

- [System Overview](documentation/architecture/system-overview.md)
- [Database Schema](documentation/architecture/database-schema.md)
- [Business Flow](documentation/architecture/business-flow.md)

### Operations

- [Deployment](documentation/operations/deployment.md)
- [Monitoring](documentation/operations/monitoring.md)
- [Security](SECURITY.md)

## Technology Stack

- **Backend**: Express.js + TypeScript + Prisma
- **Database**: PostgreSQL
- **Bot**: Discord.js v14
- **Web**: React 19 + Vite + TanStack Router
- **Auth**: Better Auth (Discord + Roblox OAuth)
- **Payments**: Stripe + USDC on Base
- **Contracts**: DocuSign
- **Build**: Turborepo + pnpm

## Development Commands

```bash
pnpm dev              # Start API server
pnpm test             # Run tests
pnpm lint             # Lint code
pnpm db:studio        # Open Prisma Studio
pnpm docker:dev       # Docker development
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request

## License

ISC License - see [LICENSE](LICENSE) file

## Support

- **Docs**: [documentation/](documentation/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/bloxtr8/issues)
- **Email**: support@bloxtr8.com

---

Built with ❤️ by the Bloxtr8 Team
