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
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/

# Install only API dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/api...

# Copy source code
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Generate Prisma client and build the application
RUN pnpm --filter @bloxtr8/database generate
RUN pnpm --filter @bloxtr8/api build

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
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/
COPY packages/types/package.json ./packages/types/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/api... --prod

# Copy built application and Prisma client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/packages/database/src/generated ./packages/database/src/generated

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]