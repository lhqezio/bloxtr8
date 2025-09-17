#!/bin/bash
# Encrypt development environment from .env.development.local
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}
cp .env.development.local .env.development
dotenvx encrypt -f .env.development
