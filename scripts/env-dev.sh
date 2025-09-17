#!/bin/bash
# Development environment helper script
cp .env.development .env
source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}
exec "$@"
