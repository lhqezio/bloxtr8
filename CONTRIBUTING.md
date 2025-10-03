# Contributing

## Setup

```bash
git clone https://github.com/yourusername/bloxtr8.git
cd bloxtr8
pnpm install
cp .env.local.example .env.development.local
# Edit .env.development.local with your credentials
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Development Workflow

```bash
# Create branch
git checkout -b feature/your-feature

# Make changes, then test
pnpm lint
pnpm test
pnpm build

# Commit
git add .
git commit -m "feat: add feature"
git push origin feature/your-feature
```

## Code Style

- TypeScript strict mode
- ESLint + Prettier (auto-format on save)
- Use `@bloxtr8/*` imports for shared packages
- Add tests for new features

## Commit Format

```
type: description

feat: add user profile page
fix: resolve Discord modal timeout
docs: update API reference
refactor: optimize database queries
test: add listing creation tests
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Requests

1. Create PR from your feature branch
2. Ensure CI passes
3. Request review
4. Merge after approval

## Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## Database Changes

```bash
# Edit schema
vim packages/database/prisma/schema.prisma

# Create migration
pnpm db:migrate

# Generate client
pnpm db:generate
```

## Questions

- Check existing docs first
- Search GitHub issues
- Ask in Discord
- Create new issue if needed
