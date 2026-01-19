/**
 * Observability Routes - Superhuman Endpoint Tests
 *
 * Tests for the superhuman capability activation metrics endpoint:
 * - GET /api/observability/superhuman
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// Mocks - Set up BEFORE importing the module
// ============================================================================

// Mock observability hub and metrics (not used by superhuman endpoint but imported)
vi.mock('../../intelligence/index.js', () => ({
  getCollectiveLearningSchedulerStatus: vi.fn(() => ({})),
  getCommunityInsights: vi.fn(() => ({})),
}));

vi.mock('../../services/observability/memory-pressure.js', () => ({
  getMemoryHealth: vi.fn(() => ({ status: 'healthy' })),
}));

vi.mock('../../memory/redis-cache.js', () => ({
  getRedisCache: vi.fn(() => ({
    getStats: vi.fn(() => ({ hits: 0, misses: 0, size: 0 })),
  })),
}));

vi.mock('../../services/pubsub/redis-pubsub.js', () => ({
  getRedisPubSubStatus: vi.fn(() => ({ connected: false })),
}));

vi.mock('../../services/self-healing/circuit-breakers.js', () => ({
  getAllCircuitBreakerStates: vi.fn(() => ({})),
}));

// Mock auth middleware
vi.mock('../auth-middleware.js', () => ({
  requireAuth: vi.fn(async () => ({ userId: 'test-user', isAdmin: false })),
  requireAdmin: vi.fn(async () => ({ userId: 'admin-user', isAdmin: true })),
  rateLimit: vi.fn(() => false), // Don't rate limit in tests
}));

// Mock helpers
vi.mock('../helpers.js', async () => {
  const actual = await vi.importActual('../helpers.js');
  return {
    ...actual,
    handleCorsPreflightIfNeeded: vi.fn(() => false),
  };
});

// Mock logging
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import AFTER mocks
import { handleObservabilityRoutes } from '../observability-routes.js';
// Superhuman metrics now live in services layer (proper architecture boundary)
import {
  recordSuperhumanActivation,
  getSuperhumanActivationEvents,
  getSuperhumanActivationStats,
  clearSuperhumanActivationEvents,
} from '../../services/observability/superhuman-metrics.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockRequest(options: {
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
  method?: string;
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = options.headers || {};
  req.url = options.url || '/';
  req.method = options.method || 'GET';
  // Add socket mock for rate limiting
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: '127.0.0.1',
  };
  return req;
}

function createMockResponse(): ServerResponse & { _data: string; _statusCode: number } {
  const res = {
    _data: '',
    _statusCode: 200,
    writeHead: vi.fn(function (this: typeof res, status: number) {
      this._statusCode = status;
    }),
    setHeader: vi.fn(),
    end: vi.fn(function (this: typeof res, data?: string) {
      this._data = data || '';
    }),
    writableEnded: false,
  } as unknown as ServerResponse & { _data: string; _statusCode: number };
  return res;
}

// ============================================================================
// Tests
// ============================================================================

describe('Observability Routes - Superhuman Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear superhuman events buffer for isolated tests
    clearSuperhumanActivationEvents();
  });

  describe('recordSuperhumanActivation', () => {
    it('should add event to the buffer', () => {
      const initialCount = getSuperhumanActivationEvents().length;

      recordSuperhumanActivation({
        userId: 'user-test-1',
        persona: 'ferni',
        capabilities: ['commitment_keeper', 'life_narrative'],
        cacheHit: false,
        durationMs: 150,
      });

      const events = getSuperhumanActivationEvents();
      expect(events.length).toBeGreaterThanOrEqual(initialCount);

      // Check the last event
      const lastEvent = events[events.length - 1];
      expect(lastEvent.userId).toBe('user-test-1');
      expect(lastEvent.persona).toBe('ferni');
      expect(lastEvent.capabilities).toEqual(['commitment_keeper', 'life_narrative']);
      expect(lastEvent.cacheHit).toBe(false);
      expect(lastEvent.durationMs).toBe(150);
      expect(lastEvent.timestamp).toBeDefined();
    });

    it('should add timestamp to event', () => {
      recordSuperhumanActivation({
        userId: 'user-test-2',
        persona: 'maya',
        capabilities: ['predictive_coaching'],
        cacheHit: true,
        durationMs: 50,
      });

      const events = getSuperhumanActivationEvents();
      const lastEvent = events[events.length - 1];

      // Verify timestamp is valid ISO string
      expect(new Date(lastEvent.timestamp).toISOString()).toBe(lastEvent.timestamp);
    });
  });

  describe('getSuperhumanActivationStats', () => {
    it('should calculate correct statistics', () => {
      // Emit some test events
      recordSuperhumanActivation({
        userId: 'user-stats-1',
        persona: 'ferni',
        capabilities: ['commitment_keeper'],
        cacheHit: true,
        durationMs: 100,
      });
      recordSuperhumanActivation({
        userId: 'user-stats-2',
        persona: 'maya',
        capabilities: ['predictive_coaching', 'capacity_guardian'],
        cacheHit: false,
        durationMs: 200,
      });

      const stats = getSuperhumanActivationStats();

      expect(stats.totalActivations).toBeGreaterThan(0);
      expect(typeof stats.cacheHitRate).toBe('number');
      expect(stats.cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(stats.cacheHitRate).toBeLessThanOrEqual(1);
      expect(typeof stats.avgDurationMs).toBe('number');
      expect(stats.avgDurationMs).toBeGreaterThan(0);
      expect(typeof stats.byPersona).toBe('object');
      expect(Array.isArray(stats.topCapabilities)).toBe(true);
    });

    it('should track capabilities by count', () => {
      // Emit events with overlapping capabilities
      recordSuperhumanActivation({
        userId: 'user-cap-1',
        persona: 'ferni',
        capabilities: ['commitment_keeper', 'life_narrative'],
        cacheHit: false,
        durationMs: 100,
      });
      recordSuperhumanActivation({
        userId: 'user-cap-2',
        persona: 'maya',
        capabilities: ['commitment_keeper', 'predictive_coaching'],
        cacheHit: true,
        durationMs: 100,
      });

      const stats = getSuperhumanActivationStats();

      // commitment_keeper should appear more than once
      const commitmentKeeperEntry = stats.topCapabilities.find(
        (c: { capability: string; count: number }) => c.capability === 'commitment_keeper'
      );
      expect(commitmentKeeperEntry).toBeDefined();
      expect(commitmentKeeperEntry!.count).toBeGreaterThanOrEqual(2);
    });

    it('should track personas correctly', () => {
      recordSuperhumanActivation({
        userId: 'user-persona-1',
        persona: 'jordan',
        capabilities: ['milestone_tracker'],
        cacheHit: false,
        durationMs: 100,
      });

      const stats = getSuperhumanActivationStats();

      expect(stats.byPersona['jordan']).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/observability/superhuman', () => {
    it('should return superhuman activation metrics', async () => {
      // First emit an event so there's data
      recordSuperhumanActivation({
        userId: 'user-route-1',
        persona: 'alex',
        capabilities: ['communication_intelligence'],
        cacheHit: true,
        durationMs: 75,
      });

      const req = createMockRequest({
        url: '/api/observability/superhuman',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/superhuman');

      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);

      const data = JSON.parse(res._data);
      expect(data.stats).toBeDefined();
      expect(data.recentEvents).toBeDefined();
      expect(data.count).toBeDefined();
      expect(data.collectedAt).toBeDefined();

      // Verify stats structure
      expect(typeof data.stats.totalActivations).toBe('number');
      expect(typeof data.stats.cacheHitRate).toBe('number');
      expect(typeof data.stats.avgDurationMs).toBe('number');
      expect(typeof data.stats.byPersona).toBe('object');
      expect(Array.isArray(data.stats.topCapabilities)).toBe(true);

      // Verify events structure
      expect(Array.isArray(data.recentEvents)).toBe(true);
      if (data.recentEvents.length > 0) {
        const event = data.recentEvents[data.recentEvents.length - 1];
        expect(event.userId).toBeDefined();
        expect(event.persona).toBeDefined();
        expect(event.capabilities).toBeDefined();
        expect(typeof event.cacheHit).toBe('boolean');
        expect(typeof event.durationMs).toBe('number');
        expect(event.timestamp).toBeDefined();
      }
    });

    it('should respect limit parameter', async () => {
      // Emit multiple events
      for (let i = 0; i < 10; i++) {
        recordSuperhumanActivation({
          userId: `user-limit-${i}`,
          persona: 'ferni',
          capabilities: ['commitment_keeper'],
          cacheHit: i % 2 === 0,
          durationMs: 100 + i * 10,
        });
      }

      const req = createMockRequest({
        url: '/api/observability/superhuman?limit=5',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability/superhuman');

      const data = JSON.parse(res._data);
      expect(data.count).toBeLessThanOrEqual(5);
    });

    it('should use default limit of 50 when not specified', async () => {
      const req = createMockRequest({
        url: '/api/observability/superhuman',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability/superhuman');

      const data = JSON.parse(res._data);
      // Should be at most 50 (the default limit)
      expect(data.count).toBeLessThanOrEqual(50);
    });

    it('should include ISO timestamp in collectedAt', async () => {
      const req = createMockRequest({
        url: '/api/observability/superhuman',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      await handleObservabilityRoutes(req, res, '/api/observability/superhuman');

      const data = JSON.parse(res._data);
      expect(data.collectedAt).toBeDefined();

      // Verify it's a valid ISO date string
      const date = new Date(data.collectedAt);
      expect(date.toISOString()).toBe(data.collectedAt);
    });
  });

  describe('Route matching', () => {
    it('should not handle non-observability routes', async () => {
      const req = createMockRequest({
        url: '/api/other-route',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/other-route');

      expect(handled).toBe(false);
    });

    it('should handle /api/observability/superhuman route', async () => {
      const req = createMockRequest({
        url: '/api/observability/superhuman',
        method: 'GET',
        headers: { host: 'localhost:3002' },
      });
      const res = createMockResponse();

      const handled = await handleObservabilityRoutes(req, res, '/api/observability/superhuman');

      expect(handled).toBe(true);
    });
  });
});
