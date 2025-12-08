/**
 * Auth Middleware Tests
 *
 * Tests for API authentication, authorization, and rate limiting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { createHmac } from 'crypto';

// Mock environment before importing module
const originalEnv = { ...process.env };

describe('Auth Middleware', () => {
  // Helper to create mock request
  function createMockRequest(options: {
    headers?: Record<string, string>;
    url?: string;
    method?: string;
    remoteAddress?: string;
  }): IncomingMessage {
    return {
      headers: options.headers || {},
      url: options.url || '/api/test',
      method: options.method || 'GET',
      socket: { remoteAddress: options.remoteAddress || '127.0.0.1' },
    } as unknown as IncomingMessage;
  }

  // Helper to create mock response
  function createMockResponse(): ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string | number>;
    _body: string;
  } {
    const res = {
      _statusCode: 200,
      _headers: {} as Record<string, string | number>,
      _body: '',
      writeHead(statusCode: number, headers?: Record<string, string>) {
        this._statusCode = statusCode;
        if (headers) {
          Object.assign(this._headers, headers);
        }
        return this;
      },
      setHeader(name: string, value: string | number) {
        this._headers[name] = value;
        return this;
      },
      end(body?: string) {
        if (body) this._body = body;
        return this;
      },
    };
    return res as unknown as ServerResponse & typeof res;
  }

  // Helper to create valid JWT
  function createJWT(
    payload: { sub: string; admin?: boolean; exp?: number },
    secret: string
  ): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${header}.${payloadB64}`)
      .digest('base64url');
    return `${header}.${payloadB64}.${signature}`;
  }

  describe('authenticate', () => {
    beforeEach(() => {
      // Reset env
      process.env.API_KEYS = 'test-api-key-1,test-api-key-2';
      process.env.ADMIN_API_KEYS = 'admin-key-1';
      process.env.JWT_SECRET = 'test-jwt-secret-256-bits-long!!';
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should authenticate with valid API key', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'test-api-key-1' },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.authMethod).toBe('api_key');
      expect(auth?.isAdmin).toBe(false);
    });

    it('should authenticate with admin API key', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'admin-key-1' },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.authMethod).toBe('api_key');
      expect(auth?.isAdmin).toBe(true);
      expect(auth?.userId).toBe('system');
    });

    it('should reject invalid API key', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'invalid-key' },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should authenticate with valid JWT', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const token = createJWT(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 },
        'test-jwt-secret-256-bits-long!!'
      );
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.authMethod).toBe('jwt');
      expect(auth?.userId).toBe('user-123');
    });

    it('should reject expired JWT', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const token = createJWT(
        { sub: 'user-123', exp: Math.floor(Date.now() / 1000) - 3600 }, // Expired
        'test-jwt-secret-256-bits-long!!'
      );
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should reject JWT with invalid signature', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const token = createJWT({ sub: 'user-123' }, 'wrong-secret-key-that-is-long!!');
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should authenticate with X-User-Id in dev mode', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-user-id': 'dev-user-456' },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.authMethod).toBe('user_id');
      expect(auth?.userId).toBe('dev-user-456');
      expect(auth?.isDevMode).toBe(true);
    });

    it('should authenticate with dev mode query param', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        url: '/api/test?admin_key=dev-mode&userId=query-user',
        headers: { host: 'localhost:3000' },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.authMethod).toBe('dev_mode');
      expect(auth?.userId).toBe('query-user');
      expect(auth?.isAdmin).toBe(true);
      expect(auth?.isDevMode).toBe(true);
    });

    it('should use X-User-Id with API key', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: {
          'x-api-key': 'test-api-key-1',
          'x-user-id': 'custom-user-789',
        },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.userId).toBe('custom-user-789');
    });
  });

  describe('requireAuth', () => {
    beforeEach(() => {
      process.env.API_KEYS = 'test-key';
      process.env.ADMIN_API_KEYS = 'admin-key';
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should return auth context for valid request', async () => {
      const { requireAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'test-key' },
      });
      const res = createMockResponse();

      const auth = requireAuth(req, res);

      expect(auth).not.toBeNull();
      expect(res._statusCode).toBe(200);
    });

    it('should send 401 for unauthenticated request', async () => {
      const { requireAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({});
      const res = createMockResponse();

      const auth = requireAuth(req, res);

      expect(auth).toBeNull();
      expect(res._statusCode).toBe(401);
    });

    it('should return null without error for optional auth', async () => {
      const { requireAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({});
      const res = createMockResponse();

      const auth = requireAuth(req, res, { optional: true });

      expect(auth).toBeNull();
      expect(res._statusCode).toBe(200); // No error sent
    });

    it('should send 403 when admin required but not admin', async () => {
      const { requireAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'test-key' }, // Non-admin key
      });
      const res = createMockResponse();

      const auth = requireAuth(req, res, { requireAdmin: true });

      expect(auth).toBeNull();
      expect(res._statusCode).toBe(403);
    });

    it('should allow admin when admin required', async () => {
      const { requireAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'admin-key' },
      });
      const res = createMockResponse();

      const auth = requireAuth(req, res, { requireAdmin: true });

      expect(auth).not.toBeNull();
      expect(auth?.isAdmin).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should allow requests within limit', async () => {
      const { checkRateLimit } = await import('../api/auth-middleware.js');

      const result = checkRateLimit('test-key-1', 10, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should track request count', async () => {
      const { checkRateLimit } = await import('../api/auth-middleware.js');
      const key = `test-key-count-${Date.now()}`;

      checkRateLimit(key, 10, 60000);
      checkRateLimit(key, 10, 60000);
      const result = checkRateLimit(key, 10, 60000);

      expect(result.remaining).toBe(7);
    });

    it('should block when limit exceeded', async () => {
      const { checkRateLimit } = await import('../api/auth-middleware.js');
      const key = `test-key-block-${Date.now()}`;

      // Exhaust the limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit(key, 5, 60000);
      }

      const result = checkRateLimit(key, 5, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should set rate limit headers on response', async () => {
      const { rateLimit } = await import('../api/auth-middleware.js');
      const req = createMockRequest({ remoteAddress: `192.168.1.${Date.now()}` });
      const res = createMockResponse();

      rateLimit(req, res, { maxRequests: 100, windowMs: 60000 });

      expect(res._headers['X-RateLimit-Limit']).toBe(100);
      expect(res._headers['X-RateLimit-Remaining']).toBeDefined();
      expect(res._headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should return 429 when rate limited', async () => {
      const { rateLimit } = await import('../api/auth-middleware.js');
      const ip = `10.0.0.${Date.now()}`;

      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        const req = createMockRequest({ remoteAddress: ip });
        const res = createMockResponse();
        rateLimit(req, res, { maxRequests: 3, windowMs: 60000 });
      }

      // Next request should be blocked
      const req = createMockRequest({ remoteAddress: ip });
      const res = createMockResponse();
      const blocked = rateLimit(req, res, { maxRequests: 3, windowMs: 60000 });

      expect(blocked).toBe(true);
      expect(res._statusCode).toBe(429);
      expect(res._headers['Retry-After']).toBeDefined();
    });
  });

  describe('Rate Limit Tiers', () => {
    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should have correct tier limits', async () => {
      const { RATE_LIMIT_TIERS } = await import('../api/auth-middleware.js');

      expect(RATE_LIMIT_TIERS.anonymous.maxRequests).toBe(20);
      expect(RATE_LIMIT_TIERS.free.maxRequests).toBe(60);
      expect(RATE_LIMIT_TIERS.friend.maxRequests).toBe(200);
      expect(RATE_LIMIT_TIERS.partner.maxRequests).toBe(500);
      expect(RATE_LIMIT_TIERS.admin.maxRequests).toBe(1000);
      expect(RATE_LIMIT_TIERS.expensive.maxRequests).toBe(10);
    });

    it('should get correct tier for auth context', async () => {
      const { getRateLimitTier, RATE_LIMIT_TIERS } = await import('../api/auth-middleware.js');

      expect(getRateLimitTier(null)).toBe(RATE_LIMIT_TIERS.anonymous);
      expect(
        getRateLimitTier({ userId: 'user', isAdmin: false, isDevMode: false, authMethod: 'jwt' })
      ).toBe(RATE_LIMIT_TIERS.free);
      expect(
        getRateLimitTier({
          userId: 'admin',
          isAdmin: true,
          isDevMode: false,
          authMethod: 'api_key',
        })
      ).toBe(RATE_LIMIT_TIERS.admin);
      expect(
        getRateLimitTier({ userId: 'dev', isAdmin: false, isDevMode: true, authMethod: 'dev_mode' })
      ).toBe(RATE_LIMIT_TIERS.admin);
    });
  });

  describe('JWT Verification Edge Cases', () => {
    beforeEach(() => {
      process.env.JWT_SECRET = 'test-secret-for-jwt-verification!';
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should reject malformed JWT (not 3 parts)', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid.token' },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should reject JWT with unsupported algorithm', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      // Create JWT with RS256 header
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
        'base64url'
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'user' })).toString('base64url');
      const token = `${header}.${payload}.fake-signature`;
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should reject JWT without sub claim', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url'
      );
      const payload = Buffer.from(JSON.stringify({ name: 'test' })).toString('base64url'); // No sub
      const signature = createHmac('sha256', 'test-secret-for-jwt-verification!')
        .update(`${header}.${payload}`)
        .digest('base64url');
      const token = `${header}.${payload}.${signature}`;
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).toBeNull();
    });

    it('should extract admin claim from JWT', async () => {
      const { authenticate } = await import('../api/auth-middleware.js');
      const token = createJWT(
        { sub: 'admin-user', admin: true, exp: Math.floor(Date.now() / 1000) + 3600 },
        'test-secret-for-jwt-verification!'
      );
      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
      expect(auth?.isAdmin).toBe(true);
    });
  });

  describe('Helper Functions', () => {
    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should get authenticated user ID', async () => {
      process.env.API_KEYS = 'test-key';
      const { getAuthenticatedUserId } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'test-key', 'x-user-id': 'user-abc' },
      });
      const res = createMockResponse();

      const userId = getAuthenticatedUserId(req, res);

      expect(userId).toBe('user-abc');
    });

    it('should return null and send 401 for unauthenticated getAuthenticatedUserId', async () => {
      const { getAuthenticatedUserId } = await import('../api/auth-middleware.js');
      const req = createMockRequest({});
      const res = createMockResponse();

      const userId = getAuthenticatedUserId(req, res);

      expect(userId).toBeNull();
      expect(res._statusCode).toBe(401);
    });

    it('should handle optionalAuth without sending error', async () => {
      const { optionalAuth } = await import('../api/auth-middleware.js');
      const req = createMockRequest({});

      const auth = optionalAuth(req);

      expect(auth).toBeNull();
      // No response object needed - should not throw
    });

    it('should handle array headers', async () => {
      process.env.API_KEYS = 'test-key';
      const { authenticate } = await import('../api/auth-middleware.js');
      const req = {
        headers: { 'x-api-key': ['test-key', 'other-key'] },
        url: '/api/test',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as IncomingMessage;

      const auth = authenticate(req);

      expect(auth).not.toBeNull();
    });
  });

  describe('requireAdmin', () => {
    beforeEach(() => {
      process.env.ADMIN_API_KEYS = 'admin-key';
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.resetModules();
    });

    it('should be shorthand for requireAuth with requireAdmin: true', async () => {
      const { requireAdmin } = await import('../api/auth-middleware.js');
      const req = createMockRequest({
        headers: { 'x-api-key': 'admin-key' },
      });
      const res = createMockResponse();

      const auth = requireAdmin(req, res);

      expect(auth).not.toBeNull();
      expect(auth?.isAdmin).toBe(true);
    });
  });
});
