// Determine the API base URL based on environment
export const getApiBaseUrl = () => {
  // If VITE_API_BASE_URL is explicitly set, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // In development, use the Vite proxy
  if (import.meta.env.DEV) {
    return 'http://localhost:3000'
  }

  // In production, determine based on the current origin
  // If we're running in the same origin (e.g., both served by same server), use relative path
  // Otherwise, construct the API URL based on the current host
  const currentOrigin = window.location.origin

  // Check if we're likely running in Docker/production environment
  // where API might be on a different port or subdomain
  if (
    currentOrigin.includes('localhost') ||
    currentOrigin.includes('127.0.0.1')
  ) {
    // Local development or local production - API is likely on port 3000
    return 'http://localhost:3000'
  }

  // For other environments, assume API is on the same origin
  return ''
}
