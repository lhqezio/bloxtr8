# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
RUN corepack enable
WORKDIR /app

# Copy the entire monorepo so pnpm can resolve all workspace packages
COPY . .

# Install workspace dependencies
RUN pnpm install --no-frozen-lockfile --reporter=silent

# Build the bot package
FROM base AS build
# Source already present from base stage
RUN pnpm --filter @bloxtr8/discord-bot... build

# Production runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy built workspace
COPY --from=build /app /app

# Discord bot does not require inbound ports
# Use dotenvx to load envs (.env for dev or .env.vault with DOTENV_KEY for prod)
CMD ["node", "apps/discord-bot/dist/index.js"]
