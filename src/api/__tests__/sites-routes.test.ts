/**
 * Sites API Routes Tests
 *
 * Tests for deployed agent website management:
 * - GET /api/sites - List user's deployed sites
 * - GET /api/sites/:id - Get site details
 * - POST /api/sites/deploy - Deploy a new site
 * - DELETE /api/sites/:id - Delete a site
 * - GET /api/sites/subdomains/check - Check subdomain availability
 * - GET /sites/:id - Serve static site content
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// Mock Firestore
const mockFirestoreDoc = vi.fn();
const mockFirestoreGet = vi.fn();
const mockFirestoreSet = vi.fn();
const mockFirestoreUpdate = vi.fn();
const mockFirestoreDelete = vi.fn();
const mockFirestoreWhere = vi.fn();
const mockFirestoreOrderBy = vi.fn();
const mockFirestoreCollection = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: mockFirestoreCollection,
  }),
}));

// Mock helpers
const mockGetUserId = vi.fn();
const mockSendJSON = vi.fn();
const mockSendError = vi.fn();
const mockParseBody = vi.fn();
const mockHandleCorsPreflightIfNeeded = vi.fn();

vi.mock('../helpers.js', () => ({
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
  sendJSON: (...args: unknown[]) => mockSendJSON(...args),
  sendError: (...args: unknown[]) => mockSendError(...args),
  parseBody: (...args: unknown[]) => mockParseBody(...args),
  handleCorsPreflightIfNeeded: (...args: unknown[]) => mockHandleCorsPreflightIfNeeded(...args),
}));

import { handleSitesRoutes } from '../sites-routes.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockRequest(
  method: string,
  pathname: string,
  headers: Record<string, string> = {}
): IncomingMessage {
  const req = {
    method,
    url: pathname,
    headers: {
      host: 'localhost',
      ...headers,
    },
    on: vi.fn((event, callback) => {
      if (event === 'end') {
        callback();
      }
      return req;
    }),
  } as unknown as IncomingMessage;
  return req;
}

function createMockResponse(): ServerResponse & {
  _data: string;
  _statusCode: number;
  _headers: Record<string, string>;
} {
  let data = '';
  let statusCode = 200;
  const headers: Record<string, string> = {};

  const res = {
    writeHead: vi.fn((code: number, hdrs?: Record<string, string>) => {
      statusCode = code;
      if (hdrs) Object.assign(headers, hdrs);
    }),
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    end: vi.fn((chunk?: string) => {
      if (chunk) data = chunk;
    }),
    get _data() {
      return data;
    },
    get _statusCode() {
      return statusCode;
    },
    get _headers() {
      return headers;
    },
  } as unknown as ServerResponse & {
    _data: string;
    _statusCode: number;
    _headers: Record<string, string>;
  };

  return res;
}

function setupFirestoreMocks() {
  // Reset all mocks
  mockFirestoreCollection.mockReset();
  mockFirestoreDoc.mockReset();
  mockFirestoreGet.mockReset();
  mockFirestoreSet.mockReset();
  mockFirestoreUpdate.mockReset();
  mockFirestoreDelete.mockReset();
  mockFirestoreWhere.mockReset();
  mockFirestoreOrderBy.mockReset();

  // Setup chain
  mockFirestoreCollection.mockReturnValue({
    doc: mockFirestoreDoc,
    where: mockFirestoreWhere,
  });

  mockFirestoreDoc.mockReturnValue({
    get: mockFirestoreGet,
    set: mockFirestoreSet,
    update: mockFirestoreUpdate,
    delete: mockFirestoreDelete,
  });

  mockFirestoreWhere.mockReturnValue({
    get: mockFirestoreGet,
    orderBy: mockFirestoreOrderBy,
  });

  mockFirestoreOrderBy.mockReturnValue({
    get: mockFirestoreGet,
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('Sites API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFirestoreMocks();
    mockHandleCorsPreflightIfNeeded.mockReturnValue(false);
  });

  describe('Route matching', () => {
    it('should return false for non-sites routes', async () => {
      const req = createMockRequest('GET', '/api/other');
      const res = createMockResponse();

      const handled = await handleSitesRoutes(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('should handle /api/sites routes', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockResolvedValue({ empty: true, forEach: vi.fn() });

      const req = createMockRequest('GET', '/api/sites?userId=user-123');
      const res = createMockResponse();

      const handled = await handleSitesRoutes(req, res, '/api/sites');

      expect(handled).toBe(true);
    });

    it('should handle CORS preflight', async () => {
      mockHandleCorsPreflightIfNeeded.mockReturnValue(true);

      const req = createMockRequest('OPTIONS', '/api/sites');
      const res = createMockResponse();

      const handled = await handleSitesRoutes(req, res, '/api/sites');

      expect(handled).toBe(true);
      expect(mockHandleCorsPreflightIfNeeded).toHaveBeenCalled();
    });
  });

  describe('Authentication', () => {
    it('should require userId for GET /api/sites', async () => {
      mockGetUserId.mockReturnValue(null);

      const req = createMockRequest('GET', '/api/sites');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Unauthorized', 401);
    });

    it('should require userId for POST /api/sites/deploy', async () => {
      mockGetUserId.mockReturnValue(null);

      const req = createMockRequest('POST', '/api/sites/deploy');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/deploy');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Unauthorized', 401);
    });

    it('should require userId for DELETE /api/sites/:id', async () => {
      mockGetUserId.mockReturnValue(null);

      const req = createMockRequest('DELETE', '/api/sites/site_123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/site_123');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Unauthorized', 401);
    });
  });

  describe('GET /api/sites', () => {
    it('should return list of user sites', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const mockSites = [
        { id: 'site_1', agentName: 'Agent 1', url: 'https://ferni.ai/sites/site_1' },
        { id: 'site_2', agentName: 'Agent 2', url: 'https://test.ferni.ai' },
      ];

      mockFirestoreGet.mockResolvedValue({
        empty: false,
        forEach: (cb: (doc: { id: string; data: () => Record<string, unknown> }) => void) => {
          mockSites.forEach((site) => cb({ id: site.id, data: () => site }));
        },
      });

      const req = createMockRequest('GET', '/api/sites?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites');

      expect(mockSendJSON).toHaveBeenCalled();
      const sites = mockSendJSON.mock.calls[0][1];
      expect(sites).toHaveLength(2);
      expect(sites[0].agentName).toBe('Agent 1');
    });

    it('should return empty array when no sites exist', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockResolvedValue({
        empty: true,
        forEach: vi.fn(),
      });

      const req = createMockRequest('GET', '/api/sites?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites');

      expect(mockSendJSON).toHaveBeenCalledWith(res, []);
    });
  });

  describe('GET /api/sites/:id', () => {
    it('should return site details', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const mockSite = {
        userId: 'user-123',
        agentName: 'My Agent',
        url: 'https://ferni.ai/sites/site_123',
        status: 'active',
      };

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: 'site_123',
        data: () => mockSite,
      });

      const req = createMockRequest('GET', '/api/sites/site_123?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/site_123');

      expect(mockSendJSON).toHaveBeenCalled();
      const site = mockSendJSON.mock.calls[0][1];
      expect(site.agentName).toBe('My Agent');
    });

    it('should return 404 when site not found', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockResolvedValue({ exists: false });

      const req = createMockRequest('GET', '/api/sites/nonexistent?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/nonexistent');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Site not found', 404);
    });

    it('should return 403 when site belongs to another user', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const mockSite = {
        userId: 'other-user',
        agentName: 'Other Agent',
      };

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        id: 'site_456',
        data: () => mockSite,
      });

      const req = createMockRequest('GET', '/api/sites/site_456?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/site_456');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Access denied', 403);
    });
  });

  describe('POST /api/sites/deploy', () => {
    it('should deploy a new site with files', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({
        files: {
          'index.html': '<html><body data-agent-id="agent_abc">Hello</body></html>',
          'style.css': 'body { color: red; }',
        },
      });
      mockFirestoreSet.mockResolvedValue(undefined);

      // Mock custom-agents collection lookup
      mockFirestoreGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ displayName: 'Test Agent' }),
      });

      const req = createMockRequest('POST', '/api/sites/deploy?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/deploy');

      expect(mockFirestoreSet).toHaveBeenCalled();
      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.success).toBe(true);
      expect(response.url).toContain('ferni.ai/sites/');
    });

    it('should require index.html', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({
        files: {
          'style.css': 'body { color: red; }',
        },
      });

      const req = createMockRequest('POST', '/api/sites/deploy?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/deploy');

      expect(mockSendError).toHaveBeenCalledWith(res, 'index.html is required', 400);
    });

    it('should check subdomain availability', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({
        files: { 'index.html': '<html></html>' },
        subdomain: 'my-site',
      });

      // Subdomain already taken by another user
      mockFirestoreGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ userId: 'other-user' }) }],
      });

      const req = createMockRequest('POST', '/api/sites/deploy?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/deploy');

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.error).toBe('Subdomain already taken');
      expect(response.suggestedAlternatives).toBeDefined();
    });

    it('should allow updating existing subdomain by same user', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({
        files: { 'index.html': '<html></html>' },
        subdomain: 'my-site',
      });

      // Subdomain owned by same user
      mockFirestoreGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ userId: 'user-123' }) }],
      });
      mockFirestoreSet.mockResolvedValue(undefined);

      const req = createMockRequest('POST', '/api/sites/deploy?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/deploy');

      expect(mockFirestoreSet).toHaveBeenCalled();
      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.success).toBe(true);
      expect(response.subdomain).toBe('my-site');
    });
  });

  describe('DELETE /api/sites/:id', () => {
    it('should delete site owned by user', async () => {
      mockGetUserId.mockReturnValue('user-123');

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ userId: 'user-123' }),
      });
      mockFirestoreDelete.mockResolvedValue(undefined);

      const req = createMockRequest('DELETE', '/api/sites/site_123?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/site_123');

      expect(mockFirestoreDelete).toHaveBeenCalled();
      expect(mockSendJSON).toHaveBeenCalledWith(res, { success: true });
    });

    it('should return 404 when deleting nonexistent site', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockResolvedValue({ exists: false });

      const req = createMockRequest('DELETE', '/api/sites/nonexistent?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/nonexistent');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Site not found', 404);
    });

    it('should return 403 when deleting another user site', async () => {
      mockGetUserId.mockReturnValue('user-123');

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => ({ userId: 'other-user' }),
      });

      const req = createMockRequest('DELETE', '/api/sites/site_456?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/site_456');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Access denied', 403);
    });
  });

  describe('GET /api/sites/subdomains/check', () => {
    it('should return available for unused subdomain', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockResolvedValue({ empty: true });

      const req = createMockRequest('GET', '/api/sites/subdomains/check?subdomain=new-site&userId=user-123');
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/sites/subdomains/check?subdomain=new-site&userId=user-123');

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.available).toBe(true);
      expect(response.subdomain).toBe('new-site');
    });

    it('should reject reserved subdomains', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest('GET', '/api/sites/subdomains/check?subdomain=admin&userId=user-123');
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/sites/subdomains/check?subdomain=admin&userId=user-123');

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.available).toBe(false);
      expect(response.suggestedAlternatives).toBeDefined();
    });

    it('should reject invalid subdomain format', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest('GET', '/api/sites/subdomains/check?subdomain=invalid_site&userId=user-123');
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/sites/subdomains/check?subdomain=invalid_site&userId=user-123');

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.available).toBe(false);
      expect(response.error).toBe('Invalid subdomain format');
    });

    it('should require subdomain parameter', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest('GET', '/api/sites/subdomains/check?userId=user-123');
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/sites/subdomains/check?userId=user-123');

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendError).toHaveBeenCalledWith(res, 'subdomain parameter required', 400);
    });
  });

  describe('GET /sites/:id (Static site serving)', () => {
    it('should serve index.html for site', async () => {
      const mockSite = {
        userId: 'user-123',
        files: {
          'index.html': '<html><body>Hello World</body></html>',
        },
        analytics: { views: 5, conversations: 2 },
      };

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => mockSite,
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      const req = createMockRequest('GET', '/sites/site_123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/sites/site_123');

      expect(res._statusCode).toBe(200);
      expect(res._headers['Content-Type']).toBe('text/html');
      expect(res._data).toContain('Hello World');
    });

    it('should serve CSS files with correct content type', async () => {
      const mockSite = {
        userId: 'user-123',
        files: {
          'index.html': '<html></html>',
          'style.css': 'body { color: red; }',
        },
        analytics: { views: 0 },
      };

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => mockSite,
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      const req = createMockRequest('GET', '/sites/site_123/style.css');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/sites/site_123/style.css');

      expect(res._statusCode).toBe(200);
      expect(res._headers['Content-Type']).toBe('text/css');
    });

    it('should return 404 for nonexistent site', async () => {
      mockFirestoreGet.mockResolvedValue({ exists: false });

      const req = createMockRequest('GET', '/sites/nonexistent');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/sites/nonexistent');

      expect(res._statusCode).toBe(404);
      expect(res._data).toContain('Site Not Found');
    });

    it('should fall back to index.html for SPA routing', async () => {
      const mockSite = {
        userId: 'user-123',
        files: {
          'index.html': '<html><body>SPA App</body></html>',
        },
        analytics: { views: 0 },
      };

      mockFirestoreGet.mockResolvedValue({
        exists: true,
        data: () => mockSite,
      });
      mockFirestoreUpdate.mockResolvedValue(undefined);

      const req = createMockRequest('GET', '/sites/site_123/some/deep/route');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/sites/site_123/some/deep/route');

      expect(res._statusCode).toBe(200);
      expect(res._data).toContain('SPA App');
    });
  });

  describe('Error handling', () => {
    it('should handle Firestore errors gracefully', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockFirestoreGet.mockRejectedValue(new Error('Firestore unavailable'));

      const req = createMockRequest('GET', '/api/sites?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Failed to list sites', 500);
    });

    it('should return 404 for unknown routes', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest('GET', '/api/sites/unknown/route?userId=user-123');
      const res = createMockResponse();

      await handleSitesRoutes(req, res, '/api/sites/unknown/route');

      expect(mockSendError).toHaveBeenCalledWith(res, 'Not found', 404);
    });
  });
});
