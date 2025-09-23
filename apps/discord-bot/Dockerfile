# syntax=docker/dockerfile:1.6

# Build stage
FROM node:20-alpine AS builder

# Install pnpm
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json ./packages/types/

# Install only Discord bot dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/discord-bot...

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY packages/types/ ./packages/types/
COPY apps/discord-bot/ ./apps/discord-bot/

# Build the application
RUN pnpm --filter @bloxtr8/discord-bot build

# Production stage
FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

# Install pnpm
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY packages/shared/package.json ./packages/shared/
COPY packages/types/package.json ./packages/types/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/discord-bot... --prod

# Copy built application
COPY --from=builder /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/types ./packages/types

CMD ["node", "apps/discord-bot/dist/index.js"]