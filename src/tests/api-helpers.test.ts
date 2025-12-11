/**
 * API Helpers Tests
 *
 * Tests for shared API helper functions:
 * - parseBody
 * - getUserId / requireUserId
 * - sendJSON / sendJSONCached / sendError
 * - handleCorsPreflightIfNeeded
 * - parsePositiveInt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  parseBody,
  getUserId,
  requireUserId,
  sendJSON,
  sendJSONCached,
  sendError,
  handleCorsPreflightIfNeeded,
  parsePositiveInt,
  getCorsHeaders,
} from '../api/helpers.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock IncomingMessage with configurable body streaming
 */
function createMockRequest(options: {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  url?: string;
}): IncomingMessage {
  const { method = 'GET', headers = {}, body = '', url = '/' } = options;

  const req = {
    method,
    headers: { ...headers },
    url,
    on: vi.fn((event: string, callback: (chunk?: unknown) => void) => {
      if (event === 'data' && body) {
        setTimeout(() => callback(Buffer.from(body)), 0);
      }
      if (event === 'end') {
        setTimeout(() => callback(), 1);
      }
      return req;
    }),
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;

  return req;
}

/**
 * Create a mock ServerResponse for testing
 */
function createMockResponse(): {
  res: ServerResponse;
  getWrittenData: () => { status?: number; headers?: Record<string, string>; body?: string };
} {
  let status: number | undefined;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: vi.fn((s: number, h?: Record<string, string>) => {
      status = s;
      if (h) headers = { ...headers, ...h };
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) body = data;
    }),
  } as unknown as ServerResponse;

  return {
    res,
    getWrittenData: () => ({ status, headers, body }),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('API Helpers', () => {
  // ============================================================================
  // parseBody
  // ============================================================================

  describe('parseBody', () => {
    it('should parse valid JSON body', async () => {
      const req = createMockRequest({
        body: JSON.stringify({ name: 'test', value: 123 }),
      });

      const result = await parseBody<{ name: string; value: number }>(req);

      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should return empty object for empty body', async () => {
      const req = createMockRequest({ body: '' });

      const result = await parseBody(req);

      expect(result).toEqual({});
    });

    it('should throw on invalid JSON', async () => {
      const req = createMockRequest({ body: 'not valid json' });

      await expect(parseBody(req)).rejects.toThrow('Invalid JSON body');
    });
  });

  // ============================================================================
  // getUserId
  // ============================================================================

  describe('getUserId', () => {
    it('should get userId from query params', () => {
      const req = createMockRequest({});
      const url = new URL('http://localhost/api/test?userId=user-123');

      const result = getUserId(req, url);

      expect(result).toBe('user-123');
    });

    it('should get userId from X-User-Id header', () => {
      const req = createMockRequest({
        headers: { 'x-user-id': 'header-user-456' },
      });
      const url = new URL('http://localhost/api/test');

      const result = getUserId(req, url);

      expect(result).toBe('header-user-456');
    });

    it('should prefer query param over header', () => {
      const req = createMockRequest({
        headers: { 'x-user-id': 'header-user' },
      });
      const url = new URL('http://localhost/api/test?userId=query-user');

      const result = getUserId(req, url);

      expect(result).toBe('query-user');
    });

    it('should return null if no userId provided', () => {
      const req = createMockRequest({});
      const url = new URL('http://localhost/api/test');

      const result = getUserId(req, url);

      expect(result).toBeNull();
    });

    it('should return null for empty header', () => {
      const req = createMockRequest({
        headers: { 'x-user-id': '' },
      });
      const url = new URL('http://localhost/api/test');

      const result = getUserId(req, url);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // requireUserId
  // ============================================================================

  describe('requireUserId', () => {
    it('should return userId when present', () => {
      const req = createMockRequest({});
      const { res } = createMockResponse();
      const url = new URL('http://localhost/api/test?userId=user-123');

      const result = requireUserId(req, res, url);

      expect(result).toBe('user-123');
    });

    it('should send 401 and return null when userId missing', () => {
      const req = createMockRequest({});
      const { res, getWrittenData } = createMockResponse();
      const url = new URL('http://localhost/api/test');

      const result = requireUserId(req, res, url);

      expect(result).toBeNull();
      expect(getWrittenData().status).toBe(401);
      const body = JSON.parse(getWrittenData().body || '{}');
      expect(body.error).toBeDefined();
    });
  });

  // ============================================================================
  // sendJSON
  // ============================================================================

  describe('sendJSON', () => {
    it('should send JSON response with default 200 status', () => {
      const { res, getWrittenData } = createMockResponse();
      const data = { success: true, value: 42 };

      sendJSON(res, data);

      const written = getWrittenData();
      expect(written.status).toBe(200);
      expect(written.headers?.['Content-Type']).toBe('application/json');
      // Security headers include no-store, no-cache, must-revalidate to prevent caching sensitive API data
      expect(written.headers?.['Cache-Control']).toBe('no-store, no-cache, must-revalidate');
      expect(JSON.parse(written.body || '{}')).toEqual(data);
    });

    it('should send JSON response with custom status', () => {
      const { res, getWrittenData } = createMockResponse();

      sendJSON(res, { created: true }, 201);

      expect(getWrittenData().status).toBe(201);
    });

    it('should include CORS headers', () => {
      const { res, getWrittenData } = createMockResponse();

      sendJSON(res, {});

      const headers = getWrittenData().headers || {};
      expect(headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    });
  });

  // ============================================================================
  // sendJSONCached
  // ============================================================================

  describe('sendJSONCached', () => {
    it('should send cached JSON response with default max-age', () => {
      const { res, getWrittenData } = createMockResponse();

      sendJSONCached(res, { cached: true });

      const headers = getWrittenData().headers || {};
      expect(headers['Cache-Control']).toBe('private, max-age=60');
    });

    it('should send cached JSON with custom max-age', () => {
      const { res, getWrittenData } = createMockResponse();

      sendJSONCached(res, { cached: true }, 300);

      const headers = getWrittenData().headers || {};
      expect(headers['Cache-Control']).toBe('private, max-age=300');
    });

    it('should support custom status code', () => {
      const { res, getWrittenData } = createMockResponse();

      sendJSONCached(res, { cached: true }, 60, 201);

      expect(getWrittenData().status).toBe(201);
    });
  });

  // ============================================================================
  // sendError
  // ============================================================================

  describe('sendError', () => {
    it('should send error response with default 500 status', () => {
      const { res, getWrittenData } = createMockResponse();

      sendError(res, 'Something went wrong');

      const written = getWrittenData();
      expect(written.status).toBe(500);
      // In production mode, 500+ errors are sanitized to "Internal server error" for security
      // In dev mode, the original message is shown
      const body = JSON.parse(written.body || '{}');
      expect(['Something went wrong', 'Internal server error']).toContain(body.error);
    });

    it('should send error with custom status', () => {
      const { res, getWrittenData } = createMockResponse();

      sendError(res, 'Not found', 404);

      expect(getWrittenData().status).toBe(404);
    });

    it('should include CORS headers in error response', () => {
      const { res, getWrittenData } = createMockResponse();

      sendError(res, 'Error');

      expect(getWrittenData().headers?.['Access-Control-Allow-Origin']).toBeDefined();
    });
  });

  // ============================================================================
  // handleCorsPreflightIfNeeded
  // ============================================================================

  describe('handleCorsPreflightIfNeeded', () => {
    it('should handle OPTIONS request and return true', () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const { res, getWrittenData } = createMockResponse();

      const result = handleCorsPreflightIfNeeded(req, res);

      expect(result).toBe(true);
      expect(getWrittenData().status).toBe(204);
    });

    it('should return false for non-OPTIONS requests', () => {
      const req = createMockRequest({ method: 'GET' });
      const { res, getWrittenData } = createMockResponse();

      const result = handleCorsPreflightIfNeeded(req, res);

      expect(result).toBe(false);
      expect(getWrittenData().status).toBeUndefined();
    });

    it('should include CORS headers in preflight response', () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const { res, getWrittenData } = createMockResponse();

      handleCorsPreflightIfNeeded(req, res);

      const headers = getWrittenData().headers || {};
      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
    });
  });

  // ============================================================================
  // parsePositiveInt
  // ============================================================================

  describe('parsePositiveInt', () => {
    it('should return default for null value', () => {
      expect(parsePositiveInt(null, 50)).toBe(50);
    });

    it('should return default for empty string', () => {
      expect(parsePositiveInt('', 50)).toBe(50);
    });

    it('should parse valid positive integer', () => {
      expect(parsePositiveInt('42', 50)).toBe(42);
    });

    it('should return default for zero', () => {
      expect(parsePositiveInt('0', 50)).toBe(50);
    });

    it('should return default for negative numbers', () => {
      expect(parsePositiveInt('-5', 50)).toBe(50);
    });

    it('should return default for non-numeric strings', () => {
      expect(parsePositiveInt('abc', 50)).toBe(50);
    });

    it('should clamp to max value when provided', () => {
      expect(parsePositiveInt('1000', 50, 100)).toBe(100);
    });

    it('should allow values below max', () => {
      expect(parsePositiveInt('75', 50, 100)).toBe(75);
    });

    it('should parse integers from decimal strings', () => {
      expect(parsePositiveInt('42.9', 50)).toBe(42);
    });
  });

  // ============================================================================
  // getCorsHeaders
  // ============================================================================

  describe('getCorsHeaders', () => {
    it('should return CORS headers object', () => {
      const headers = getCorsHeaders();

      expect(headers).toHaveProperty('Access-Control-Allow-Origin');
      expect(headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(headers).toHaveProperty('Access-Control-Allow-Headers');
    });

    it('should include required methods', () => {
      const headers = getCorsHeaders();

      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Access-Control-Allow-Methods']).toContain('DELETE');
    });

    it('should allow necessary headers', () => {
      const headers = getCorsHeaders();

      expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
      expect(headers['Access-Control-Allow-Headers']).toContain('X-User-Id');
      expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });
  });
});
