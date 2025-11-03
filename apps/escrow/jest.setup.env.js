// Jest setup file to load environment variables before tests run
const { config } = require('@dotenvx/dotenvx');

// Load environment variables from .env file
// In CI/CD or when DOTENV_PRIVATE_KEY is missing/empty, dotenvx will log warnings
// but won't fail. We suppress these warnings since tests use mocked values anyway.
const originalError = console.error;
try {
  // Suppress console.error during config to avoid noise from missing private key warnings
  console.error = (...args) => {
    // Capture dotenvx decryption warnings but don't print them
    const message = args.join(' ');
    if (
      message.includes('[MISSING_PRIVATE_KEY]') ||
      message.includes('could not decrypt') ||
      message.includes('dotenvx/issues/464')
    ) {
      // Silently ignore missing private key warnings - tests use mocks anyway
      return;
    }
    // Forward other errors
    originalError.apply(console, args);
  };

  config({
    debug: false,
  });
} catch (error) {
  // If config fails completely, continue anyway - tests may not need these vars
  // Tests typically use mocked environment variables anyway
} finally {
  // Always restore console.error
  console.error = originalError;
}
