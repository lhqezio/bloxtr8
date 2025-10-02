# Getting Started with Bloxtr8

This guide will help you set up your local development environment for Bloxtr8.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Node.js** version 18.0.0 or higher
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify: `node --version`

- **pnpm** version 8.0.0 or higher
  - Install: `corepack enable` (Node.js 16.13+)
  - Or: `npm install -g pnpm`
  - Verify: `pnpm --version`

- **PostgreSQL** version 14 or higher
  - [Installation guide](https://www.postgresql.org/download/)
  - Verify: `psql --version`

- **Git**
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify: `git --version`

### Optional

- **Docker** and **Docker Compose**
  - For containerized development
  - [Installation guide](https://docs.docker.com/get-docker/)

- **VS Code**
  - Recommended IDE with extensions:
    - ESLint
    - Prettier
    - Prisma
    - TypeScript

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/bloxtr8.git
cd bloxtr8
```

### 2. Install Dependencies

```bash
pnpm install
```

This will install all dependencies for all workspaces in the monorepo.

### 3. Set Up Environment Variables

```bash
# Copy example environment file
cp .env.local.example .env.development.local
```

Edit `.env.development.local` with your credentials:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bloxtr8"
DATABASE_URL_PRISMA="postgresql://postgres:postgres@localhost:5432/bloxtr8"

# Discord
DISCORD_CLIENT_ID="your_discord_client_id"
DISCORD_CLIENT_SECRET="your_discord_client_secret"
DISCORD_BOT_TOKEN="your_discord_bot_token"
DISCORD_GUILD_ID="your_test_guild_id"

# Roblox
ROBLOX_CLIENT_ID="your_roblox_client_id"
ROBLOX_CLIENT_SECRET="your_roblox_client_secret"

# API
PORT=3000
NODE_ENV=development
JWT_SECRET="your_jwt_secret_min_32_chars"

# Web App
WEB_APP_URL="http://localhost:5173"
```

#### Getting API Credentials

**Discord:**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Copy Client ID and Client Secret
4. Go to "Bot" tab and create a bot
5. Copy Bot Token
6. Enable required intents: Guilds, Guild Messages, Message Content

**Roblox:**

1. Go to [Roblox Creator Dashboard](https://create.roblox.com/credentials)
2. Create OAuth2 credentials
3. Set redirect URI to `http://localhost:3000/api/oauth/roblox/callback`

### 4. Set Up Database

#### Option A: Local PostgreSQL

```bash
# Create database
createdb bloxtr8

# Or using psql
psql -U postgres -c "CREATE DATABASE bloxtr8;"
```

#### Option B: Docker PostgreSQL

```bash
docker run --name bloxtr8-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=bloxtr8 \
  -p 5432:5432 \
  -d postgres:16
```

### 5. Run Database Migrations

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database with test data (optional)
pnpm db:seed
```

### 6. Start Development Servers

```bash
# Start API server (runs on http://localhost:3000)
pnpm dev
```

In separate terminals:

```bash
# Start Discord bot
pnpm --filter=@bloxtr8/discord-bot dev

# Start web app (runs on http://localhost:5173)
pnpm --filter=@bloxtr8/web-app dev
```

## Verify Installation

### Check API Server

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-02T12:00:00.000Z",
  "database": "connected"
}
```

### Check Discord Bot

In your Discord server, run:

```
/ping
```

The bot should respond with latency information.

### Check Database

```bash
# Open Prisma Studio
pnpm db:studio
```

This opens a web interface at `http://localhost:5555` to browse your database.

## Common Issues

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Failed

- Verify PostgreSQL is running: `pg_isready`
- Check DATABASE_URL in `.env.development.local`
- Ensure database exists: `psql -l`

### Prisma Client Not Generated

```bash
# Regenerate Prisma client
pnpm db:generate
```

### Discord Bot Not Responding

- Verify bot token is correct
- Check bot has required permissions
- Ensure intents are enabled in Discord Developer Portal
- Check DISCORD_GUILD_ID is set correctly

### Environment Variables Not Loading

```bash
# Ensure dotenvx is working
pnpm env:ls

# Verify keys are present
cat .env.keys
```

## Next Steps

- **Development Guide**: Learn about the codebase structure and development workflow
  - See [Development Guide](development.md)

- **API Documentation**: Explore the API endpoints
  - See [API Reference](../api/README.md)

- **Architecture**: Understand the system design
  - See [System Architecture](../architecture/system-overview.md)

- **Contributing**: Learn how to contribute
  - See [Contributing Guidelines](../../CONTRIBUTING.md)

## Development Workflow

```bash
# Daily development workflow

# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
pnpm install

# 3. Run migrations
pnpm db:migrate

# 4. Start development
pnpm dev

# 5. Make changes and test
pnpm test
pnpm lint

# 6. Commit changes
git add .
git commit -m "feat: your feature"
git push
```

## Useful Commands

```bash
# Database
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:push          # Push schema changes (dev only)
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed database
pnpm db:reset         # Reset database

# Development
pnpm dev              # Start API server
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm lint             # Lint code
pnpm lint:fix         # Auto-fix linting issues
pnpm format           # Format code
pnpm format:check     # Check formatting

# Docker
pnpm docker:dev       # Start dev environment
pnpm docker:down      # Stop containers
pnpm docker:logs      # View logs
```

## Resources

- [Development Guide](development.md)
- [API Reference](../api/README.md)
- [Database Schema](../architecture/database-schema.md)
- [Contributing](../../CONTRIBUTING.md)
- [Discord.js Documentation](https://discord.js.org/)
- [Prisma Documentation](https://www.prisma.io/docs)

## Support

- Check existing documentation
- Search GitHub issues
- Ask in Discord
- Create new issue if needed
