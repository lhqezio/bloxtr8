#!/usr/bin/env node

/**
 * Environment management script for Bloxtr8
 * Cross-platform replacement for env-*.sh scripts
 */

import {
  parseArgs,
  showScriptHelp,
  setupEnvironment,
  printStatus,
  printSuccess,
  printError,
  executeCommand,
} from './utils.mjs';

const commands = {
  dev: 'Set up development environment and run command',
  prod: 'Set up production environment and run command',
  'encrypt-dev': 'Encrypt development environment file',
  'encrypt-prod': 'Encrypt production environment file',
  'decrypt-dev': 'Decrypt development environment file',
  'decrypt-prod': 'Decrypt production environment file',
  help: 'Show this help message',
};

/**
 * Set up development environment and execute command
 */
function envDev(args) {
  setupEnvironment('development');

  if (args.length > 0) {
    const command = args.join(' ');
    printStatus(`Executing: ${command}`);
    const result = executeCommand(command);
    process.exit(result.success ? 0 : 1);
  }
}

/**
 * Set up production environment and execute command
 */
function envProd(args) {
  setupEnvironment('production');

  if (args.length > 0) {
    const command = args.join(' ');
    printStatus(`Executing: ${command}`);
    const result = executeCommand(command);
    process.exit(result.success ? 0 : 1);
  }
}

/**
 * Encrypt development environment
 */
function encryptDev() {
  printStatus('Encrypting development environment...');

  const result = executeCommand(
    'dotenvx encrypt .env.development.local -f .env.development'
  );

  if (result.success) {
    printSuccess('Development environment encrypted successfully!');
    printStatus('You can now safely commit .env.development to git');
  } else {
    printError('Failed to encrypt development environment');
    process.exit(1);
  }
}

/**
 * Encrypt production environment
 */
function encryptProd() {
  printStatus('Encrypting production environment...');

  const result = executeCommand(
    'dotenvx encrypt .env.production.local -f .env.production'
  );

  if (result.success) {
    printSuccess('Production environment encrypted successfully!');
    printStatus('You can now safely commit .env.production to git');
  } else {
    printError('Failed to encrypt production environment');
    process.exit(1);
  }
}

/**
 * Decrypt development environment
 */
function decryptDev() {
  printStatus('Decrypting development environment...');

  const result = executeCommand(
    'dotenvx decrypt .env.development -f .env.development.local'
  );

  if (result.success) {
    printSuccess('Development environment decrypted successfully!');
    printStatus(
      'Edit .env.development.local and then run encrypt-dev to save changes'
    );
  } else {
    printError('Failed to decrypt development environment');
    printStatus(
      'Make sure you have the correct DOTENV_PRIVATE_KEY_DEV in your .env.keys file'
    );
    process.exit(1);
  }
}

/**
 * Decrypt production environment
 */
function decryptProd() {
  printStatus('Decrypting production environment...');

  const result = executeCommand(
    'dotenvx decrypt .env.production -f .env.production.local'
  );

  if (result.success) {
    printSuccess('Production environment decrypted successfully!');
    printStatus(
      'Edit .env.production.local and then run encrypt-prod to save changes'
    );
  } else {
    printError('Failed to decrypt production environment');
    printStatus(
      'Make sure you have the correct DOTENV_PRIVATE_KEY_PRODUCTION in your .env.keys file'
    );
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  const { command, params } = parseArgs();

  switch (command) {
    case 'dev':
      envDev(params);
      break;
    case 'prod':
      envProd(params);
      break;
    case 'encrypt-dev':
      encryptDev();
      break;
    case 'encrypt-prod':
      encryptProd();
      break;
    case 'decrypt-dev':
      decryptDev();
      break;
    case 'decrypt-prod':
      decryptProd();
      break;
    case 'help':
    default:
      showScriptHelp('env.mjs', commands);
      break;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { envDev, envProd, encryptDev, encryptProd, decryptDev, decryptProd };
