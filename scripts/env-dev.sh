#!/bin/bash
# Development environment helper script
cp .env.development.local .env

# Copy .env to each app directory so dotenvx can find it
cp .env apps/api/.env
cp .env apps/discord-bot/.env
# Only copy if escrow-service directory exists
[ -d "apps/escrow-service" ] && cp .env apps/escrow-service/.env || true

# Check if .env.keys exists, if not, warn but continue
if [ -f ".env.keys" ]; then
    source .env.keys
    export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}
else
    echo "Warning: .env.keys file not found. Environment variables will remain encrypted."
    echo "To decrypt them, create .env.keys file and run ./scripts/env-decrypt-dev.sh"
fi

exec "$@"
