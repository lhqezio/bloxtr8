#!/bin/bash
# Decrypt development environment to .env.development.local
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}
dotenvx decrypt -f .env.development
cp .env.development .env.development.local
