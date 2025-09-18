#!/bin/bash
# Decrypt development environment to .env.development.local

# Check if .env.keys exists
if [ ! -f ".env.keys" ]; then
    echo "Error: .env.keys file not found!"
    echo "Please create .env.keys file with your dotenvx private keys."
    echo "See documentation for setup instructions."
    exit 1
fi

source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}
export PATH="./node_modules/.bin:$PATH"
# Decrypt to stdout and filter out dotenvx header comments
dotenvx decrypt --stdout -f .env.development | grep -v "^#/" | grep -v "^#\[" | grep -v "^#\s*$" > .env.development.local

echo "Development environment decrypted to .env.development.local"
