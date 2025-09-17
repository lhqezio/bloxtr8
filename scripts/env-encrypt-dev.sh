#!/bin/bash
# Encrypt development environment from .env.development.local

# Check if .env.keys exists
if [ ! -f ".env.keys" ]; then
    echo "Error: .env.keys file not found!"
    echo "Please create .env.keys file with your dotenvx private keys."
    echo "See documentation for setup instructions."
    exit 1
fi

source .env.keys
export DOTENV_PRIVATE_KEY=${DOTENV_PRIVATE_KEY_DEV:-$DOTENV_PRIVATE_KEY}

# Check if source file exists
if [ ! -f ".env.development.local" ]; then
    echo "Error: .env.development.local file not found!"
    echo "Please create .env.development.local with your development environment variables."
    exit 1
fi

cp .env.development.local .env.development
dotenvx encrypt -f .env.development

echo "Development environment encrypted to .env.development"
