/**
 * Debug mode utilities for Discord bot
 */

/**
 * Check if we're in development mode
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
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
