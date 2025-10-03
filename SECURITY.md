# Security

## Reporting Vulnerabilities

Email: **security@bloxtr8.com**

Include:

- Vulnerability description
- Steps to reproduce
- Affected files/components
- Potential impact

Response: 48 hours

## Security Measures

**Authentication**:

- OAuth 2.0 (Discord, Roblox)
- JWT tokens
- Better Auth library

**API**:

- Rate limiting (100 req/15min)
- Helmet.js security headers
- CORS validation
- Input validation (Zod)
- Parameterized queries (Prisma)

**Payments**:

- Stripe webhook signature verification
- Custodian webhook HMAC validation
- Wallet screening (TRM Labs, Chainalysis)
- Event idempotency checking

**Data**:

- TLS 1.3 in transit
- Database encryption at rest
- dotenvx encrypted env vars
- No secrets in git

**Blockchain**:

- Wallet risk screening before transactions
- Sanctions list checking
- Transaction monitoring

## Security Practices

**Code**:

- Never commit secrets
- Validate all input
- Use Prisma ORM (no raw SQL)
- Avoid `eval()` and similar
- Handle errors properly

**Dependencies**:

- Run `pnpm audit` regularly
- Keep dependencies updated
- Review security advisories

**Deployment**:

- Encrypted environment variables
- Database credentials secured
- SSL/TLS enabled
- Access logs enabled
- Regular backups

## Known Limitations

- Security depends on Discord infrastructure
- Third-party API reliability (Roblox, Stripe)
- Blockchain transaction finality on Base=
