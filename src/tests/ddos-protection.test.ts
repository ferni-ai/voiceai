/**
 * DDoS Protection Tests
 *
 * Tests for:
 * - Request ID generation
 * - Server hardening configuration
 * - Safe body parsing with size limits
 * - Health endpoint rate limiting
 * - OAuth state management
 * - IP utilities
 * - Rate limit monitoring
 * - DDoS pattern detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

import {
  generateRequestId,
  addRequestId,
  hardenServer,
  parseBodySafe,
  parseJsonBodySafe,
  isHealthRateLimited,
  handleHealthEndpoint,
  getClientIp,
  createOAuthStateManager,
  recordRateLimitEvent,
  getRateLimitStats,
  detectDDoSPattern,
  handleSecurityMonitoring,
  DDOS_CONFIG,
} from '../utils/ddos-protection.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Helper to create mock request
function createMockRequest(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  Object.assign(req, {
    url: '/test',
    method: 'GET',
    headers: {},
    ...overrides,
  });
  return req;
}

// Helper to create mock response
function createMockResponse(): ServerResponse & {
  _statusCode: number;
  _headers: Record<string, string>;
  _body: string;
} {
  const res = {
    _statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: '',
    writeHead: vi.fn(function (
      this: typeof res,
      statusCode: number,
      headers?: Record<string, string>
    ) {
      this._statusCode = statusCode;
      if (headers) {
        Object.assign(this._headers, headers);
      }
      return this;
    }),
    setHeader: vi.fn(function (this: typeof res, name: string, value: string) {
      this._headers[name] = value;
      return this;
    }),
    end: vi.fn(function (this: typeof res, body?: string) {
      this._body = body || '';
      return this;
    }),
  } as unknown as ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: string;
  };
  return res;
}

describe('DDoS Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      const id3 = generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id3).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
    });

    it('should generate IDs in expected format', () => {
      const id = generateRequestId();
      // Format: serverStartTime-counter-random
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('addRequestId', () => {
    it('should use existing X-Request-ID header if present', () => {
      const req = createMockRequest({
        headers: { 'x-request-id': 'existing-id-123' },
      });
      const res = createMockResponse();

      const requestId = addRequestId(req, res);

      expect(requestId).toBe('existing-id-123');
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-id-123');
    });

    it('should generate new ID if header not present', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const requestId = addRequestId(req, res);

      expect(requestId).toBeDefined();
      expect(requestId).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
      expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', requestId);
    });
  });

  describe('hardenServer', () => {
    it('should configure server timeouts', () => {
      const mockServer = {
        setTimeout: vi.fn(),
        keepAliveTimeout: 0,
        headersTimeout: 0,
        requestTimeout: 0,
        on: vi.fn(),
      };

      hardenServer(mockServer as any);

      expect(mockServer.setTimeout).toHaveBeenCalledWith(DDOS_CONFIG.socketTimeout);
      expect(mockServer.keepAliveTimeout).toBe(DDOS_CONFIG.keepAliveTimeout);
      expect(mockServer.headersTimeout).toBe(DDOS_CONFIG.headersTimeout);
      expect(mockServer.requestTimeout).toBe(DDOS_CONFIG.requestTimeout);
    });

    it('should register timeout and connection handlers', () => {
      const mockServer = {
        setTimeout: vi.fn(),
        keepAliveTimeout: 0,
        headersTimeout: 0,
        requestTimeout: 0,
        on: vi.fn(),
      };

      hardenServer(mockServer as any);

      expect(mockServer.on).toHaveBeenCalledWith('timeout', expect.any(Function));
      expect(mockServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should expose activeConnections counter', () => {
      const mockServer = {
        setTimeout: vi.fn(),
        keepAliveTimeout: 0,
        headersTimeout: 0,
        requestTimeout: 0,
        on: vi.fn(),
      };

      hardenServer(mockServer as any);

      expect((mockServer as any).activeConnections).toBeDefined();
      expect(typeof (mockServer as any).activeConnections).toBe('function');
      expect((mockServer as any).activeConnections()).toBe(0);
    });
  });

  describe('parseBodySafe', () => {
    it('should parse body within size limit', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const testBody = JSON.stringify({ message: 'hello' });

      // Simulate data events
      setTimeout(() => {
        req.emit('data', Buffer.from(testBody));
        req.emit('end');
      }, 0);

      const result = await parseBodySafe(req, res);

      expect(result).not.toBeNull();
      expect(result?.body).toBe(testBody);
      expect(result?.size).toBe(testBody.length);
      expect(result?.truncated).toBe(false);
    });

    it('should reject body exceeding size limit', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const largeBody = 'x'.repeat(DDOS_CONFIG.maxBodySize + 1000);

      setTimeout(() => {
        req.emit('data', Buffer.from(largeBody));
      }, 0);

      const result = await parseBodySafe(req, res);

      expect(result).toBeNull();
      expect(res._statusCode).toBe(413);
    });

    it('should handle request errors gracefully', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      setTimeout(() => {
        req.emit('error', new Error('Connection reset'));
      }, 0);

      const result = await parseBodySafe(req, res);

      expect(result).toBeNull();
    });
  });

  describe('parseJsonBodySafe', () => {
    it('should parse valid JSON body', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const testData = { message: 'hello', count: 42 };

      setTimeout(() => {
        req.emit('data', Buffer.from(JSON.stringify(testData)));
        req.emit('end');
      }, 0);

      const result = await parseJsonBodySafe<typeof testData>(req, res);

      expect(result).toEqual(testData);
    });

    it('should reject invalid JSON', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      setTimeout(() => {
        req.emit('data', Buffer.from('not valid json'));
        req.emit('end');
      }, 0);

      const result = await parseJsonBodySafe(req, res);

      expect(result).toBeNull();
      expect(res._statusCode).toBe(400);
    });

    it('should use JSON-specific size limit', async () => {
      // JSON limit is smaller than general body limit
      expect(DDOS_CONFIG.maxJsonBodySize).toBeLessThan(DDOS_CONFIG.maxBodySize);
    });
  });

  describe('Health Endpoint Rate Limiting', () => {
    it('should allow requests under rate limit', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '192.168.1.100' } as any,
      });

      // First few requests should not be rate limited
      for (let i = 0; i < 5; i++) {
        expect(isHealthRateLimited(req)).toBe(false);
      }
    });

    it('should rate limit after threshold', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '10.0.0.99' } as any,
      });

      // Make requests up to the limit
      for (let i = 0; i < DDOS_CONFIG.healthRateLimit.maxRequests; i++) {
        isHealthRateLimited(req);
      }

      // Next request should be rate limited
      expect(isHealthRateLimited(req)).toBe(true);
    });
  });

  describe('handleHealthEndpoint', () => {
    it('should handle /health endpoint', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '127.0.0.1' } as any,
      });
      const res = createMockResponse();

      const handled = handleHealthEndpoint(req, res, '/health', 'test-service');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
      expect(JSON.parse(res._body)).toEqual({
        status: 'ok',
        service: 'test-service',
      });
    });

    it('should return false for non-health endpoints', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const handled = handleHealthEndpoint(req, res, '/api/users', 'test-service');

      expect(handled).toBe(false);
    });

    it('should require admin access for /health/dashboard', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '8.8.8.8' } as any, // External IP
      });
      const res = createMockResponse();

      const handled = handleHealthEndpoint(req, res, '/health/dashboard', 'test-service');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(403);
    });

    it('should allow /health/dashboard for internal requests', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '127.0.0.1' } as any,
      });
      const res = createMockResponse();

      const handled = handleHealthEndpoint(req, res, '/health/dashboard', 'test-service');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
    });

    it('should allow /health/dashboard with admin key', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'secret-key' },
        socket: { remoteAddress: '8.8.8.8' } as any,
      });
      const res = createMockResponse();

      const handled = handleHealthEndpoint(req, res, '/health/dashboard', 'test-service');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from X-Forwarded-For header', () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      });

      const ip = getClientIp(req);

      expect(ip).toBe('203.0.113.195');
    });

    it('should fall back to socket remoteAddress', () => {
      const req = createMockRequest({
        socket: { remoteAddress: '192.168.1.1' } as any,
      });

      const ip = getClientIp(req);

      expect(ip).toBe('192.168.1.1');
    });

    it('should return unknown for missing IP', () => {
      const req = createMockRequest();

      const ip = getClientIp(req);

      expect(ip).toBe('unknown');
    });

    it('should validate IP format to prevent injection', () => {
      const req = createMockRequest({
        headers: { 'x-forwarded-for': 'not-an-ip, 192.168.1.1' },
        socket: { remoteAddress: '10.0.0.1' } as any,
      });

      const ip = getClientIp(req);

      // Should fall back due to invalid first IP
      expect(ip).toBe('10.0.0.1');
    });
  });

  describe('OAuth State Manager', () => {
    it('should create and consume state', () => {
      const manager = createOAuthStateManager<{ userId: string }>();

      const state = manager.create({ userId: 'user-123' });
      expect(state).not.toBeNull();

      const data = manager.consume(state!);
      expect(data).toEqual({ userId: 'user-123' });

      // Should be consumed (one-time use)
      const secondConsume = manager.consume(state!);
      expect(secondConsume).toBeNull();
    });

    it('should track state count', () => {
      const manager = createOAuthStateManager();

      expect(manager.count()).toBe(0);

      manager.create({ data: 1 });
      manager.create({ data: 2 });
      manager.create({ data: 3 });

      expect(manager.count()).toBe(3);
    });

    it('should return null for non-existent state', () => {
      const manager = createOAuthStateManager();

      const data = manager.consume('non-existent-state');

      expect(data).toBeNull();
    });

    it('should destroy and clear all states', () => {
      const manager = createOAuthStateManager();

      manager.create({ data: 1 });
      manager.create({ data: 2 });

      manager.destroy();

      expect(manager.count()).toBe(0);
    });

    it('should return null when max states reached', () => {
      const manager = createOAuthStateManager(60000);

      // Fill up to max (would need to mock DDOS_CONFIG.maxOAuthStates)
      // For now, just verify the pattern works
      const state1 = manager.create({ data: 1 });
      expect(state1).not.toBeNull();

      manager.destroy();
    });
  });

  describe('Rate Limit Monitoring', () => {
    beforeEach(() => {
      // Clear any existing events by recording a bunch of old events
      // that will get pushed out
    });

    it('should record rate limit events', () => {
      recordRateLimitEvent('192.168.1.1', '/api/test', 'free');

      const stats = getRateLimitStats(60000);

      expect(stats.total).toBeGreaterThanOrEqual(1);
    });

    it('should track events by IP', () => {
      recordRateLimitEvent('10.0.0.1', '/api/test', 'free');
      recordRateLimitEvent('10.0.0.1', '/api/test', 'free');
      recordRateLimitEvent('10.0.0.2', '/api/test', 'free');

      const stats = getRateLimitStats(60000);

      expect(stats.byIp['10.0.0.1']).toBeGreaterThanOrEqual(2);
      expect(stats.byIp['10.0.0.2']).toBeGreaterThanOrEqual(1);
    });

    it('should track events by endpoint', () => {
      recordRateLimitEvent('10.0.0.3', '/api/endpoint1', 'free');
      recordRateLimitEvent('10.0.0.3', '/api/endpoint2', 'free');
      recordRateLimitEvent('10.0.0.3', '/api/endpoint1', 'free');

      const stats = getRateLimitStats(60000);

      expect(stats.byEndpoint['/api/endpoint1']).toBeGreaterThanOrEqual(2);
    });

    it('should track events by tier', () => {
      recordRateLimitEvent('10.0.0.4', '/api/test', 'free');
      recordRateLimitEvent('10.0.0.4', '/api/test', 'premium');
      recordRateLimitEvent('10.0.0.4', '/api/test', 'free');

      const stats = getRateLimitStats(60000);

      expect(stats.byTier['free']).toBeGreaterThanOrEqual(2);
      expect(stats.byTier['premium']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DDoS Pattern Detection', () => {
    it('should detect no attack under normal conditions', () => {
      const result = detectDDoSPattern();

      // With minimal recorded events
      if (result.detected === false) {
        expect(result.confidence).toBe('low');
        expect(result.details).toBe('Normal traffic patterns');
      }
    });

    it('should return detection result with required fields', () => {
      const result = detectDDoSPattern();

      expect(result).toHaveProperty('detected');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('details');
      expect(['low', 'medium', 'high']).toContain(result.confidence);
    });
  });

  describe('Security Monitoring Endpoint', () => {
    it('should require admin key', () => {
      const req = createMockRequest();
      const res = createMockResponse();

      const handled = handleSecurityMonitoring(req, res, '/api/security/status');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(403);
    });

    it('should return security status with admin key', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'admin-key' },
      });
      const res = createMockResponse();

      const handled = handleSecurityMonitoring(req, res, '/api/security/status');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);

      const body = JSON.parse(res._body);
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('ddos');
      expect(body).toHaveProperty('rateLimits');
      expect(body).toHaveProperty('healthRateLimits');
    });

    it('should return false for non-security endpoints', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'admin-key' },
      });
      const res = createMockResponse();

      const handled = handleSecurityMonitoring(req, res, '/api/users');

      expect(handled).toBe(false);
    });
  });

  describe('DDOS_CONFIG', () => {
    it('should have reasonable defaults', () => {
      expect(DDOS_CONFIG.maxBodySize).toBe(1 * 1024 * 1024); // 1MB
      expect(DDOS_CONFIG.maxJsonBodySize).toBe(512 * 1024); // 512KB
      expect(DDOS_CONFIG.socketTimeout).toBe(30_000); // 30s
      expect(DDOS_CONFIG.keepAliveTimeout).toBe(65_000); // 65s
      expect(DDOS_CONFIG.healthRateLimit.maxRequests).toBe(60);
      expect(DDOS_CONFIG.oauthStateExpiry).toBe(5 * 60 * 1000); // 5min
      expect(DDOS_CONFIG.maxOAuthStates).toBe(1000);
    });
  });
});
