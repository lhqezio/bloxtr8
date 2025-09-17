#!/bin/bash
# Decrypt production environment to .env.production.local
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_PRODUCTION:-$DOTENV_PRIVATE_KEY}
dotenvx decrypt -f .env.production
cp .env.production .env.production.local
