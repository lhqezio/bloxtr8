#!/bin/bash
# Encrypt production environment from .env.production.local
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_PRODUCTION:-$DOTENV_PRIVATE_KEY}
cp .env.production.local .env.production
dotenvx encrypt -f .env.production
