/**
 * Gets the base URL for the web app based on environment
 */
export function getWebAppBaseUrl(): string {
  // Use environment variable if set, otherwise determine based on NODE_ENV
  if (process.env.WEB_APP_BASE_URL) {
    return process.env.WEB_APP_BASE_URL;
  }

  // Default to localhost for development, production domain for production
  return process.env.NODE_ENV === 'production'
    ? 'https://web.bloxtr8.com'
    : 'http://localhost:5173';
}
