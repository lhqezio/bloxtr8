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
    if (!process.env[varName]) {
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
  if (!value && defaultValue === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value || defaultValue!;
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
