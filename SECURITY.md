# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@bloxtr8.com**

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

### What to Include

Please include the following information:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting)
- Full paths of source file(s) related to the issue
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Varies based on severity and complexity

## Security Updates

Security updates are released as soon as fixes are available and tested.

- **Critical**: Released immediately
- **High**: Released within 7 days
- **Medium**: Released within 30 days
- **Low**: Released in next scheduled release

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Measures

### Authentication & Authorization

- **OAuth 2.0**: Discord and Roblox authentication
- **JWT**: Session management with secure token rotation
- **Better Auth**: Industry-standard authentication library
- **Session Security**: HTTP-only cookies, CSRF protection

### Data Protection

- **Encryption at Rest**: Sensitive data encrypted in database
- **Encryption in Transit**: TLS 1.3 for all connections
- **Environment Variables**: Encrypted with dotenvx
- **API Keys**: Secure storage and rotation

### API Security

- **Rate Limiting**: Protection against abuse and DDoS
- **Input Validation**: Zod schema validation on all inputs
- **SQL Injection**: Prisma ORM with parameterized queries
- **XSS Protection**: Helmet.js security headers
- **CORS**: Strict origin validation

### Webhook Security

- **Signature Verification**: All webhooks verified (Stripe, custodian)
- **Idempotency**: Duplicate event prevention
- **Event Logging**: Comprehensive audit trail

### Blockchain Security

- **Wallet Screening**: TRM Labs + Chainalysis integration
- **Risk Assessment**: Automated wallet risk scoring
- **Sanctions Screening**: Real-time sanctioned wallet blocking

### Infrastructure Security

- **Docker**: Containerized deployment
- **Environment Isolation**: Separate dev/staging/prod
- **Secrets Management**: No secrets in code or git
- **Dependency Scanning**: Automated vulnerability detection

### Code Security

- **Static Analysis**: ESLint security plugins
- **Dependency Audits**: Regular `pnpm audit` checks
- **Code Review**: Required for all changes
- **Type Safety**: TypeScript strict mode

### Compliance

- **PCI DSS**: Stripe handles payment processing
- **GDPR**: User data protection and privacy
- **KYC/AML**: Three-tier verification system
- **Audit Logging**: Complete transaction history

## Security Best Practices for Contributors

### Code

- Never commit secrets or API keys
- Use environment variables for sensitive data
- Validate and sanitize all user input
- Use parameterized queries (Prisma ORM)
- Implement proper error handling
- Avoid using `eval()` or similar functions
- Use secure random number generation

### Dependencies

- Keep dependencies up-to-date
- Review dependency security advisories
- Use `pnpm audit` before committing
- Verify package integrity

### Authentication

- Never store passwords in plain text
- Use bcrypt for password hashing (if applicable)
- Implement rate limiting on auth endpoints
- Use secure session management
- Implement proper logout functionality

### API Development

- Validate all input with Zod schemas
- Implement proper authorization checks
- Use HTTPS only
- Set appropriate CORS headers
- Implement rate limiting
- Return appropriate HTTP status codes
- Don't expose sensitive information in errors

### Database

- Use Prisma ORM for all queries
- Never use raw SQL with user input
- Implement proper access controls
- Use database migrations
- Backup regularly

## Known Security Limitations

- **Discord Dependency**: Security dependent on Discord's infrastructure
- **Third-party APIs**: Reliance on Roblox, Stripe, DocuSign security
- **Blockchain**: Smart contract risks (future implementation)

## Security Testing

We encourage security researchers to test our application. Please follow these guidelines:

### Permitted Activities

- Testing against your own accounts
- Reporting vulnerabilities privately
- Waiting for fix before disclosure

### Prohibited Activities

- Accessing other users' data
- Performing DoS/DDoS attacks
- Social engineering attacks
- Physical attacks
- Automated scanning without permission

## Security Checklist for Deployment

- [ ] All environment variables encrypted
- [ ] Database credentials secured
- [ ] API keys rotated and secured
- [ ] TLS/SSL certificates valid
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Helmet security headers enabled
- [ ] Logging and monitoring active
- [ ] Backups configured
- [ ] Incident response plan ready

## Security Contacts

- **Security Issues**: security@bloxtr8.com
- **General Security**: security@bloxtr8.com
- **Compliance**: compliance@bloxtr8.com

## Acknowledgments

We thank all security researchers who have helped improve Bloxtr8's security.

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

Last updated: 2025-01-02
