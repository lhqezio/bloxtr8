// Environment variable validation
// This should be called at application startup

interface RequiredEnvVars {
  // Database
  DATABASE_URL?: string;
  DATABASE_URL_PRISMA?: string;

  // Discord
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;

  // Roblox (optional - only needed for asset verification)
  ROBLOX_CLIENT_ID?: string;
  ROBLOX_CLIENT_SECRET?: string;

  // Application
  NODE_ENV?: string;
  PORT?: string;
}

/**
 * Validates that critical environment variables are set
 * @throws {Error} if required variables are missing
 */
export function validateEnvironment(): void {
  const required: (keyof RequiredEnvVars)[] = [
    'DATABASE_URL',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
  ];

  const missing: string[] = [];

  for (const varName of required) {
    const value = process.env[varName];
    // Check if value is undefined (not set) or empty string
    if (value === undefined || value === '') {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file or environment configuration.'
    );
  }

  // Validate database URL format
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.startsWith('postgresql://')
  ) {
    console.warn('⚠️  DATABASE_URL should start with "postgresql://"');
  }

  console.log('✅ Environment variables validated successfully');
}

/**
 * Get environment variable with type safety and optional default
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  // Check if value is undefined (not set) vs empty string
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  // Return the actual value if it exists (including empty strings), otherwise return default
  return value !== undefined ? value : defaultValue!;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if we're in test mode
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if debug mode is enabled
 * Debug mode only works in development environment for safety
 */
export function isDebugMode(): boolean {
  const debugEnabled = process.env.DEBUG_MODE === 'true';
  const inDevelopment = isDevelopment();

  if (debugEnabled && !inDevelopment) {
    console.warn(
      '⚠️  DEBUG_MODE is enabled but NODE_ENV is not development. Debug mode will be disabled for safety.'
    );
    return false;
  }

  if (debugEnabled && inDevelopment) {
    console.warn(
      '🔧 DEBUG MODE is active - some validations and restrictions are disabled'
    );
  }

  return debugEnabled && inDevelopment;
}
