// Re-export from shared package
// This file is kept for backward compatibility with existing imports
export * from '@bloxtr8/shared';

import { validateEnvironment as sharedValidateEnvironment } from '@bloxtr8/shared';

// API-specific environment validation
// Override validateEnvironment to include API-specific required variables
export function validateEnvironment(): void {
  // Call the shared function with API-specific requirements
  sharedValidateEnvironment(['DATABASE_URL', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET']);
}
