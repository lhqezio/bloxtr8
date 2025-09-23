#!/usr/bin/env node

/**
 * Docker Compose Performance Optimization Script
 * Cross-platform replacement for docker-optimize.sh
 */

import {
  parseArgs,
  showScriptHelp,
  printStatus,
  printSuccess,
  printWarning,
  printError,
  executeCommand,
  checkDockerAvailable,
  checkDockerComposeAvailable,
  getDockerComposeCommand,
  sleep,
} from './utils.mjs';

const commands = {
  'build-fast': 'Build all services with optimizations',
  dev: 'Start development environment with optimizations',
  'dev-build': 'Start development environment with auto-build',
  prod: 'Start production environment',
  'db-only': 'Start only the database service',
  test: 'Run tests in Docker environment',
  clean: 'Clean up Docker resources',
  prune: 'Remove unused Docker resources',
  rebuild: 'Force rebuild all images',
  logs: 'Show logs for all services',
  stats: 'Show resource usage statistics',
  up: 'Start services with docker compose up -d',
  down: 'Stop services with docker compose down',
  help: 'Show this help message',
};

/**
 * Check Docker prerequisites
 */
function checkPrerequisites() {
  if (!checkDockerAvailable()) {
    printError('Docker is not available. Please install Docker first.');
    printStatus('Visit: https://docs.docker.com/get-docker/');
    process.exit(1);
  }

  if (!checkDockerComposeAvailable()) {
    printError(
      'Docker Compose is not available. Please install Docker Compose first.'
    );
    printStatus('Visit: https://docs.docker.com/compose/install/');
    process.exit(1);
  }
}

/**
 * Build all services with optimizations
 */
function buildFast() {
  checkPrerequisites();
  printStatus('Building all services with optimizations...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} build --parallel`);

  if (result.success) {
    printSuccess('All services built successfully!');
  } else {
    printError('Build failed');
    process.exit(1);
  }
}

/**
 * Start development environment
 */
function startDev() {
  checkPrerequisites();
  printStatus('Starting development environment with optimizations...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} up -d --build`);

  if (result.success) {
    printSuccess('Development environment started!');
    printStatus('Services available at:');
    console.log('  - API: http://localhost:3000');
    console.log('  - PostgreSQL: localhost:5432');
    console.log('  - MinIO: http://localhost:9001');
  } else {
    printError('Failed to start development environment');
    process.exit(1);
  }
}

/**
 * Start development environment with auto-build
 */
function startDevBuild() {
  checkPrerequisites();
  printStatus('Starting development environment with auto-build...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} up -d --build`);

  if (result.success) {
    printSuccess('Development environment started with auto-build!');
    printStatus('Services available at:');
    console.log('  - API: http://localhost:3000');
    console.log('  - PostgreSQL: localhost:5432');
    console.log('  - MinIO: http://localhost:9001');
  } else {
    printError('Failed to start development environment');
    process.exit(1);
  }
}

/**
 * Start production environment
 */
function startProd() {
  checkPrerequisites();
  printStatus('Starting production environment...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} -f docker-compose.yml up -d`);

  if (result.success) {
    printSuccess('Production environment started!');
  } else {
    printError('Failed to start production environment');
    process.exit(1);
  }
}

/**
 * Start only database service
 */
function startDbOnly() {
  checkPrerequisites();
  printStatus('Starting database service only...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} up -d test-db minio`);

  if (result.success) {
    printSuccess('Database and MinIO services started!');
    printStatus('Services available at:');
    console.log('  - PostgreSQL: localhost:5432');
    console.log('  - MinIO: http://localhost:9001');
  } else {
    printError('Failed to start database services');
    process.exit(1);
  }
}

/**
 * Run tests in Docker environment
 */
async function runTests() {
  checkPrerequisites();
  printStatus('Running tests in Docker environment...');

  const dockerCompose = getDockerComposeCommand();

  // Start database first
  printStatus('Starting test database...');
  let result = executeCommand(`${dockerCompose} up -d test-db`);

  if (!result.success) {
    printError('Failed to start test database');
    process.exit(1);
  }

  // Wait for database to be ready
  printStatus('Waiting for database to be ready...');
  await sleep(5);

  // Run tests
  printStatus('Running tests...');
  result = executeCommand(`${dockerCompose} run --rm api pnpm test`);

  if (result.success) {
    printSuccess('Tests completed!');
  } else {
    printError('Tests failed');
    process.exit(1);
  }
}

/**
 * Clean up Docker resources
 */
function cleanDocker() {
  checkPrerequisites();
  printStatus('Cleaning up Docker resources...');

  const dockerCompose = getDockerComposeCommand();

  // Stop and remove containers
  executeCommand(`${dockerCompose} down`);

  // Remove unused images
  executeCommand('docker image prune -f');

  // Remove unused volumes
  executeCommand('docker volume prune -f');

  printSuccess('Docker cleanup completed!');
}

/**
 * Prune unused resources
 */
function pruneDocker() {
  checkPrerequisites();
  printStatus('Pruning unused Docker resources...');

  const result = executeCommand('docker system prune -af');

  if (result.success) {
    printSuccess('Docker prune completed!');
  } else {
    printError('Docker prune failed');
    process.exit(1);
  }
}

/**
 * Force rebuild all images
 */
function rebuildAll() {
  checkPrerequisites();
  printStatus('Force rebuilding all images...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} build --no-cache --parallel`);

  if (result.success) {
    printSuccess('All images rebuilt successfully!');
  } else {
    printError('Rebuild failed');
    process.exit(1);
  }
}

/**
 * Show logs for all services
 */
function showLogs() {
  checkPrerequisites();
  printStatus('Showing logs for all services...');

  const dockerCompose = getDockerComposeCommand();
  executeCommand(`${dockerCompose} logs -f`);
}

/**
 * Show resource usage statistics
 */
function showStats() {
  checkPrerequisites();
  printStatus('Showing resource usage statistics...');

  executeCommand('docker stats');
}

/**
 * Start services with docker compose up -d
 */
function dockerUp() {
  checkPrerequisites();
  printStatus('Starting services...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} up -d`);

  if (result.success) {
    printSuccess('Services started!');
  } else {
    printError('Failed to start services');
    process.exit(1);
  }
}

/**
 * Stop services with docker compose down
 */
function dockerDown() {
  checkPrerequisites();
  printStatus('Stopping services...');

  const dockerCompose = getDockerComposeCommand();
  const result = executeCommand(`${dockerCompose} down`);

  if (result.success) {
    printSuccess('Services stopped!');
  } else {
    printError('Failed to stop services');
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const { command } = parseArgs();

  switch (command) {
    case 'build-fast':
      buildFast();
      break;
    case 'dev':
      startDev();
      break;
    case 'dev-build':
      startDevBuild();
      break;
    case 'prod':
      startProd();
      break;
    case 'db-only':
      startDbOnly();
      break;
    case 'test':
      await runTests();
      break;
    case 'clean':
      cleanDocker();
      break;
    case 'prune':
      pruneDocker();
      break;
    case 'rebuild':
      rebuildAll();
      break;
    case 'logs':
      showLogs();
      break;
    case 'stats':
      showStats();
      break;
    case 'up':
      dockerUp();
      break;
    case 'down':
      dockerDown();
      break;
    case 'help':
    default:
      showScriptHelp('docker.mjs', commands);
      console.log('');
      console.log('Performance Tips:');
      console.log('  - Use "build-fast" to build all services in parallel');
      console.log('  - Use "dev" for development with hot reloading');
      console.log('  - Use "clean" to free up disk space');
      console.log('  - Use "prune" to remove unused images and containers');
      break;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    printError(`Script failed: ${error.message}`);
    process.exit(1);
  });
}

export {
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
};
