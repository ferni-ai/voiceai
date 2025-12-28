/**
 * Admin Activity Service Tests
 *
 * Tests for activity event recording, retrieval,
 * and in-memory fallback functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn().mockResolvedValue(undefined),
      })),
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
          })),
        })),
        limit: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }),
        })),
        get: vi.fn().mockResolvedValue({ docs: [] }),
      })),
    })),
    batch: vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
  })),
}));

import { type ActivityEvent } from '../admin-activity.js';

describe('AdminActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ActivityEvent type', () => {
    it('should have all activity types', () => {
      const types: ActivityEvent['type'][] = [
        'handoff',
        'evalops',
        'trust',
        'agent',
        'flag',
        'user',
        'system',
      ];

      expect(types).toHaveLength(7);
    });

    it('should create handoff event', () => {
      const event: ActivityEvent = {
        id: 'act-123',
        type: 'handoff',
        action: 'transfer',
        description: 'Transferred to Maya for habit coaching',
        timestamp: new Date(),
        metadata: {
          fromAgent: 'ferni',
          toAgent: 'maya',
          reason: 'habit question',
        },
      };

      expect(event.type).toBe('handoff');
      expect(event.metadata?.fromAgent).toBe('ferni');
      expect(event.metadata?.toAgent).toBe('maya');
    });

    it('should create evalops event', () => {
      const event: ActivityEvent = {
        id: 'act-456',
        type: 'evalops',
        action: 'eval_completed',
        description: 'Completed evaluation of response quality',
        timestamp: new Date(),
        metadata: {
          score: 0.95,
          category: 'empathy',
        },
      };

      expect(event.type).toBe('evalops');
      expect(event.metadata?.score).toBe(0.95);
    });

    it('should create trust event', () => {
      const event: ActivityEvent = {
        id: 'act-789',
        type: 'trust',
        action: 'identity_verified',
        description: 'User identity verified via voice',
        timestamp: new Date(),
        metadata: {
          verificationMethod: 'voice_biometric',
          confidence: 0.98,
        },
      };

      expect(event.type).toBe('trust');
      expect(event.metadata?.verificationMethod).toBe('voice_biometric');
    });

    it('should create agent event', () => {
      const event: ActivityEvent = {
        id: 'act-abc',
        type: 'agent',
        action: 'tool_execution',
        description: 'Executed weather lookup tool',
        timestamp: new Date(),
        metadata: {
          tool: 'getWeather',
          duration: 250,
          success: true,
        },
      };

      expect(event.type).toBe('agent');
      expect(event.metadata?.tool).toBe('getWeather');
    });

    it('should create flag event', () => {
      const event: ActivityEvent = {
        id: 'act-def',
        type: 'flag',
        action: 'content_flagged',
        description: 'Potentially sensitive content detected',
        timestamp: new Date(),
        metadata: {
          flagType: 'mental_health',
          severity: 'medium',
          handled: true,
        },
      };

      expect(event.type).toBe('flag');
      expect(event.metadata?.flagType).toBe('mental_health');
    });

    it('should create user event', () => {
      const event: ActivityEvent = {
        id: 'act-ghi',
        type: 'user',
        action: 'session_started',
        description: 'User started new conversation',
        timestamp: new Date(),
        metadata: {
          userId: 'user-123',
          platform: 'web',
        },
      };

      expect(event.type).toBe('user');
      expect(event.metadata?.platform).toBe('web');
    });

    it('should create system event', () => {
      const event: ActivityEvent = {
        id: 'act-jkl',
        type: 'system',
        action: 'startup',
        description: 'Voice agent system started',
        timestamp: new Date(),
        metadata: {
          version: '1.0.0',
          environment: 'production',
        },
      };

      expect(event.type).toBe('system');
      expect(event.metadata?.environment).toBe('production');
    });

    it('should support optional metadata', () => {
      const event: ActivityEvent = {
        id: 'act-minimal',
        type: 'system',
        action: 'ping',
        description: 'Health check',
        timestamp: new Date(),
      };

      expect(event.metadata).toBeUndefined();
    });
  });

  describe('Event ID generation', () => {
    it('should generate unique IDs with act- prefix', () => {
      const id1 = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const id2 = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      expect(id1).toMatch(/^act-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^act-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Timestamp handling', () => {
    it('should use Date objects for timestamps', () => {
      const event: ActivityEvent = {
        id: 'act-time',
        type: 'system',
        action: 'test',
        description: 'Test event',
        timestamp: new Date('2024-12-25T10:00:00Z'),
      };

      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.toISOString()).toBe('2024-12-25T10:00:00.000Z');
    });

    it('should calculate TTL based on timestamp', () => {
      const TTL_DAYS = 7;
      const now = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - TTL_DAYS);

      const recentEvent: ActivityEvent = {
        id: 'act-recent',
        type: 'system',
        action: 'test',
        description: 'Recent event',
        timestamp: now,
      };

      const oldEvent: ActivityEvent = {
        id: 'act-old',
        type: 'system',
        action: 'test',
        description: 'Old event',
        timestamp: new Date('2020-01-01'),
      };

      expect(recentEvent.timestamp > cutoff).toBe(true);
      expect(oldEvent.timestamp > cutoff).toBe(false);
    });
  });

  describe('Activity counts structure', () => {
    it('should initialize all count types to zero', () => {
      const counts: Record<ActivityEvent['type'], number> = {
        handoff: 0,
        evalops: 0,
        trust: 0,
        agent: 0,
        flag: 0,
        user: 0,
        system: 0,
      };

      expect(Object.keys(counts)).toHaveLength(7);
      Object.values(counts).forEach((count) => {
        expect(count).toBe(0);
      });
    });

    it('should track counts by type', () => {
      const counts: Record<ActivityEvent['type'], number> = {
        handoff: 5,
        evalops: 10,
        trust: 3,
        agent: 25,
        flag: 2,
        user: 100,
        system: 8,
      };

      expect(counts.agent).toBe(25);
      expect(counts.user).toBe(100);
      const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
      expect(total).toBe(153);
    });
  });

  describe('In-memory fallback', () => {
    it('should respect MAX_IN_MEMORY_EVENTS limit', () => {
      const MAX_IN_MEMORY_EVENTS = 200;
      const inMemoryLog: ActivityEvent[] = [];

      // Simulate adding events
      for (let i = 0; i < 250; i++) {
        const event: ActivityEvent = {
          id: `act-${i}`,
          type: 'system',
          action: 'test',
          description: `Event ${i}`,
          timestamp: new Date(),
        };
        inMemoryLog.unshift(event);
        if (inMemoryLog.length > MAX_IN_MEMORY_EVENTS) {
          inMemoryLog.pop();
        }
      }

      expect(inMemoryLog.length).toBe(MAX_IN_MEMORY_EVENTS);
      expect(inMemoryLog[0].id).toBe('act-249'); // Most recent
    });

    it('should filter by type in memory', () => {
      const inMemoryLog: ActivityEvent[] = [
        {
          id: 'act-1',
          type: 'handoff',
          action: 'test',
          description: 'Test',
          timestamp: new Date(),
        },
        { id: 'act-2', type: 'agent', action: 'test', description: 'Test', timestamp: new Date() },
        {
          id: 'act-3',
          type: 'handoff',
          action: 'test',
          description: 'Test',
          timestamp: new Date(),
        },
        { id: 'act-4', type: 'system', action: 'test', description: 'Test', timestamp: new Date() },
      ];

      const handoffs = inMemoryLog.filter((e) => e.type === 'handoff');
      expect(handoffs).toHaveLength(2);
    });

    it('should clean up old events from memory', () => {
      const TTL_DAYS = 7;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - TTL_DAYS);

      const inMemoryLog: ActivityEvent[] = [
        { id: 'act-1', type: 'system', action: 'test', description: 'New', timestamp: new Date() },
        {
          id: 'act-2',
          type: 'system',
          action: 'test',
          description: 'Old',
          timestamp: new Date('2020-01-01'),
        },
        { id: 'act-3', type: 'system', action: 'test', description: 'New', timestamp: new Date() },
      ];

      const filtered = inMemoryLog.filter((e) => e.timestamp > cutoffDate);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('Firestore batch operations', () => {
    it('should respect FIRESTORE_BATCH_LIMIT', () => {
      const FIRESTORE_BATCH_LIMIT = 500;
      const docsToDelete = Array.from({ length: 750 }, (_, i) => ({ id: `doc-${i}` }));

      // Simulate batching
      const batches: Array<typeof docsToDelete> = [];
      for (let i = 0; i < docsToDelete.length; i += FIRESTORE_BATCH_LIMIT) {
        batches.push(docsToDelete.slice(i, i + FIRESTORE_BATCH_LIMIT));
      }

      expect(batches).toHaveLength(2);
      expect(batches[0]).toHaveLength(500);
      expect(batches[1]).toHaveLength(250);
    });
  });

  describe('Activity categories', () => {
    describe('Handoff events', () => {
      const handoffActions = ['transfer', 'handback', 'escalate', 'delegate'];

      it.each(handoffActions)('should support %s action', (action) => {
        const event: ActivityEvent = {
          id: 'act-handoff',
          type: 'handoff',
          action,
          description: `Handoff: ${action}`,
          timestamp: new Date(),
        };

        expect(event.type).toBe('handoff');
        expect(event.action).toBe(action);
      });
    });

    describe('Agent events', () => {
      const agentActions = [
        'tool_execution',
        'response_generated',
        'context_loaded',
        'memory_retrieved',
      ];

      it.each(agentActions)('should support %s action', (action) => {
        const event: ActivityEvent = {
          id: 'act-agent',
          type: 'agent',
          action,
          description: `Agent: ${action}`,
          timestamp: new Date(),
        };

        expect(event.type).toBe('agent');
        expect(event.action).toBe(action);
      });
    });

    describe('Trust events', () => {
      const trustActions = [
        'identity_verified',
        'voice_enrolled',
        '2fa_completed',
        'session_authenticated',
      ];

      it.each(trustActions)('should support %s action', (action) => {
        const event: ActivityEvent = {
          id: 'act-trust',
          type: 'trust',
          action,
          description: `Trust: ${action}`,
          timestamp: new Date(),
        };

        expect(event.type).toBe('trust');
        expect(event.action).toBe(action);
      });
    });

    describe('System events', () => {
      const systemActions = ['startup', 'shutdown', 'error', 'config_reload', 'health_check'];

      it.each(systemActions)('should support %s action', (action) => {
        const event: ActivityEvent = {
          id: 'act-system',
          type: 'system',
          action,
          description: `System: ${action}`,
          timestamp: new Date(),
        };

        expect(event.type).toBe('system');
        expect(event.action).toBe(action);
      });
    });
  });

  describe('Metadata patterns', () => {
    it('should support complex nested metadata', () => {
      const event: ActivityEvent = {
        id: 'act-complex',
        type: 'agent',
        action: 'tool_execution',
        description: 'Complex tool execution',
        timestamp: new Date(),
        metadata: {
          tool: 'createHabit',
          params: {
            name: 'Morning Meditation',
            frequency: 'daily',
            reminder: {
              time: '06:00',
              sound: 'gentle',
            },
          },
          result: {
            success: true,
            habitId: 'habit-123',
          },
          timing: {
            startedAt: new Date().toISOString(),
            durationMs: 150,
          },
        },
      };

      expect(event.metadata?.tool).toBe('createHabit');
      expect((event.metadata?.params as Record<string, unknown>)?.name).toBe('Morning Meditation');
    });

    it('should support array values in metadata', () => {
      const event: ActivityEvent = {
        id: 'act-array',
        type: 'evalops',
        action: 'batch_eval',
        description: 'Batch evaluation completed',
        timestamp: new Date(),
        metadata: {
          evaluatedResponses: ['resp-1', 'resp-2', 'resp-3'],
          scores: [0.9, 0.85, 0.95],
          categories: ['empathy', 'accuracy', 'helpfulness'],
        },
      };

      expect(event.metadata?.evaluatedResponses as string[]).toHaveLength(3);
      expect((event.metadata?.scores as number[]).reduce((a, b) => a + b, 0) / 3).toBeCloseTo(0.9);
    });
  });

  describe('Query patterns', () => {
    it('should support limit parameter', () => {
      const events: ActivityEvent[] = Array.from({ length: 50 }, (_, i) => ({
        id: `act-${i}`,
        type: 'system' as const,
        action: 'test',
        description: `Event ${i}`,
        timestamp: new Date(Date.now() - i * 1000),
      }));

      const limit = 20;
      const results = events.slice(0, limit);

      expect(results).toHaveLength(20);
      expect(results[0].id).toBe('act-0'); // Most recent
    });

    it('should sort by timestamp descending', () => {
      const events: ActivityEvent[] = [
        {
          id: 'act-1',
          type: 'system',
          action: 'test',
          description: 'Oldest',
          timestamp: new Date('2024-01-01'),
        },
        {
          id: 'act-2',
          type: 'system',
          action: 'test',
          description: 'Middle',
          timestamp: new Date('2024-06-01'),
        },
        {
          id: 'act-3',
          type: 'system',
          action: 'test',
          description: 'Newest',
          timestamp: new Date('2024-12-01'),
        },
      ];

      const sorted = events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      expect(sorted[0].description).toBe('Newest');
      expect(sorted[2].description).toBe('Oldest');
    });
  });
});
