#!/bin/bash
# Production environment helper script
cp .env.production .env
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_PRODUCTION:-$DOTENV_PRIVATE_KEY}
exec "$@"
