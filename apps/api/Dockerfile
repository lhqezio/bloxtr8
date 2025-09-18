# syntax=docker/dockerfile:1.6

# Use the shared base image
FROM bloxtr8-base:latest AS base

# Build stage - build the API application
FROM base AS build
# Build the API application (dependencies already installed in base image)
RUN pnpm --filter @bloxtr8/api... build

# Production runtime image
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy only the built application and necessary files
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]