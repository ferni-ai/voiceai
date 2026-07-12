/**
 * Life Context API Routes Tests
 *
 * Tests for Phase 6 Life Context API endpoints:
 * - GET /api/life-context - Get current life context snapshot
 * - POST /api/life-context/refresh - Force refresh life context
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LifeContextSnapshot } from '../../intelligence/triggers/index.js';

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

// Mock trigger intelligence modules
const mockAggregateLifeContext = vi.fn();
const mockGenerateSynthesisTriggers = vi.fn();

vi.mock('../../intelligence/triggers/index.js', () => ({
  aggregateLifeContext: (...args: unknown[]) => mockAggregateLifeContext(...args),
  generateSynthesisTriggers: (...args: unknown[]) => mockGenerateSynthesisTriggers(...args),
}));

// Mock life context broadcast service
const mockTriggerLifeContextScan = vi.fn();

vi.mock('../../services/life-context-broadcast.js', () => ({
  triggerLifeContextScan: (...args: unknown[]) => mockTriggerLifeContextScan(...args),
}));

import { handleLifeContextRoutes } from '../life-context-routes.js';

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

function createMockLifeContextSnapshot(
  overrides: Partial<LifeContextSnapshot> = {}
): LifeContextSnapshot {
  return {
    userId: 'user-123',
    createdAt: new Date('2024-12-21T10:00:00Z'),
    analysisWindowDays: 7,
    overallLoadScore: 0.5,
    wellbeingScore: 0.6,
    domains: {
      sleep: undefined,
      calendar: undefined,
      finance: undefined,
      goals: undefined,
      relationships: undefined,
      habits: undefined,
    },
    stressIndicators: [],
    patterns: [],
    synthesizedTriggers: [],
    metadata: {
      domainsWithData: [],
      domainsMissingData: ['sleep', 'calendar', 'finance', 'goals', 'relationships', 'habits'],
      dataQuality: 'medium',
      processingTimeMs: 0,
    },
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Life Context API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Route matching', () => {
    it('should return false for non-life-context routes', async () => {
      const req = createMockRequest('GET', '/api/other');
      const res = createMockResponse();

      const handled = await handleLifeContextRoutes(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('should handle life-context routes', async () => {
      mockAggregateLifeContext.mockResolvedValue(createMockLifeContextSnapshot());
      mockGenerateSynthesisTriggers.mockReturnValue([]);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      const handled = await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(handled).toBe(true);
    });

    it('should handle CORS preflight', async () => {
      const req = createMockRequest('OPTIONS', '/api/life-context');
      const res = createMockResponse();

      const handled = await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(204);
    });
  });

  describe('Authentication', () => {
    it('should require userId parameter', async () => {
      const req = createMockRequest('GET', '/api/life-context');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(400);
      expect(JSON.parse(res._data).error).toMatch(/userId.*required/i);
    });

    it('should accept userId from query parameter', async () => {
      mockAggregateLifeContext.mockResolvedValue(createMockLifeContextSnapshot());
      mockGenerateSynthesisTriggers.mockReturnValue([]);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(200);
      expect(mockAggregateLifeContext).toHaveBeenCalledWith('user-123');
    });

    it('should reject the client-spoofable X-User-Id header (auth comes from x-firebase-uid)', async () => {
      mockAggregateLifeContext.mockResolvedValue(createMockLifeContextSnapshot());
      mockGenerateSynthesisTriggers.mockReturnValue([]);

      const req = createMockRequest('GET', '/api/life-context', { 'x-user-id': 'user-456' });
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(400);
      expect(mockAggregateLifeContext).not.toHaveBeenCalledWith('user-456');
    });
  });

  describe('GET /api/life-context', () => {
    it('should return life context snapshot with triggers', async () => {
      const snapshot = createMockLifeContextSnapshot({
        overallLoadScore: 0.72,
        wellbeingScore: 0.45,
        stressIndicators: [
          {
            domain: 'calendar',
            stressLevel: 0.8,
            reason: 'High schedule density',
            sourcePersona: 'alex',
          },
        ],
        patterns: [
          {
            description: 'Sleep + calendar collision detected',
            domains: ['sleep', 'calendar'],
            impact: 'negative',
          },
        ],
      });

      const triggers = [
        {
          id: 'overwhelm_cascade',
          category: 'support',
          suggestedResponse: "You're carrying a lot right now.",
          reasoning: '3 domains showing high stress',
          confidence: 0.85,
          priority: 'urgent',
          contributingDomains: ['sleep', 'calendar', 'finance'],
          recommendedPersona: 'ferni',
        },
      ];

      mockAggregateLifeContext.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue(triggers);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);

      // Check snapshot structure
      expect(data.snapshot.overallLoadScore).toBe(0.72);
      expect(data.snapshot.wellbeingScore).toBe(0.45);
      expect(data.snapshot.stressIndicators).toHaveLength(1);
      expect(data.snapshot.stressIndicators[0].domain).toBe('calendar');
      expect(data.snapshot.patterns).toHaveLength(1);
      expect(data.snapshot.patterns[0].impact).toBe('negative');

      // Check triggers
      expect(data.triggers).toHaveLength(1);
      expect(data.triggers[0].id).toBe('overwhelm_cascade');
      expect(data.triggers[0].category).toBe('support');
      expect(data.triggers[0].priority).toBe('urgent');
    });

    it('should return default snapshot when no data available', async () => {
      mockAggregateLifeContext.mockResolvedValue(null);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);

      expect(data.snapshot.overallLoadScore).toBe(0.5);
      expect(data.snapshot.wellbeingScore).toBe(0.5);
      expect(data.snapshot.stressIndicators).toEqual([]);
      expect(data.snapshot.patterns).toEqual([]);
      expect(data.triggers).toEqual([]);
    });

    it('should handle aggregation errors gracefully', async () => {
      mockAggregateLifeContext.mockRejectedValue(new Error('Database error'));

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(500);
      expect(JSON.parse(res._data).error).toMatch(/Failed to retrieve/);
    });
  });

  describe('POST /api/life-context/refresh', () => {
    it('should trigger a life context scan and return updated data', async () => {
      const snapshot = createMockLifeContextSnapshot({
        overallLoadScore: 0.65,
        wellbeingScore: 0.55,
      });

      const triggers = [
        {
          id: 'sleep_calendar_collision',
          category: 'rest',
          suggestedResponse: 'Your body is asking for rest.',
          reasoning: 'Sleep at 5.5h with 70% schedule density',
          confidence: 0.8,
          priority: 'high',
          contributingDomains: ['sleep', 'calendar'],
          recommendedPersona: 'maya',
        },
      ];

      mockTriggerLifeContextScan.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue(triggers);

      const req = createMockRequest('POST', '/api/life-context/refresh?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context/refresh');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);

      expect(data.success).toBe(true);
      expect(data.snapshot.overallLoadScore).toBe(0.65);
      expect(data.triggers).toHaveLength(1);
      expect(data.triggers[0].id).toBe('sleep_calendar_collision');
    });

    it('should return failure when no data available after scan', async () => {
      mockTriggerLifeContextScan.mockResolvedValue(null);

      const req = createMockRequest('POST', '/api/life-context/refresh?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context/refresh');

      expect(res._statusCode).toBe(200);
      const data = JSON.parse(res._data);

      expect(data.success).toBe(false);
      expect(data.message).toMatch(/No life context data/);
    });

    it('should handle scan errors gracefully', async () => {
      mockTriggerLifeContextScan.mockRejectedValue(new Error('Scan failed'));

      const req = createMockRequest('POST', '/api/life-context/refresh?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context/refresh');

      expect(res._statusCode).toBe(500);
      expect(JSON.parse(res._data).error).toMatch(/Failed to refresh/);
    });
  });

  describe('Not found routes', () => {
    it('should return 404 for unknown life-context routes', async () => {
      const req = createMockRequest('GET', '/api/life-context/unknown?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context/unknown');

      expect(res._statusCode).toBe(404);
      expect(JSON.parse(res._data).error).toMatch(/Not found/);
    });

    it('should return 404 for wrong method on valid routes', async () => {
      const req = createMockRequest('DELETE', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      expect(res._statusCode).toBe(404);
    });
  });

  describe('Response format validation', () => {
    it('should return correct createdAt format', async () => {
      const snapshot = createMockLifeContextSnapshot({
        createdAt: new Date('2024-12-21T15:30:00Z'),
      });

      mockAggregateLifeContext.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue([]);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      const data = JSON.parse(res._data);
      expect(data.snapshot.createdAt).toBe('2024-12-21T15:30:00.000Z');
    });

    it('should map all trigger fields correctly', async () => {
      const snapshot = createMockLifeContextSnapshot();
      const triggers = [
        {
          id: 'test_trigger',
          category: 'celebration',
          suggestedResponse: 'Great progress!',
          reasoning: 'User is doing well',
          confidence: 0.9,
          priority: 'medium',
          contributingDomains: ['goals', 'habits'],
          recommendedPersona: 'jordan',
        },
      ];

      mockAggregateLifeContext.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue(triggers);

      const req = createMockRequest('GET', '/api/life-context?userId=user-123');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      const data = JSON.parse(res._data);
      const trigger = data.triggers[0];

      expect(trigger.id).toBe('test_trigger');
      expect(trigger.category).toBe('celebration');
      expect(trigger.suggestedResponse).toBe('Great progress!');
      expect(trigger.reasoning).toBe('User is doing well');
      expect(trigger.confidence).toBe(0.9);
      expect(trigger.priority).toBe('medium');
      expect(trigger.contributingDomains).toEqual(['goals', 'habits']);
      expect(trigger.recommendedPersona).toBe('jordan');
    });
  });

  describe('Cross-domain trigger scenarios', () => {
    it('should generate triggers for high-stress scenario', async () => {
      const snapshot = createMockLifeContextSnapshot({
        overallLoadScore: 0.85,
        wellbeingScore: 0.25,
        stressIndicators: [
          { domain: 'sleep', stressLevel: 0.9, reason: 'Only 4h sleep', sourcePersona: 'maya' },
          { domain: 'calendar', stressLevel: 0.8, reason: 'Overloaded', sourcePersona: 'alex' },
          { domain: 'finance', stressLevel: 0.7, reason: 'Market anxiety', sourcePersona: 'peter' },
        ],
      });

      const triggers = [
        {
          id: 'overwhelm_cascade',
          category: 'support',
          suggestedResponse: "You're carrying a lot right now.",
          reasoning: '3 domains showing high stress',
          confidence: 0.85,
          priority: 'urgent',
          contributingDomains: ['sleep', 'calendar', 'finance'],
          recommendedPersona: 'ferni',
        },
      ];

      mockAggregateLifeContext.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue(triggers);

      const req = createMockRequest('GET', '/api/life-context?userId=stressed-user');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      const data = JSON.parse(res._data);
      expect(data.triggers[0].priority).toBe('urgent');
      expect(data.triggers[0].recommendedPersona).toBe('ferni');
    });

    it('should generate triggers for thriving scenario', async () => {
      const snapshot = createMockLifeContextSnapshot({
        overallLoadScore: 0.2,
        wellbeingScore: 0.85,
        patterns: [
          {
            description: 'Positive momentum across domains',
            domains: ['sleep', 'habits', 'goals'],
            impact: 'positive',
          },
        ],
      });

      const triggers = [
        {
          id: 'overall_balance',
          category: 'celebration',
          suggestedResponse: 'Life feels balanced right now.',
          reasoning: 'Load at 20%, wellbeing at 85%',
          confidence: 0.7,
          priority: 'low',
          contributingDomains: ['sleep', 'habits', 'goals'],
          recommendedPersona: 'ferni',
        },
      ];

      mockAggregateLifeContext.mockResolvedValue(snapshot);
      mockGenerateSynthesisTriggers.mockReturnValue(triggers);

      const req = createMockRequest('GET', '/api/life-context?userId=thriving-user');
      const res = createMockResponse();

      await handleLifeContextRoutes(req, res, '/api/life-context');

      const data = JSON.parse(res._data);
      expect(data.triggers[0].category).toBe('celebration');
      expect(data.snapshot.wellbeingScore).toBe(0.85);
    });
  });
});
