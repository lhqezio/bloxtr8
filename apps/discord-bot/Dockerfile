# syntax=docker/dockerfile:1.6

# Use the shared base image
FROM bloxtr8-base:latest AS base

# Production runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy only the built application and necessary files
COPY --from=base /app/apps/discord-bot/dist ./apps/discord-bot/dist
COPY --from=base /app/packages ./packages
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

# Discord bot does not require inbound ports
CMD ["node", "apps/discord-bot/dist/index.js"]