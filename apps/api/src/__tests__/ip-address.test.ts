import type { Request } from 'express';
import { getClientIpAddress } from '../utils/ip-address.js';

describe('IP Address Extraction', () => {
  describe('Using Express req.ip (Trust Proxy Enabled)', () => {
    it('should use req.ip when available (most secure method)', () => {
      const mockReq = {
        ip: '192.168.1.100',
        headers: {},
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('192.168.1.100');
    });

    it('should handle IPv6 addresses from req.ip', () => {
      const mockReq = {
        ip: '::ffff:192.168.1.100',
        headers: {},
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('::ffff:192.168.1.100');
    });

    it('should prefer req.ip over X-Forwarded-For header', () => {
      const mockReq = {
        ip: '192.168.1.100',
        headers: {
          'x-forwarded-for': '203.0.113.195',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('192.168.1.100');
    });
  });

  describe('Fallback to X-Forwarded-For Header', () => {
    it('should extract IP from X-Forwarded-For when req.ip is not available', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '203.0.113.195',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });

    it('should handle X-Forwarded-For with multiple IPs', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 198.51.100.178',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });

    it('should trim whitespace from X-Forwarded-For IP', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': ' 203.0.113.195 , 198.51.100.178 ',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });

    it('should handle array format X-Forwarded-For header', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': ['203.0.113.195, 198.51.100.178'],
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });
  });

  describe('Fallback to X-Real-IP Header', () => {
    it('should extract IP from X-Real-IP when other methods fail', () => {
      const mockReq = {
        headers: {
          'x-real-ip': '203.0.113.195',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });

    it('should handle array format X-Real-IP header', () => {
      const mockReq = {
        headers: {
          'x-real-ip': ['203.0.113.195'],
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });
  });

  describe('Fallback to Socket Remote Address', () => {
    it('should extract IP from socket.remoteAddress when headers not available', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '192.168.1.100' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('192.168.1.100');
    });

    it('should handle IPv6 localhost and map to IPv4', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '::1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('127.0.0.1');
    });

    it('should handle IPv6-mapped localhost', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('127.0.0.1');
    });

    it('should remove IPv6 prefix from socket address', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '::ffff:192.168.1.100' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('192.168.1.100');
    });

    it('should handle raw IPv6 address from socket', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '2001:db8::1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('2001:db8::1');
    });
  });

  describe('Edge Cases', () => {
    it('should return "unknown" when no IP information is available', () => {
      const mockReq = {
        headers: {},
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('unknown');
    });

    it('should handle empty X-Forwarded-For header', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '',
        },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('unknown');
    });

    it('should handle null socket', () => {
      const mockReq = {
        headers: {},
        socket: null,
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('unknown');
    });

    it('should handle undefined remoteAddress', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: undefined },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('unknown');
    });
  });

  describe('Priority Order', () => {
    it('should prioritize req.ip > X-Forwarded-For > X-Real-IP > socket', () => {
      const mockReq = {
        ip: '192.168.1.100',
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'x-real-ip': '198.51.100.178',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('192.168.1.100');
    });

    it('should use X-Forwarded-For when req.ip is not set', () => {
      const mockReq = {
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'x-real-ip': '198.51.100.178',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('203.0.113.195');
    });

    it('should use X-Real-IP when req.ip and X-Forwarded-For are not set', () => {
      const mockReq = {
        headers: {
          'x-real-ip': '198.51.100.178',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('198.51.100.178');
    });

    it('should use socket address as last resort', () => {
      const mockReq = {
        headers: {},
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;

      const result = getClientIpAddress(mockReq);
      expect(result).toBe('10.0.0.1');
    });
  });
});

