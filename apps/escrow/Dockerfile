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
COPY apps/escrow/package.json ./apps/escrow/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/

# Install only Escrow dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/escrow...

# Copy source code
COPY packages/ ./packages/
COPY apps/escrow/ ./apps/escrow/

# Build the application
RUN pnpm --filter @bloxtr8/escrow build

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
COPY apps/escrow/package.json ./apps/escrow/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/escrow... --prod

# Copy built application
COPY --from=builder /app/apps/escrow/dist ./apps/escrow/dist
COPY --from=builder /app/packages ./packages

EXPOSE 3001
CMD ["node", "apps/escrow/dist/index.js"]