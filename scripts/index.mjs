#!/usr/bin/env node

/**
 * Main script runner for Bloxtr8
 * Cross-platform replacement for all shell scripts
 */

import { parseArgs, showScriptHelp, printError } from './utils.mjs';
import {
  envDev,
  envProd,
  encryptDev,
  encryptProd,
  decryptDev,
  decryptProd,
} from './env.mjs';
import {
  buildFast,
  startDev,
  startDevBuild,
  startProd,
  startDbOnly,
  runTests,
  cleanDocker,
  pruneDocker,
  rebuildAll,
  showLogs,
  showStats,
  dockerUp,
  dockerDown,
} from './docker.mjs';

const commands = {
  // Environment commands
  'env:dev': 'Set up development environment and run command',
  'env:prod': 'Set up production environment and run command',
  'env:encrypt:dev': 'Encrypt development environment file',
  'env:encrypt:prod': 'Encrypt production environment file',
  'env:decrypt:dev': 'Decrypt development environment file',
  'env:decrypt:prod': 'Decrypt production environment file',

  // Docker commands
  'docker:build': 'Build all services with optimizations',
  'docker:dev': 'Start development environment with optimizations',
  'docker:dev:build': 'Start development environment with auto-build',
  'docker:prod': 'Start production environment',
  'docker:db': 'Start only the database service',
  'docker:test': 'Run tests in Docker environment',
  'docker:clean': 'Clean up Docker resources',
  'docker:prune': 'Remove unused Docker resources',
  'docker:rebuild': 'Force rebuild all images',
  'docker:logs': 'Show logs for all services',
  'docker:stats': 'Show resource usage statistics',
  'docker:up': 'Start services with docker compose up -d',
  'docker:down': 'Stop services with docker compose down',

  help: 'Show this help message',
};

/**
 * Main function
 */
async function main() {
  const { command, params } = parseArgs();

  try {
    switch (command) {
      // Environment commands
      case 'env:dev':
        envDev(params);
        break;
      case 'env:prod':
        envProd(params);
        break;
      case 'env:encrypt:dev':
        encryptDev();
        break;
      case 'env:encrypt:prod':
        encryptProd();
        break;
      case 'env:decrypt:dev':
        decryptDev();
        break;
      case 'env:decrypt:prod':
        decryptProd();
        break;

      // Docker commands
      case 'docker:build':
        buildFast();
        break;
      case 'docker:dev':
        startDev();
        break;
      case 'docker:dev:build':
        startDevBuild();
        break;
      case 'docker:prod':
        startProd();
        break;
      case 'docker:db':
        startDbOnly();
        break;
      case 'docker:test':
        await runTests();
        break;
      case 'docker:clean':
        cleanDocker();
        break;
      case 'docker:prune':
        pruneDocker();
        break;
      case 'docker:rebuild':
        rebuildAll();
        break;
      case 'docker:logs':
        showLogs();
        break;
      case 'docker:stats':
        showStats();
        break;
      case 'docker:up':
        dockerUp();
        break;
      case 'docker:down':
        dockerDown();
        break;

      case 'help':
      default:
        showScriptHelp('Bloxtr8 Scripts', commands);
        console.log('');
        console.log('Examples:');
        console.log(
          '  node scripts/node/index.mjs env:dev dotenvx run -- turbo run dev'
        );
        console.log('  node scripts/node/index.mjs docker:dev');
        console.log('  node scripts/node/index.mjs env:decrypt:dev');
        console.log('');
        console.log('Environment Management:');
        console.log('  1. Decrypt environment: env:decrypt:dev');
        console.log('  2. Edit .env.development.local');
        console.log('  3. Encrypt environment: env:encrypt:dev');
        console.log('  4. Commit encrypted .env.development');
        console.log('');
        console.log('Development Workflow:');
        console.log('  1. Setup environment: env:dev');
        console.log('  2. Start development: docker:dev');
        console.log('  3. View logs: docker:logs');
        break;
    }
  } catch (error) {
    printError(`Command failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
