#!/usr/bin/env node

/**
 * Cross-platform utilities for Bloxtr8 scripts
 * Replaces shell script functionality with Node.js equivalents
 */

import { execSync, spawn } from 'child_process';
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Color codes for terminal output
export const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Print colored output to console
 */
export function printStatus(message, color = colors.blue) {
  console.log(`${color}[INFO]${colors.reset} ${message}`);
}

export function printSuccess(message) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

export function printWarning(message) {
  console.log(`${colors.yellow}[WARNING]${colors.reset} ${message}`);
}

export function printError(message) {
  console.log(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

/**
 * Execute a command and return the result
 */
export function executeCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      cwd: projectRoot,
      stdio: 'inherit',
      encoding: 'utf8',
      ...options,
    });
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute a command asynchronously
 */
export function executeCommandAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      ...options,
    });

    child.on('close', code => {
      if (code === 0) {
        resolve({ success: true, code });
      } else {
        reject({
          success: false,
          code,
          error: `Command failed with code ${code}`,
        });
      }
    });

    child.on('error', error => {
      reject({ success: false, error: error.message });
    });
  });
}

/**
 * Check if a file exists
 */
export function fileExists(filepath) {
  return existsSync(join(projectRoot, filepath));
}

/**
 * Copy file from source to destination
 */
export function copyFile(src, dest) {
  const srcPath = join(projectRoot, src);
  const destPath = join(projectRoot, dest);

  // Create destination directory if it doesn't exist
  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  copyFileSync(srcPath, destPath);
}

/**
 * Read file contents
 */
export function readFile(filepath) {
  return readFileSync(join(projectRoot, filepath), 'utf8');
}

/**
 * Write file contents
 */
export function writeFile(filepath, content) {
  const fullPath = join(projectRoot, filepath);
  const dir = dirname(fullPath);

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(fullPath, content, 'utf8');
}

/**
 * Load environment variables from .env.keys file
 */
export function loadEnvironmentKeys() {
  const keysFile = join(projectRoot, '.env.keys');

  if (!existsSync(keysFile)) {
    printWarning(
      '.env.keys file not found. Environment variables will remain encrypted.'
    );
    printWarning(
      'To decrypt them, create .env.keys file with the appropriate keys.'
    );
    return {};
  }

  try {
    const keysContent = readFileSync(keysFile, 'utf8');
    const keys = {};

    // Parse key=value pairs
    keysContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          keys[key.trim()] = valueParts.join('=').trim().replace(/['"]/g, '');
        }
      }
    });

    return keys;
  } catch (error) {
    printError(`Failed to load .env.keys: ${error.message}`);
    return {};
  }
}

/**
 * Set up environment for development or production
 */
export function setupEnvironment(mode = 'development') {
  printStatus(`Setting up ${mode} environment...`);

  const envFile = `.env.${mode}.local`;
  const targetEnv = '.env';

  // Check if local environment file exists
  if (!fileExists(envFile)) {
    printError(`Environment file ${envFile} not found!`);
    printStatus('Please create the environment file or decrypt it first:');
    printStatus(
      `  pnpm env:decrypt:${mode === 'development' ? 'dev' : 'prod'}`
    );
    process.exit(1);
  }

  // Copy environment file to .env
  copyFile(envFile, targetEnv);
  printStatus(`Copied ${envFile} to ${targetEnv}`);

  // Copy .env to each app directory so dotenvx can find it
  const appDirs = ['apps/api', 'apps/discord-bot'];
  appDirs.forEach(appDir => {
    if (fileExists(appDir)) {
      copyFile(targetEnv, `${appDir}/.env`);
      printStatus(`Copied .env to ${appDir}/`);
    }
  });

  // Load and set environment keys
  const keys = loadEnvironmentKeys();
  if (keys.DOTENV_PRIVATE_KEY_DEV && mode === 'development') {
    process.env.DOTENV_PRIVATE_KEY = keys.DOTENV_PRIVATE_KEY_DEV;
  } else if (keys.DOTENV_PRIVATE_KEY_PRODUCTION && mode === 'production') {
    process.env.DOTENV_PRIVATE_KEY = keys.DOTENV_PRIVATE_KEY_PRODUCTION;
  } else if (keys.DOTENV_PRIVATE_KEY) {
    process.env.DOTENV_PRIVATE_KEY = keys.DOTENV_PRIVATE_KEY;
  }

  printSuccess(`${mode} environment setup complete!`);
}

/**
 * Check if Docker is available
 */
export function checkDockerAvailable() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker Compose is available
 */
export function checkDockerComposeAvailable() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return true;
  } catch {
    // Try legacy docker-compose
    try {
      execSync('docker-compose --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get Docker Compose command (handles both 'docker compose' and 'docker-compose')
 */
export function getDockerComposeCommand() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    return 'docker compose';
  } catch {
    try {
      execSync('docker-compose --version', { stdio: 'ignore' });
      return 'docker-compose';
    } catch {
      throw new Error(
        'Docker Compose not found. Please install Docker Compose.'
      );
    }
  }
}

/**
 * Wait for a specified amount of time
 */
export function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * Check if a port is available
 */
export function isPortAvailable(port) {
  return new Promise(resolve => {
    const { createServer } = require('net');
    const server = createServer();

    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });

    server.on('error', () => resolve(false));
  });
}

/**
 * Get project root directory
 */
export function getProjectRoot() {
  return projectRoot;
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const parsed = {
    command: args[0] || 'help',
    flags: {},
    params: [],
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      parsed.flags[key] = value || true;
    } else if (arg.startsWith('-')) {
      parsed.flags[arg.substring(1)] = true;
    } else {
      parsed.params.push(arg);
    }
  }

  return parsed;
}

/**
 * Show help for a script
 */
export function showScriptHelp(scriptName, commands) {
  console.log(`${scriptName} - Cross-platform script utility`);
  console.log('');
  console.log(`Usage: node ${scriptName} [COMMAND] [OPTIONS]`);
  console.log('');
  console.log('Commands:');

  Object.entries(commands).forEach(([command, description]) => {
    console.log(`  ${command.padEnd(20)} ${description}`);
  });

  console.log('');
  console.log('Options:');
  console.log('  --help, -h          Show this help message');
  console.log('  --verbose, -v       Show verbose output');
  console.log('');
}

export default {
  colors,
  printStatus,
  printSuccess,
  printWarning,
  printError,
  executeCommand,
  executeCommandAsync,
  fileExists,
  copyFile,
  readFile,
  writeFile,
  loadEnvironmentKeys,
  setupEnvironment,
  checkDockerAvailable,
  checkDockerComposeAvailable,
  getDockerComposeCommand,
  sleep,
  isPortAvailable,
  getProjectRoot,
  parseArgs,
  showScriptHelp,
};
