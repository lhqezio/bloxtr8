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
COPY apps/payments-service/package.json ./apps/payments-service/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka-client/package.json ./packages/kafka-client/
COPY packages/outbox-publisher/package.json ./packages/outbox-publisher/
COPY packages/tracing/package.json ./packages/tracing/
COPY packages/types/package.json ./packages/types/
COPY packages/protobuf-schemas/package.json ./packages/protobuf-schemas/

RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/payments-service...

# Copy source code
COPY packages/ ./packages/
COPY apps/payments-service/ ./apps/payments-service/

# Build the application
RUN pnpm --filter @bloxtr8/payments-service build

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
COPY apps/payments-service/package.json ./apps/payments-service/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/kafka-client/package.json ./packages/kafka-client/
COPY packages/outbox-publisher/package.json ./packages/outbox-publisher/
COPY packages/tracing/package.json ./packages/tracing/
COPY packages/types/package.json ./packages/types/
COPY packages/protobuf-schemas/package.json ./packages/protobuf-schemas/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --reporter=silent --filter @bloxtr8/payments-service... --prod

# Copy built application
COPY --from=builder /app/apps/payments-service/dist ./apps/payments-service/dist
COPY --from=builder /app/packages ./packages

CMD ["node", "apps/payments-service/dist/index.js"]