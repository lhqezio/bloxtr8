// Re-export from shared package
// This file is kept for backward compatibility with existing imports
export * from '@bloxtr8/shared';

import { validateEnvironment as sharedValidateEnvironment } from '@bloxtr8/shared';

// Escrow-specific environment validation
// Override validateEnvironment to include escrow-specific required variables
export function validateEnvironment(): void {
  // Call the shared function with escrow-specific requirements
  sharedValidateEnvironment([
    'DATABASE_URL', 
    'STRIPE_SECRET_KEY'
  ]);
}
