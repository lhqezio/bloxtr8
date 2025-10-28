// Jest setup file to load environment variables before tests run
const { config } = require('@dotenvx/dotenvx');

// Load environment variables from .env file
config();
