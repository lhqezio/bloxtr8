import type { Request } from 'express';

/**
 * Extract client IP address from Express request
 * Uses Express's trust proxy settings to prevent IP spoofing
 * Handles proxies, load balancers, and direct connections
 *
 * @param req - Express request object
 * @returns Client IP address as a string, or 'unknown' if unable to determine
 */
export function getClientIpAddress(req: Request): string {
  // Primary method: use Express's req.ip, which respects trust proxy settings
  // This is the most secure method as it validates the proxy chain
  if (req.ip) {
    return req.ip;
  }

  // Fallback: check X-Forwarded-For header (only safe when behind a trusted proxy)
  // Note: This fallback is for backward compatibility and edge cases
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
    // The first IP is the original client IP
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    if (ips && typeof ips === 'string') {
      const parts = ips.split(',');
      const clientIp = parts[0];
      if (clientIp) {
        return clientIp.trim();
      }
    }
  }

  // Fallback: check X-Real-IP header (nginx and other proxies)
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    const ip = Array.isArray(realIp) ? realIp[0] : realIp;
    if (ip) {
      return ip;
    }
  }

  // Last resort: socket remote address
  const socketAddress = req.socket?.remoteAddress;
  if (socketAddress) {
    // Handle IPv6 localhost mapping
    if (socketAddress === '::1' || socketAddress === '::ffff:127.0.0.1') {
      return '127.0.0.1';
    }
    // Remove IPv6 prefix if present
    return socketAddress.replace(/^::ffff:/, '');
  }

  return 'unknown';
}
