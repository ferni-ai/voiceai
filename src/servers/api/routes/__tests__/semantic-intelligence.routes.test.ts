/**
 * Integration Tests for Semantic Intelligence API Routes
 *
 * Tests the HTTP endpoints for the "Better Than Human" semantic intelligence
 * capabilities exposed via the UI server API.
 *
 * @module servers/api/routes/__tests__/semantic-intelligence.routes.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock Firestore and external dependencies
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
  cleanForFirestore: vi.fn((obj) => obj),
}));

vi.mock('../../../../memory/embeddings.js', () => ({
  generateEmbedding: vi.fn(async () => Array(768).fill(0.1)),
  embed: vi.fn(async () => Array(768).fill(0.1)),
  cosineSimilarity: vi.fn(() => 0.5),
}));

vi.mock('../../../../intelligence/predictive/llm-deep-analysis.js', () => ({
  getLatestDeepAnalysis: vi.fn(async () => null),
}));

vi.mock('../../../../services/cross-persona/team-huddle.js', () => ({
  getObservations: vi.fn(() => []),
  generateTeamHuddle: vi.fn(async () => null),
}));

// Import after mocks
import { handleSemanticIntelligenceRoutes } from '../semantic-intelligence.js';

// ============================================================================
// MOCK HELPERS
// ============================================================================

function createMockRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {}
): IncomingMessage {
  return {
    method,
    url,
    headers: {
      'x-user-id': 'test-user-123',
      ...headers,
    },
    on: vi.fn(),
  } as unknown as IncomingMessage;
}

function createMockResponse(): ServerResponse & {
  statusCode: number;
  body: string;
  getBody: () => unknown;
} {
  let statusCode = 200;
  let body = '';

  const res = {
    statusCode,
    body,
    writeHead: vi.fn((status: number) => {
      statusCode = status;
      res.statusCode = status;
    }),
    end: vi.fn((data?: string) => {
      body = data || '';
      res.body = body;
    }),
    getBody: () => {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    },
  } as unknown as ServerResponse & { statusCode: number; body: string; getBody: () => unknown };

  return res;
}

// ============================================================================
// ROUTE TESTS
// ============================================================================

describe('Semantic Intelligence API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Summary Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/summary', () => {
    it('should return summary for authenticated user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/summary?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/summary'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as Record<string, unknown>;
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('correlationCount');
      expect(body).toHaveProperty('activeArcs');
      expect(body).toHaveProperty('trackedPeople');
    });

    it('should reject request without userId', async () => {
      const req = createMockRequest('GET', '/api/semantic-intelligence/summary', {});
      delete (req.headers as Record<string, string>)['x-user-id'];
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/summary'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));

      const body = res.getBody() as { error: string };
      expect(body.error).toBe('userId required');
    });
  });

  // =========================================================================
  // Insights Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/insights', () => {
    it('should return insights for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/insights?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/insights'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { insights: unknown[]; count: number };
      expect(body).toHaveProperty('insights');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('pendingTotal');
      expect(Array.isArray(body.insights)).toBe(true);
    });

    it('should accept optional filter params', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/insights?userId=test-user-123&topic=work&emotion=stressed&sessionStart=true'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/insights'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });
  });

  // =========================================================================
  // Open Loops Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/open-loops', () => {
    it('should return open loops for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/open-loops?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/open-loops'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { loops: unknown[]; count: number };
      expect(body).toHaveProperty('loops');
      expect(body).toHaveProperty('count');
      expect(Array.isArray(body.loops)).toBe(true);
    });
  });

  // =========================================================================
  // Commitments Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/commitments', () => {
    it('should return commitments for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/commitments?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/commitments'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { pending: unknown[]; remembered: unknown[] };
      expect(body).toHaveProperty('pending');
      expect(body).toHaveProperty('remembered');
      expect(body).toHaveProperty('pendingCount');
      expect(body).toHaveProperty('rememberedCount');
    });
  });

  // =========================================================================
  // Relationships Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/relationships', () => {
    it('should return relationship data for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/relationships?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/relationships'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { totalPeople: number };
      expect(body).toHaveProperty('totalPeople');
      expect(body).toHaveProperty('timestamp');
    });
  });

  // =========================================================================
  // Temporal Patterns Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/temporal', () => {
    it('should return temporal patterns for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/temporal?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/temporal'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { timestamp: string };
      expect(body).toHaveProperty('timestamp');
    });
  });

  // =========================================================================
  // Behavioral Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/behavioral', () => {
    it('should return behavioral intelligence for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/behavioral?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/behavioral'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { sabotagePatterns: unknown; emotionalBaseline: unknown };
      expect(body).toHaveProperty('sabotagePatterns');
      expect(body).toHaveProperty('emotionalBaseline');
    });
  });

  // =========================================================================
  // Coaching Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/coaching', () => {
    it('should return coaching intelligence for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/coaching?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/coaching'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as {
        effectiveness: unknown;
        learningStyle: unknown;
        resistance: unknown;
      };
      expect(body).toHaveProperty('effectiveness');
      expect(body).toHaveProperty('learningStyle');
      expect(body).toHaveProperty('resistance');
    });
  });

  // =========================================================================
  // Self-Awareness Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/self-awareness', () => {
    it('should return self-awareness data for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/self-awareness?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/self-awareness'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { blindSpots: unknown; valuesAlignment: unknown };
      expect(body).toHaveProperty('blindSpots');
      expect(body).toHaveProperty('selfPerceptionGaps');
      expect(body).toHaveProperty('valuesAlignment');
    });
  });

  // =========================================================================
  // Deep Analysis Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/deep-analysis', () => {
    it('should return deep analysis status when none available', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/deep-analysis?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/deep-analysis'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { hasAnalysis: boolean; message?: string };
      expect(body).toHaveProperty('hasAnalysis');
      // Since we mocked getLatestDeepAnalysis to return null:
      expect(body.hasAnalysis).toBe(false);
      expect(body.message).toBe('No deep analysis available yet');
    });
  });

  // =========================================================================
  // Team Observations Endpoint
  // =========================================================================
  describe('GET /api/semantic-intelligence/team-observations', () => {
    it('should return team observations for user', async () => {
      const req = createMockRequest(
        'GET',
        '/api/semantic-intelligence/team-observations?userId=test-user-123'
      );
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(
        req,
        res,
        '/api/semantic-intelligence/team-observations'
      );

      expect(handled).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));

      const body = res.getBody() as { observations: unknown[]; total: number };
      expect(body).toHaveProperty('observations');
      expect(body).toHaveProperty('total');
      expect(Array.isArray(body.observations)).toBe(true);
    });
  });

  // =========================================================================
  // Unhandled Routes
  // =========================================================================
  describe('Unhandled routes', () => {
    it('should return false for non-semantic-intelligence routes', async () => {
      const req = createMockRequest('GET', '/api/other-route?userId=test-user-123');
      const res = createMockResponse();

      const handled = await handleSemanticIntelligenceRoutes(req, res, '/api/other-route');

      expect(handled).toBe(false);
    });
  });
});
