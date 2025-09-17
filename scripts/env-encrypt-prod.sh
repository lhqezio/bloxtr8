#!/bin/bash
# Encrypt production environment from .env.production.local

# Check if .env.keys exists
if [ ! -f ".env.keys" ]; then
    echo "Error: .env.keys file not found!"
    echo "Please create .env.keys file with your dotenvx private keys."
    echo "See documentation for setup instructions."
    exit 1
fi

source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_PRODUCTION:-$DOTENV_PRIVATE_KEY}

# Check if source file exists
if [ ! -f ".env.production.local" ]; then
    echo "Error: .env.production.local file not found!"
    echo "Please create .env.production.local with your production environment variables."
    exit 1
fi

cp .env.production.local .env.production
dotenvx encrypt -f .env.production

echo "Production environment encrypted to .env.production"
