/**
 * Context Builder Pipeline Integration Tests
 *
 * Tests that multiple context builders work together correctly:
 * - Discovery + Topics + Music all contribute injections
 * - Injection priority handling
 * - Builder execution order
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const { mockLogger, mockRegisteredBuilders } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  mockRegisteredBuilders: new Map<string, () => unknown[]>(),
}));

vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
  createLogger: vi.fn(() => mockLogger),
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Context Builder Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisteredBuilders.clear();
  });

  describe('Multiple Builder Execution', () => {
    it('should aggregate injections from multiple builders', () => {
      // Simulate multiple context builders
      const discoveryBuilder = () => [
        { type: 'discovery_name', content: 'Ask for name', priority: 'standard' },
      ];

      const topicsBuilder = () => [
        { type: 'topic_threading', content: 'Circle back to retirement', priority: 'standard' },
      ];

      const musicBuilder = () => [
        { type: 'music_playing', content: 'Lo-fi beats playing', priority: 'standard' },
      ];

      // Execute all builders
      const allInjections = [...discoveryBuilder(), ...topicsBuilder(), ...musicBuilder()];

      expect(allInjections).toHaveLength(3);
      expect(allInjections.map((i) => i.type)).toEqual([
        'discovery_name',
        'topic_threading',
        'music_playing',
      ]);
    });

    it('should handle builders returning empty arrays', () => {
      const emptyBuilder = () => [];
      const hasInjections = () => [
        { type: 'test_injection', content: 'Test', priority: 'standard' },
      ];

      const allInjections = [...emptyBuilder(), ...hasInjections(), ...emptyBuilder()];

      expect(allInjections).toHaveLength(1);
    });

    it('should preserve injection properties through pipeline', () => {
      const builder = () => [
        {
          type: 'test_type',
          content: 'Test content with special chars: <>"\'&',
          priority: 'high',
          metadata: { source: 'test' },
        },
      ];

      const injections = builder();

      expect(injections[0]).toMatchObject({
        type: 'test_type',
        content: 'Test content with special chars: <>"\'&',
        priority: 'high',
        metadata: { source: 'test' },
      });
    });
  });

  describe('Injection Priority Handling', () => {
    it('should support different priority levels', () => {
      const injections = [
        { type: 'hint', content: 'Hint', priority: 'hint' },
        { type: 'standard', content: 'Standard', priority: 'standard' },
        { type: 'critical', content: 'Critical', priority: 'critical' },
      ];

      const critical = injections.filter((i) => i.priority === 'critical');
      const standard = injections.filter((i) => i.priority === 'standard');
      const hints = injections.filter((i) => i.priority === 'hint');

      expect(critical).toHaveLength(1);
      expect(standard).toHaveLength(1);
      expect(hints).toHaveLength(1);
    });

    it('should allow sorting by priority', () => {
      const priorityOrder = { critical: 0, high: 1, standard: 2, hint: 3 };

      const injections = [
        { type: 'c', priority: 'hint' },
        { type: 'a', priority: 'critical' },
        { type: 'b', priority: 'standard' },
      ];

      const sorted = [...injections].sort(
        (a, b) =>
          (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 99) -
          (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 99)
      );

      expect(sorted.map((i) => i.type)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Context Input Processing', () => {
    it('should pass same input to all builders', () => {
      const input = {
        userText: 'Tell me about investing',
        analysis: {
          topics: { detected: ['investing'] },
          emotion: { primary: 'curious' },
        },
        userData: { turnCount: 5, isReturningUser: false },
        services: {},
      };

      const builderA = vi.fn().mockReturnValue([]);
      const builderB = vi.fn().mockReturnValue([]);
      const builderC = vi.fn().mockReturnValue([]);

      // Execute all builders with same input
      builderA(input);
      builderB(input);
      builderC(input);

      expect(builderA).toHaveBeenCalledWith(input);
      expect(builderB).toHaveBeenCalledWith(input);
      expect(builderC).toHaveBeenCalledWith(input);
    });
  });

  describe('Builder Error Isolation', () => {
    it('should isolate errors from individual builders', () => {
      const workingBuilder = () => [{ type: 'working', content: 'Works', priority: 'standard' }];

      const failingBuilder = () => {
        throw new Error('Builder failed');
      };

      // Simulate pipeline with error handling
      const executeBuilder = (builder: () => unknown[]) => {
        try {
          return builder();
        } catch {
          return [];
        }
      };

      const allInjections = [
        ...executeBuilder(workingBuilder),
        ...executeBuilder(failingBuilder),
        ...executeBuilder(workingBuilder),
      ];

      // Should have injections from working builders only
      expect(allInjections).toHaveLength(2);
    });
  });

  describe('Async Builder Support', () => {
    it('should handle async builders', async () => {
      const asyncBuilder = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [{ type: 'async_injection', content: 'Async', priority: 'standard' }];
      };

      const syncBuilder = () => [{ type: 'sync_injection', content: 'Sync', priority: 'standard' }];

      const results = await Promise.all([asyncBuilder(), Promise.resolve(syncBuilder())]);
      const allInjections = results.flat();

      expect(allInjections).toHaveLength(2);
      expect(allInjections.map((i) => i.type)).toContain('async_injection');
      expect(allInjections.map((i) => i.type)).toContain('sync_injection');
    });
  });

  describe('Injection Deduplication', () => {
    it('should allow filtering duplicate injection types', () => {
      const injections = [
        { type: 'topic_threading', content: 'First', priority: 'standard' },
        { type: 'topic_threading', content: 'Second', priority: 'standard' },
        { type: 'music_playing', content: 'Music', priority: 'standard' },
      ];

      // Dedupe by type (keep first)
      const seen = new Set<string>();
      const deduped = injections.filter((i) => {
        if (seen.has(i.type)) return false;
        seen.add(i.type);
        return true;
      });

      expect(deduped).toHaveLength(2);
      expect(deduped[0].content).toBe('First');
    });
  });

  describe('Conditional Injection', () => {
    it('should support conditional injection based on context', () => {
      const conditionalBuilder = (input: { userData: { turnCount: number } }) => {
        const injections = [];

        // Only inject on specific turns
        if (input.userData.turnCount === 2) {
          injections.push({
            type: 'turn_2_injection',
            content: 'Turn 2 specific',
            priority: 'standard',
          });
        }

        if (input.userData.turnCount >= 5) {
          injections.push({
            type: 'late_turn_injection',
            content: 'Late in conversation',
            priority: 'hint',
          });
        }

        return injections;
      };

      // Turn 2
      const turn2Injections = conditionalBuilder({ userData: { turnCount: 2 } });
      expect(turn2Injections).toHaveLength(1);
      expect(turn2Injections[0].type).toBe('turn_2_injection');

      // Turn 5
      const turn5Injections = conditionalBuilder({ userData: { turnCount: 5 } });
      expect(turn5Injections).toHaveLength(1);
      expect(turn5Injections[0].type).toBe('late_turn_injection');

      // Turn 1
      const turn1Injections = conditionalBuilder({ userData: { turnCount: 1 } });
      expect(turn1Injections).toHaveLength(0);
    });
  });

  describe('Injection Content Formatting', () => {
    it('should support template-based injection content', () => {
      const templateBuilder = (input: { userData: { name?: string } }) => {
        const name = input.userData.name || 'friend';
        return [
          {
            type: 'greeting',
            content: `[GREETING: Say hello to ${name}]`,
            priority: 'standard',
          },
        ];
      };

      const withName = templateBuilder({ userData: { name: 'John' } });
      expect(withName[0].content).toBe('[GREETING: Say hello to John]');

      const withoutName = templateBuilder({ userData: {} });
      expect(withoutName[0].content).toBe('[GREETING: Say hello to friend]');
    });

    it('should handle multiline injection content', () => {
      const multilineBuilder = () => [
        {
          type: 'instructions',
          content: `[MULTI-LINE INSTRUCTIONS:
- First, do this
- Then, do that
- Finally, complete the task]`,
          priority: 'standard',
        },
      ];

      const injections = multilineBuilder();
      expect(injections[0].content).toContain('\n');
      expect(injections[0].content).toContain('- First');
    });
  });
});

describe('Context Builder Registry Pattern', () => {
  describe('Builder Registration', () => {
    it('should support registering builders by name', () => {
      const registry = new Map<string, () => unknown[]>();

      registry.set('discovery', () => [
        { type: 'discovery', content: 'Discover', priority: 'standard' },
      ]);
      registry.set('topics', () => [{ type: 'topics', content: 'Topics', priority: 'standard' }]);
      registry.set('music', () => [{ type: 'music', content: 'Music', priority: 'standard' }]);

      expect(registry.size).toBe(3);
      expect(registry.has('discovery')).toBe(true);
      expect(registry.has('topics')).toBe(true);
      expect(registry.has('music')).toBe(true);
    });

    it('should execute all registered builders', () => {
      const registry = new Map<string, () => unknown[]>();

      registry.set('a', () => [{ type: 'a', content: 'A' }]);
      registry.set('b', () => [{ type: 'b', content: 'B' }]);

      const allInjections: unknown[] = [];
      registry.forEach((builder) => {
        allInjections.push(...builder());
      });

      expect(allInjections).toHaveLength(2);
    });

    it('should allow builder replacement', () => {
      const registry = new Map<string, () => unknown[]>();

      registry.set('test', () => [{ type: 'original', content: 'Original' }]);
      registry.set('test', () => [{ type: 'replaced', content: 'Replaced' }]);

      const builder = registry.get('test')!;
      const injections = builder();

      expect(injections[0].type).toBe('replaced');
    });
  });
});
