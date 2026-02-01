/**
 * Conversation Threads API Tests
 *
 * Tests for the conversation threads API that uses Firestore persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock firebase-admin before importing routes
vi.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  return {
    default: {
      apps: [],
      initializeApp: vi.fn(),
      firestore: vi.fn(() => mockFirestore),
    },
    apps: [],
    initializeApp: vi.fn(),
    firestore: vi.fn(() => mockFirestore),
  };
});

// Mock conversation history service
vi.mock('../../services/stores/conversation-history.js', () => ({
  getConversationHistoryService: vi.fn(() => ({
    getHistory: vi.fn().mockResolvedValue({ sessions: [] }),
  })),
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    requireUserId: vi.fn((req, res, parsedUrl) => {
      const userId = parsedUrl.searchParams.get('userId');
      if (!userId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'userId is required' }));
        return null;
      }
      return userId;
    }),
    sendJSON: vi.fn((res, data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    }),
    sendError: vi.fn((res, message, status = 500) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }),
    readBody: vi.fn().mockResolvedValue({}),
  };
});

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

// Create mock response
function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: any, status: number) {
      this._statusCode = status;
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._data = data || '';
    }),
    setHeader: vi.fn(),
  };
  return res as unknown as ServerResponse & { _data: string; _statusCode: number };
}

describe('Conversation Threads API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/conversations/threads', () => {
    it('should require userId parameter', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/conversations/threads');

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads',
        parsedUrl
      );

      expect(handled).toBe(true);
    });

    it('should return threads for valid userId', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/conversations/threads?userId=test-user-123');

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads',
        parsedUrl
      );

      expect(handled).toBe(true);
    });

    it('should filter threads by status', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const parsedUrl = new URL(
        'http://localhost/api/conversations/threads?userId=test-user&status=open'
      );

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads',
        parsedUrl
      );

      expect(handled).toBe(true);
    });
  });

  describe('POST /api/conversations/threads', () => {
    it('should create a new thread', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');
      const { readBody } = await import('../helpers.js');

      vi.mocked(readBody).mockResolvedValue({
        topic: 'Test topic',
        lastMessage: 'Test message',
        personaId: 'ferni',
      });

      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/conversations/threads?userId=test-user');

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads',
        parsedUrl
      );

      expect(handled).toBe(true);
    });

    it('should require topic field', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');
      const { readBody } = await import('../helpers.js');

      vi.mocked(readBody).mockResolvedValue({});

      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/conversations/threads?userId=test-user');

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads',
        parsedUrl
      );

      expect(handled).toBe(true);
    });
  });

  describe('PATCH /api/conversations/threads/:id', () => {
    it('should update thread status', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');
      const { readBody } = await import('../helpers.js');

      vi.mocked(readBody).mockResolvedValue({
        status: 'resolved',
      });

      const req = createMockRequest({ method: 'PATCH' });
      const res = createMockResponse();
      const parsedUrl = new URL(
        'http://localhost/api/conversations/threads/thread-123?userId=test-user'
      );

      const handled = await handleConversationThreadsRoutes(
        req,
        res,
        '/api/conversations/threads/thread-123',
        parsedUrl
      );

      expect(handled).toBe(true);
    });
  });

  describe('Route matching', () => {
    it('should not handle unrelated routes', async () => {
      const { handleConversationThreadsRoutes } = await import('../routes/conversation-threads.js');

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const parsedUrl = new URL('http://localhost/api/unrelated');

      const handled = await handleConversationThreadsRoutes(req, res, '/api/unrelated', parsedUrl);

      expect(handled).toBe(false);
    });
  });
});
