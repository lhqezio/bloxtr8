#!/bin/bash
# Decrypt production environment to .env.production.local

# Check if .env.keys exists
if [ ! -f ".env.keys" ]; then
    echo "Error: .env.keys file not found!"
    echo "Please create .env.keys file with your dotenvx private keys."
    echo "See documentation for setup instructions."
    exit 1
fi

source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_PRODUCTION:-$DOTENV_PRIVATE_KEY}
export PATH="./node_modules/.bin:$PATH"
# Decrypt to stdout and filter out dotenvx header comments
dotenvx decrypt --stdout -f .env.production | grep -v "^#/" | grep -v "^#\[" | grep -v "^#\s*$" > .env.production.local

echo "Production environment decrypted to .env.production.local"
