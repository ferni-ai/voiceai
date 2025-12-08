/**
 * Feature Flag Routes Tests
 *
 * Tests for feature flag API endpoints:
 * - List/get flags
 * - Create/update/delete flags
 * - Toggle flags
 * - Categories
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock auth middleware
vi.mock('../api/auth-middleware.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 'test-user', tier: 'friend' })),
  requireAdmin: vi.fn(() => ({ userId: 'admin-user', tier: 'admin' })),
  rateLimit: vi.fn(() => false),
}));

// Mock feature flags service
const mockFlagsService = {
  getAllFlags: vi.fn(),
  getCategories: vi.fn(),
  getFlag: vi.fn(),
  createFlag: vi.fn(),
  updateFlag: vi.fn(),
  deleteFlag: vi.fn(),
  reload: vi.fn(),
};

vi.mock('../services/feature-flags.js', () => ({
  getFeatureFlags: vi.fn(() => mockFlagsService),
}));

import { handleFeatureFlagRoutes } from '../api/feature-flag-routes.js';
import { requireAdmin } from '../api/auth-middleware.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}): IncomingMessage {
  const { method = 'GET', url = '/', headers = {}, body = '' } = options;

  const req = {
    method,
    url,
    headers: { 'x-user-id': 'test-user', ...headers },
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

describe('Feature Flag Routes', () => {
  const sampleFlags = [
    { id: 'dark-mode', name: 'Dark Mode', type: 'boolean', enabled: true, category: 'ui' },
    { id: 'new-feature', name: 'New Feature', type: 'percentage', enabled: false, percentage: 25, category: 'features' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockFlagsService.getAllFlags.mockReturnValue(sampleFlags);
    mockFlagsService.getCategories.mockReturnValue(['ui', 'features', 'experimental']);
    mockFlagsService.getFlag.mockImplementation((id) => sampleFlags.find((f) => f.id === id));
  });

  describe('Route Matching', () => {
    it('should not handle non-flags routes', async () => {
      const req = createMockRequest({ url: '/api/other' });
      const { res } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('should handle CORS preflight', async () => {
      const req = createMockRequest({ method: 'OPTIONS', url: '/api/flags' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags');

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(204);
    });
  });

  describe('GET /api/flags', () => {
    it('should return all flags with categories', async () => {
      const req = createMockRequest({ url: '/api/flags' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags');

      expect(handled).toBe(true);
      expect(mockFlagsService.getAllFlags).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.flags).toHaveLength(2);
      expect(data.categories).toContain('ui');
      expect(data.count).toBe(2);
    });
  });

  describe('GET /api/flags/categories', () => {
    it('should return flag categories', async () => {
      const req = createMockRequest({ url: '/api/flags/categories' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/categories');

      expect(handled).toBe(true);
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.categories).toContain('features');
    });
  });

  describe('GET /api/flags/:id', () => {
    it('should return a specific flag', async () => {
      const req = createMockRequest({ url: '/api/flags/dark-mode' });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/dark-mode');

      expect(handled).toBe(true);
      expect(mockFlagsService.getFlag).toHaveBeenCalledWith('dark-mode');
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.flag.id).toBe('dark-mode');
    });

    it('should return 404 for non-existent flag', async () => {
      mockFlagsService.getFlag.mockReturnValue(undefined);

      const req = createMockRequest({ url: '/api/flags/nonexistent' });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/nonexistent');

      expect(getWrittenData().status).toBe(404);
    });

    it('should handle URL-encoded flag IDs', async () => {
      mockFlagsService.getFlag.mockImplementation((id) => {
        if (id === 'flag-with-special') return { id: 'flag-with-special', name: 'Special' };
        return undefined;
      });

      const req = createMockRequest({ url: '/api/flags/flag-with-special' });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/flag-with-special');

      expect(getWrittenData().status).toBe(200);
    });
  });

  describe('POST /api/flags', () => {
    it('should create a new flag', async () => {
      mockFlagsService.createFlag.mockReturnValue({
        id: 'new-flag',
        name: 'New Flag',
        type: 'boolean',
        enabled: false,
        category: 'test',
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags',
        body: JSON.stringify({
          id: 'new-flag',
          name: 'New Flag',
          type: 'boolean',
          category: 'test',
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags');

      expect(handled).toBe(true);
      expect(requireAdmin).toHaveBeenCalled();
      expect(mockFlagsService.createFlag).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(201);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
      expect(data.flag.id).toBe('new-flag');
    });

    it('should handle creation errors', async () => {
      mockFlagsService.createFlag.mockImplementation(() => {
        throw new Error('Flag ID already exists');
      });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags',
        body: JSON.stringify({
          id: 'dark-mode',
          name: 'Dark Mode',
          type: 'boolean',
          category: 'ui',
        }),
      });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags');

      expect(getWrittenData().status).toBe(400);
    });
  });

  describe('PUT /api/flags/:id', () => {
    it('should update an existing flag', async () => {
      mockFlagsService.updateFlag.mockReturnValue({
        id: 'dark-mode',
        name: 'Dark Mode',
        enabled: false,
      });

      const req = createMockRequest({
        method: 'PUT',
        url: '/api/flags/dark-mode',
        body: JSON.stringify({ enabled: false }),
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/dark-mode');

      expect(handled).toBe(true);
      expect(mockFlagsService.updateFlag).toHaveBeenCalledWith('dark-mode', { enabled: false });
      expect(getWrittenData().status).toBe(200);
    });

    it('should return 404 for non-existent flag', async () => {
      mockFlagsService.updateFlag.mockReturnValue(null);

      const req = createMockRequest({
        method: 'PUT',
        url: '/api/flags/nonexistent',
        body: JSON.stringify({ enabled: true }),
      });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/nonexistent');

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('DELETE /api/flags/:id', () => {
    it('should delete a flag', async () => {
      mockFlagsService.deleteFlag.mockReturnValue(true);

      const req = createMockRequest({
        method: 'DELETE',
        url: '/api/flags/dark-mode',
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/dark-mode');

      expect(handled).toBe(true);
      expect(mockFlagsService.deleteFlag).toHaveBeenCalledWith('dark-mode');
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });

    it('should return 404 for non-existent flag', async () => {
      mockFlagsService.deleteFlag.mockReturnValue(false);

      const req = createMockRequest({
        method: 'DELETE',
        url: '/api/flags/nonexistent',
      });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/nonexistent');

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('POST /api/flags/:id/toggle', () => {
    it('should toggle a flag from true to false', async () => {
      mockFlagsService.getFlag.mockReturnValue({ id: 'dark-mode', enabled: true });
      mockFlagsService.updateFlag.mockReturnValue({ id: 'dark-mode', enabled: false });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags/dark-mode/toggle',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/dark-mode/toggle');

      expect(handled).toBe(true);
      expect(mockFlagsService.updateFlag).toHaveBeenCalledWith('dark-mode', { enabled: false });
      expect(getWrittenData().status).toBe(200);
    });

    it('should toggle a flag from false to true', async () => {
      mockFlagsService.getFlag.mockReturnValue({ id: 'new-feature', enabled: false });
      mockFlagsService.updateFlag.mockReturnValue({ id: 'new-feature', enabled: true });

      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags/new-feature/toggle',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/new-feature/toggle');

      expect(mockFlagsService.updateFlag).toHaveBeenCalledWith('new-feature', { enabled: true });
    });

    it('should return 404 for non-existent flag', async () => {
      mockFlagsService.getFlag.mockReturnValue(undefined);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags/nonexistent/toggle',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      await handleFeatureFlagRoutes(req, res, '/api/flags/nonexistent/toggle');

      expect(getWrittenData().status).toBe(404);
    });
  });

  describe('POST /api/flags/reload', () => {
    it('should reload flags', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/flags/reload',
        body: '{}',
      });
      const { res, getWrittenData } = createMockResponse();

      const handled = await handleFeatureFlagRoutes(req, res, '/api/flags/reload');

      expect(handled).toBe(true);
      expect(mockFlagsService.reload).toHaveBeenCalled();
      expect(getWrittenData().status).toBe(200);
      const data = JSON.parse(getWrittenData().body || '{}');
      expect(data.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should require admin for write operations', async () => {
      const writeOps = [
        { method: 'POST', path: '/api/flags' },
        { method: 'PUT', path: '/api/flags/test' },
        { method: 'DELETE', path: '/api/flags/test' },
      ];

      for (const op of writeOps) {
        vi.clearAllMocks();
        const req = createMockRequest({ method: op.method, url: op.path, body: '{}' });
        const { res } = createMockResponse();

        await handleFeatureFlagRoutes(req, res, op.path);

        expect(requireAdmin).toHaveBeenCalled();
      }
    });
  });
});
