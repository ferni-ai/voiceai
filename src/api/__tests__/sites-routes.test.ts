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
const mockFirestoreLimit = vi.fn();

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

// Verified caller, as the identity door resolved it (a real account by default)
const mockOptionalAuthAsync = vi.fn();
vi.mock('../auth-middleware.js', () => ({
  optionalAuthAsync: (...args: unknown[]) => mockOptionalAuthAsync(...args),
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
  mockFirestoreLimit.mockReset();

  // Setup limit chain (for static site serving)
  mockFirestoreLimit.mockReturnValue({
    get: mockFirestoreGet,
  });

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

  // where() returns chainable object with where(), limit(), orderBy(), get()
  mockFirestoreWhere.mockReturnValue({
    get: mockFirestoreGet,
    where: mockFirestoreWhere,
    limit: mockFirestoreLimit,
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
    mockOptionalAuthAsync.mockResolvedValue({
      userId: 'user-123',
      isAnonymous: false,
      authMethod: 'firebase',
    });
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

  describe('publishing needs a real account', () => {
    const routes = ['/api/sites/deploy', '/api/sites/generate-and-deploy'];

    it.each(routes)('%s refuses an anonymous (guest) sign-in and stores nothing', async (path) => {
      mockGetUserId.mockReturnValue('anon-uid');
      mockOptionalAuthAsync.mockResolvedValue({
        userId: 'anon-uid',
        isAnonymous: true,
        authMethod: 'firebase',
      });
      mockParseBody.mockResolvedValue({
        files: { 'index.html': '<html><body>hi</body></html>' },
        config: { agentId: 'a1' },
      });

      await handleSitesRoutes(createMockRequest('POST', path), createMockResponse(), path);

      expect(mockSendError).toHaveBeenCalledWith(
        expect.anything(),
        'Sign in with an account to publish a site',
        403
      );
      expect(mockFirestoreSet).not.toHaveBeenCalled();
    });

    it('refuses when no verified identity is attached (fails closed)', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockOptionalAuthAsync.mockResolvedValue(null);
      mockParseBody.mockResolvedValue({ files: { 'index.html': '<html></html>' } });

      const path = '/api/sites/deploy';
      await handleSitesRoutes(createMockRequest('POST', path), createMockResponse(), path);

      expect(mockSendError).toHaveBeenCalledWith(expect.anything(), expect.any(String), 403);
      expect(mockFirestoreSet).not.toHaveBeenCalled();
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

      const req = createMockRequest(
        'GET',
        '/api/sites/subdomains/check?subdomain=new-site&userId=user-123'
      );
      const res = createMockResponse();
      const parsedUrl = new URL(
        'http://localhost/api/sites/subdomains/check?subdomain=new-site&userId=user-123'
      );

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.available).toBe(true);
      expect(response.subdomain).toBe('new-site');
    });

    it('should reject reserved subdomains', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest(
        'GET',
        '/api/sites/subdomains/check?subdomain=admin&userId=user-123'
      );
      const res = createMockResponse();
      const parsedUrl = new URL(
        'http://localhost/api/sites/subdomains/check?subdomain=admin&userId=user-123'
      );

      await handleSitesRoutes(req, res, '/api/sites/subdomains/check', parsedUrl);

      expect(mockSendJSON).toHaveBeenCalled();
      const response = mockSendJSON.mock.calls[0][1];
      expect(response.available).toBe(false);
      expect(response.suggestedAlternatives).toBeDefined();
    });

    it('should reject invalid subdomain format', async () => {
      mockGetUserId.mockReturnValue('user-123');

      const req = createMockRequest(
        'GET',
        '/api/sites/subdomains/check?subdomain=invalid_site&userId=user-123'
      );
      const res = createMockResponse();
      const parsedUrl = new URL(
        'http://localhost/api/sites/subdomains/check?subdomain=invalid_site&userId=user-123'
      );

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

      // First call: subdomain query returns empty
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] });
      // Second call: direct doc lookup returns the site
      mockFirestoreGet.mockResolvedValueOnce({
        exists: true,
        id: 'site_123',
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

      // First call: subdomain query returns empty
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] });
      // Second call: direct doc lookup returns the site
      mockFirestoreGet.mockResolvedValueOnce({
        exists: true,
        id: 'site_123',
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
      // First call: subdomain query returns empty
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] });
      // Second call: direct doc lookup returns not found
      mockFirestoreGet.mockResolvedValueOnce({ exists: false });

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

      // First call: subdomain query returns empty
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] });
      // Second call: direct doc lookup returns the site
      mockFirestoreGet.mockResolvedValueOnce({
        exists: true,
        id: 'site_123',
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

  describe('published content is sandboxed off the app origin', () => {
    const site = {
      userId: 'user-123',
      files: { 'index.html': '<html><body>Page</body></html>', 'app.js': 'void 0' },
      analytics: { views: 0 },
    };

    async function serve(path: string, record: Record<string, unknown> = site) {
      mockFirestoreGet.mockResolvedValueOnce({ empty: true, docs: [] });
      mockFirestoreGet.mockResolvedValueOnce({ exists: true, id: 'site_1', data: () => record });
      mockFirestoreUpdate.mockResolvedValue(undefined);
      const res = createMockResponse();
      await handleSitesRoutes(createMockRequest('GET', path), res, path);
      return res;
    }

    it.each([
      ['the page', '/sites/site_1'],
      ['a script file', '/sites/site_1/app.js'],
      ['the SPA fallback', '/sites/site_1/deep/route'],
    ])('%s gets an opaque-origin sandbox and nosniff', async (_label, path) => {
      const res = await serve(path);
      expect(res._statusCode).toBe(200);
      const csp = res._headers['Content-Security-Policy'] ?? '';
      const sandbox = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.startsWith('sandbox'));
      expect(sandbox).toBe('sandbox allow-scripts allow-forms allow-popups');
      expect(csp).not.toContain('allow-same-origin');
      expect(res._headers['X-Content-Type-Options']).toBe('nosniff');
    });

    const directives = (res: { _headers: Record<string, string> }) =>
      (res._headers['Content-Security-Policy'] ?? '').split(';').map((d) => d.trim());

    it.each([
      ['uploaded', { kind: 'uploaded' }],
      ['without a kind', {}],
      ['with an unknown kind', { kind: 'Generated' }],
    ])('a site %s stays sandboxed', async (_label, extra) => {
      for (const path of ['/sites/site_1', '/sites/site_1/deep/route']) {
        const res = await serve(path, { ...site, ...extra });
        expect(directives(res)).toContain('sandbox allow-scripts allow-forms allow-popups');
      }
    });

    it.each(['/sites/site_1', '/sites/site_1/deep/route'])(
      'a page our templates rendered (%s) keeps the app origin, nosniff and a tight policy',
      async (path) => {
        const res = await serve(path, { ...site, kind: 'generated' });
        const csp = directives(res);
        expect(csp.some((d) => d.startsWith('sandbox'))).toBe(false);
        expect(res._headers['X-Content-Type-Options']).toBe('nosniff');
        expect(csp.join(';')).not.toContain('unsafe-eval');
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        const scripts = csp.find((d) => d.startsWith('script-src')) ?? '';
        expect(scripts).not.toMatch(/https:\/\/cdn\.jsdelivr\.net(\s|$)/);
        const connect = csp.find((d) => d.startsWith('connect-src')) ?? '';
        expect(connect).not.toContain('googleapis');
      }
    );
  });

  describe('the server, not the publisher, records what kind of site it is', () => {
    const hostile = '</script><script>alert(1)</script>"onload="alert(1)\\';

    function savedSite(): Record<string, unknown> & { files: Record<string, string> } {
      expect(mockFirestoreSet).toHaveBeenCalledTimes(1);
      return mockFirestoreSet.mock.calls[0][0];
    }

    async function generateAndDeploy(config: Record<string, unknown>) {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({ config, kind: 'uploaded' });
      mockFirestoreSet.mockResolvedValue(undefined);
      const path = '/api/sites/generate-and-deploy';
      await handleSitesRoutes(createMockRequest('POST', path), createMockResponse(), path);
    }

    const baseConfig = {
      agent: { id: 'agent-1', name: 'Ada', initials: 'AD', tagline: 't', description: 'd' },
      brand: { primary: '#96151D' },
    };

    it('an uploaded site is recorded as uploaded even when the body claims otherwise', async () => {
      mockGetUserId.mockReturnValue('user-123');
      mockParseBody.mockResolvedValue({
        files: { 'index.html': '<html></html>' },
        kind: 'generated',
      });
      mockFirestoreSet.mockResolvedValue(undefined);
      const path = '/api/sites/deploy';
      await handleSitesRoutes(createMockRequest('POST', path), createMockResponse(), path);
      expect(savedSite().kind).toBe('uploaded');
    });

    it('a generated page is recorded as generated and renders hostile input inert', async () => {
      await generateAndDeploy({
        ...baseConfig,
        agent: {
          ...baseConfig.agent,
          name: hostile,
          displayName: hostile,
          tagline: '"><img src=x onerror=alert(1)>',
          conversationStarters: [hostile],
          quote: { text: hostile, context: hostile },
        },
        brand: { ...baseConfig.brand, logoUrl: 'javascript:alert(1)' },
        seo: { title: `</title>${hostile}`, description: hostile },
        footer: { links: [{ label: hostile, href: 'javascript:alert(1)' }], disclaimer: hostile },
        customJs: 'alert(1)',
        customCss: '</style><script>alert(1)</script>',
        deployment: { tokenEndpoint: 'https://collector.example/t', livekitUrl: 'wss://x.example' },
      });
      const site = savedSite();
      expect(site.kind).toBe('generated');
      const html = site.files['index.html'];

      expect(html).not.toContain('<script>alert');
      expect(html).not.toContain('<img src=x');
      expect(html).not.toMatch(/(^|[^\\])"\s*onload=/);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).not.toContain('collector.example');
      expect(html.match(/<script/g)).toHaveLength(3);
      // The name stays one JS string inside the boot script, whatever it contains.
      const literal = html.match(/personaName: (.*),\n/)?.[1] ?? '';
      expect(JSON.parse(literal)).toBe(hostile);
    });

    it.each([
      ['an id that is not a slug', { agent: { ...baseConfig.agent, id: 'a"]{}</style><script>' } }],
      [
        'a secondary colour that is not hex',
        { brand: { primary: '#96151D', secondary: 'red}</style>' } },
      ],
    ])('generate-and-deploy refuses %s and stores nothing', async (_label, override) => {
      await generateAndDeploy({ ...baseConfig, ...override });
      expect(mockSendError).toHaveBeenCalledWith(expect.anything(), expect.any(String), 400);
      expect(mockFirestoreSet).not.toHaveBeenCalled();
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
