/**
 * API Helpers Tests
 *
 * Tests for shared API utility functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import {
  parsePositiveInt,
  getUserId,
  validateQueryParams,
  getSecureUserId,
  verifyAdminAccess,
  verifyAdminAccessFromUrl,
} from '../helpers.js';
import { z } from 'zod';

// Create mock request
function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = options.headers || {};
  req.url = options.url || '/';
  req.method = options.method || 'GET';
  return req;
}

describe('API Helpers', () => {
  describe('parsePositiveInt', () => {
    it('should return default for null value', () => {
      expect(parsePositiveInt(null, 10)).toBe(10);
    });

    it('should return default for empty string', () => {
      expect(parsePositiveInt('', 10)).toBe(10);
    });

    it('should parse valid positive integer', () => {
      expect(parsePositiveInt('5', 10)).toBe(5);
    });

    it('should return default for zero', () => {
      expect(parsePositiveInt('0', 10)).toBe(10);
    });

    it('should return default for negative number', () => {
      expect(parsePositiveInt('-5', 10)).toBe(10);
    });

    it('should return default for NaN', () => {
      expect(parsePositiveInt('abc', 10)).toBe(10);
    });

    it('should respect maximum value', () => {
      expect(parsePositiveInt('100', 10, 50)).toBe(50);
    });

    it('should return value if under maximum', () => {
      expect(parsePositiveInt('30', 10, 50)).toBe(30);
    });

    it('should handle float strings by truncating', () => {
      expect(parsePositiveInt('5.7', 10)).toBe(5);
    });
  });

  describe('getUserId', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should get userId from query params', () => {
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/?userId=user-123');

      const result = getUserId(req, parsedUrl);

      expect(result).toBe('user-123');
    });

    it('should NOT accept the client-spoofable x-user-id header', () => {
      // SECURITY: only x-firebase-uid (set server-side by auth-middleware),
      // query param, or dev bypass identify the user — never a raw client header
      const req = createMockRequest({
        headers: { 'x-user-id': 'header-user-456' },
      });
      const parsedUrl = new URL('http://localhost/');

      const result = getUserId(req, parsedUrl);

      expect(result).toBeNull();
    });

    it('should prefer query param over header', () => {
      const req = createMockRequest({
        headers: { 'x-user-id': 'header-user' },
      });
      const parsedUrl = new URL('http://localhost/?userId=query-user');

      const result = getUserId(req, parsedUrl);

      expect(result).toBe('query-user');
    });

    it('should return null when no userId provided', () => {
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/');

      const result = getUserId(req, parsedUrl);

      expect(result).toBeNull();
    });

    it('should return dev user in development mode with dev-mode key', () => {
      process.env.NODE_ENV = 'development';
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/?admin_key=dev-mode');

      const result = getUserId(req, parsedUrl);

      expect(result).toBe('dev-user-123');
    });

    it('should NOT return dev user in production mode', () => {
      process.env.NODE_ENV = 'production';
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/?admin_key=dev-mode');

      const result = getUserId(req, parsedUrl);

      expect(result).toBeNull();
    });
  });

  describe('validateQueryParams', () => {
    it('should validate valid query params', () => {
      const schema = z.object({
        limit: z.coerce.number().min(1).max(100).default(10),
        page: z.coerce.number().min(1).default(1),
      });

      const parsedUrl = new URL('http://localhost/?limit=50&page=2');
      const result = validateQueryParams(parsedUrl, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.page).toBe(2);
      }
    });

    it('should use defaults for missing params', () => {
      const schema = z.object({
        limit: z.coerce.number().default(10),
      });

      const parsedUrl = new URL('http://localhost/');
      const result = validateQueryParams(parsedUrl, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('should return error for invalid params', () => {
      const schema = z.object({
        limit: z.coerce.number().min(1).max(100),
      });

      const parsedUrl = new URL('http://localhost/?limit=200');
      const result = validateQueryParams(parsedUrl, schema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid query parameters');
      }
    });

    it('should handle string params', () => {
      const schema = z.object({
        search: z.string().min(1),
        category: z.string().optional(),
      });

      const parsedUrl = new URL('http://localhost/?search=hello&category=test');
      const result = validateQueryParams(parsedUrl, schema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search).toBe('hello');
        expect(result.data.category).toBe('test');
      }
    });
  });

  describe('getSecureUserId', () => {
    it('should return auth userId for normal users', () => {
      const auth = { userId: 'auth-user-123', isAdmin: false } as any;

      const result = getSecureUserId(auth, 'other-user-456');

      expect(result).toBe('auth-user-123');
    });

    it('should return requested userId for admins', () => {
      const auth = { userId: 'admin-user', isAdmin: true } as any;

      const result = getSecureUserId(auth, 'target-user-789');

      expect(result).toBe('target-user-789');
    });

    it('should return auth userId for admins when no requested userId', () => {
      const auth = { userId: 'admin-user', isAdmin: true } as any;

      const result = getSecureUserId(auth, null);

      expect(result).toBe('admin-user');
    });

    it('should prevent IDOR attacks by ignoring requested userId for non-admins', () => {
      const auth = { userId: 'normal-user', isAdmin: false } as any;

      const result = getSecureUserId(auth, 'victim-user');

      expect(result).toBe('normal-user');
    });
  });

  describe('verifyAdminAccess', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdminKey = process.env.ADMIN_KEY;

    beforeEach(() => {
      process.env.ADMIN_KEY = 'secret-admin-key';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.ADMIN_KEY = originalAdminKey;
    });

    it('should return true for valid admin key', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'secret-admin-key' },
      });

      const result = verifyAdminAccess(req);

      expect(result).toBe(true);
    });

    it('should return false for invalid admin key', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'wrong-key' },
      });

      const result = verifyAdminAccess(req);

      expect(result).toBe(false);
    });

    it('should return false for missing admin key', () => {
      const req = createMockRequest({});

      const result = verifyAdminAccess(req);

      expect(result).toBe(false);
    });

    it('should allow dev-mode in development when enabled', () => {
      process.env.NODE_ENV = 'development';
      const req = createMockRequest({
        headers: { 'x-admin-key': 'dev-mode' },
      });

      const result = verifyAdminAccess(req, true);

      expect(result).toBe(true);
    });

    it('should NOT allow dev-mode in production', () => {
      process.env.NODE_ENV = 'production';
      const req = createMockRequest({
        headers: { 'x-admin-key': 'dev-mode' },
      });

      const result = verifyAdminAccess(req, true);

      expect(result).toBe(false);
    });

    it('should NOT allow dev-mode when allowDevMode is false', () => {
      process.env.NODE_ENV = 'development';
      const req = createMockRequest({
        headers: { 'x-admin-key': 'dev-mode' },
      });

      const result = verifyAdminAccess(req, false);

      expect(result).toBe(false);
    });
  });

  describe('verifyAdminAccessFromUrl', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAdminKey = process.env.ADMIN_KEY;

    beforeEach(() => {
      process.env.ADMIN_KEY = 'secret-admin-key';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.ADMIN_KEY = originalAdminKey;
    });

    it('should accept admin key from header', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'secret-admin-key' },
      });
      const parsedUrl = new URL('http://localhost/');

      const result = verifyAdminAccessFromUrl(req, parsedUrl);

      expect(result).toBe(true);
    });

    it('should accept admin key from query param', () => {
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/?admin_key=secret-admin-key');

      const result = verifyAdminAccessFromUrl(req, parsedUrl);

      expect(result).toBe(true);
    });

    it('should prefer header over query param', () => {
      const req = createMockRequest({
        headers: { 'x-admin-key': 'wrong-key' },
      });
      const parsedUrl = new URL('http://localhost/?admin_key=secret-admin-key');

      // Header takes precedence, so this should fail
      const result = verifyAdminAccessFromUrl(req, parsedUrl);

      expect(result).toBe(false);
    });

    it('should NOT allow dev-mode in production from URL', () => {
      process.env.NODE_ENV = 'production';
      const req = createMockRequest({});
      const parsedUrl = new URL('http://localhost/?admin_key=dev-mode');

      const result = verifyAdminAccessFromUrl(req, parsedUrl, true);

      expect(result).toBe(false);
    });
  });
});
