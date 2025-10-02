# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive documentation structure
- Architecture Decision Records (ADRs)
- Contributing guidelines
- Security policy
- Code of Conduct

## [0.1.0] - 2025-01-02

### Added

- Initial monorepo setup with pnpm workspaces
- Express.js API server with TypeScript
- Discord bot with slash commands
- React web application with Vite
- PostgreSQL database with Prisma ORM
- Better Auth integration (Discord + Roblox OAuth)
- Three-tier KYC system (TIER_0, TIER_1, TIER_2)
- Roblox game ownership verification
- Asset verification API with 24-hour caching
- User management system
- Listing creation via Discord bot
- JWT authentication
- Rate limiting and security headers
- Environment variable encryption with dotenvx
- Docker support for development
- Comprehensive test suite
- ESLint and Prettier configuration
- GitHub Actions CI/CD pipeline

### Security

- Implemented helmet.js security headers
- Added CORS configuration
- JWT token-based authentication
- Input validation with Zod
- Parameterized queries with Prisma ORM
- Environment variable encryption

---

## Release Notes Format

### Types of Changes

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

### Version Numbers

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

---

[Unreleased]: https://github.com/bloxtr8/bloxtr8/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bloxtr8/bloxtr8/releases/tag/v0.1.0
