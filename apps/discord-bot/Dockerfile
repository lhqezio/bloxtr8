# syntax=docker/dockerfile:1.6

# Use the shared base image
FROM bloxtr8-base:latest AS base

# Build stage - build the Discord bot application
FROM base AS build
# Build the Discord bot application (dependencies already installed in base image)
RUN pnpm --filter @bloxtr8/discord-bot... build

# Production runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy only the built application and necessary files
COPY --from=build /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Discord bot does not require inbound ports
CMD ["node", "apps/discord-bot/dist/index.js"]