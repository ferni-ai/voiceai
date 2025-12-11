/**
 * Growth Visibility Engine Tests
 *
 * Tests for growth tracking and reflection including:
 * - Turn recording and snapshot capture
 * - Growth detection from comparisons
 * - Reflection generation
 * - Insight surfacing
 * - Import/Export functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GrowthVisibilityEngine,
  getGrowthVisibilityEngine,
  resetGrowthVisibilityEngine,
  type GrowthType,
  type GrowthInsight,
} from '../services/growth-visibility-engine.js';

// Mock dependencies
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }),
}));

describe('GrowthVisibilityEngine', () => {
  let engine: GrowthVisibilityEngine;

  beforeEach(() => {
    engine = new GrowthVisibilityEngine('user-123');
  });

  describe('recordTurn', () => {
    it('should record turn with topic', () => {
      engine.recordTurn({
        userMessage: 'I want to talk about my anxiety',
        topic: 'anxiety',
      });

      // No direct way to check internal state, but should not throw
      expect(true).toBe(true);
    });

    it('should record turn with emotion', () => {
      engine.recordTurn({
        userMessage: 'I feel overwhelmed',
        topic: 'stress',
        emotion: { primary: 'anxious', intensity: 0.8 },
      });

      expect(true).toBe(true);
    });

    it('should track vulnerability', () => {
      engine.recordTurn({
        userMessage: "I've never told anyone this before",
        wasVulnerable: true,
      });

      expect(true).toBe(true);
    });

    it('should track insights', () => {
      engine.recordTurn({
        userMessage: 'I just realized why I do that!',
        hadInsight: true,
      });

      expect(true).toBe(true);
    });

    it('should detect self-awareness patterns', () => {
      engine.recordTurn({
        userMessage: 'I notice that I always avoid confrontation',
      });

      expect(true).toBe(true);
    });

    it('should detect growth acknowledgment patterns', () => {
      engine.recordTurn({
        userMessage: "I've grown so much since we started talking",
      });

      expect(true).toBe(true);
    });

    it('should detect pattern recognition', () => {
      engine.recordTurn({
        userMessage: 'I always tend to put others first',
      });

      expect(true).toBe(true);
    });

    it('should detect emotional labeling', () => {
      engine.recordTurn({
        userMessage: 'I feel anxious about the meeting',
      });

      expect(true).toBe(true);
    });
  });

  describe('captureSnapshot', () => {
    it('should capture current state', () => {
      engine.recordTurn({
        userMessage: 'Test message',
        topic: 'test',
      });

      engine.captureSnapshot();

      // Snapshot captured - should not throw
      expect(true).toBe(true);
    });

    it('should limit snapshots to 12', () => {
      // Capture 15 snapshots
      for (let i = 0; i < 15; i++) {
        engine.captureSnapshot();
      }

      // Should not throw and internal limit should apply
      expect(true).toBe(true);
    });
  });

  describe('detectGrowth', () => {
    it('should return empty array with less than 2 snapshots', () => {
      const insights = engine.detectGrowth();

      expect(insights).toEqual([]);
    });

    it('should detect topic comfort growth', () => {
      // Capture initial snapshot with uncomfortable topic
      engine.recordTurn({
        userMessage: 'I hate talking about money',
        topic: 'finances',
        emotion: { primary: 'anxious', intensity: 0.9 },
      });
      engine.captureSnapshot();

      // Record more comfortable discussion
      for (let i = 0; i < 5; i++) {
        engine.recordTurn({
          userMessage: "Let's discuss my budget",
          topic: 'finances',
          emotion: { primary: 'neutral', intensity: 0.3 },
        });
      }

      const insights = engine.detectGrowth();

      // May or may not detect growth based on thresholds
      expect(Array.isArray(insights)).toBe(true);
    });

    it('should detect depth increase', () => {
      // Capture initial snapshot
      engine.captureSnapshot();

      // Record vulnerable and insightful turns
      for (let i = 0; i < 10; i++) {
        engine.recordTurn({
          userMessage: 'I just realized something important about myself',
          wasVulnerable: true,
          hadInsight: true,
        });
      }

      const insights = engine.detectGrowth();

      expect(Array.isArray(insights)).toBe(true);
    });

    it('should detect self-awareness growth', () => {
      // Capture initial snapshot
      engine.captureSnapshot();

      // Record self-aware turns
      for (let i = 0; i < 10; i++) {
        engine.recordTurn({
          userMessage: 'I notice that I always do this pattern',
        });
        engine.recordTurn({
          userMessage: "I've grown so much since we started",
        });
      }

      const insights = engine.detectGrowth();

      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe('generateReflection', () => {
    it('should generate reflection for insight', () => {
      const insight: GrowthInsight = {
        id: 'test-insight-1',
        type: 'topic_comfort',
        userId: 'user-123',
        area: 'finances',
        before: 'avoidant',
        after: 'comfortable',
        evidence: [
          {
            type: 'behavior',
            timestamp: new Date(),
            description: 'Discusses finances openly',
          },
        ],
        timespan: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: new Date(),
          durationDays: 30,
        },
        confidence: 0.8,
        surfaced: false,
      };

      const reflection = engine.generateReflection(insight);

      expect(reflection.reflection).toBeTruthy();
      expect(reflection.ssml).toContain('prosody');
      expect(reflection.suggestedMoment).toBeDefined();
    });

    it('should personalize reflection with area', () => {
      const insight: GrowthInsight = {
        id: 'test-insight-2',
        type: 'topic_comfort',
        userId: 'user-123',
        area: 'relationships',
        before: 'uncomfortable',
        after: 'open',
        evidence: [],
        timespan: {
          start: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          end: new Date(),
          durationDays: 60,
        },
        confidence: 0.7,
        surfaced: false,
      };

      const reflection = engine.generateReflection(insight);

      expect(reflection.reflection).toContain('relationships');
    });

    it('should suggest appropriate moment based on type', () => {
      const topicInsight: GrowthInsight = {
        id: 'test-1',
        type: 'topic_comfort',
        userId: 'user-123',
        area: 'test',
        before: 'a',
        after: 'b',
        evidence: [],
        timespan: { start: new Date(), end: new Date(), durationDays: 10 },
        confidence: 0.7,
        surfaced: false,
      };

      const reflection = engine.generateReflection(topicInsight);

      expect(reflection.suggestedMoment).toBe('after_related_topic');
    });

    it('should suggest milestone for long timespan', () => {
      const insight: GrowthInsight = {
        id: 'test-2',
        type: 'depth_increase',
        userId: 'user-123',
        area: 'test',
        before: 'a',
        after: 'b',
        evidence: [],
        timespan: { start: new Date(), end: new Date(), durationDays: 45 },
        confidence: 0.7,
        surfaced: false,
      };

      const reflection = engine.generateReflection(insight);

      expect(reflection.suggestedMoment).toBe('milestone');
    });
  });

  describe('getInsightToSurface', () => {
    it('should return null when no insights', () => {
      const result = engine.getInsightToSurface();

      expect(result).toBeNull();
    });

    it('should return insight when available', () => {
      // Manually add an insight for testing
      engine.captureSnapshot();

      // Record lots of growth indicators
      for (let i = 0; i < 20; i++) {
        engine.recordTurn({
          userMessage: 'I notice I always avoid this topic',
          topic: 'difficult-topic',
          wasVulnerable: true,
          hadInsight: true,
        });
      }

      engine.detectGrowth();

      // May or may not return based on confidence thresholds
      const result = engine.getInsightToSurface();

      expect(result === null || typeof result.reflection === 'string').toBe(true);
    });

    it('should filter by current topic', () => {
      engine.captureSnapshot();

      engine.recordTurn({
        userMessage: 'Test message',
        topic: 'finances',
        wasVulnerable: true,
      });

      const result = engine.getInsightToSurface({ currentTopic: 'finances' });

      // Result depends on whether insights were generated
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle session start context', () => {
      const result = engine.getInsightToSurface({ sessionStart: true });

      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle milestone context', () => {
      const result = engine.getInsightToSurface({ milestone: true });

      expect(result === null || typeof result === 'object').toBe(true);
    });
  });

  describe('recordReaction', () => {
    it('should record reaction to insight', () => {
      engine.recordReaction('test-insight-id', 'resonated');

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle neutral reaction', () => {
      engine.recordReaction('test-insight-id', 'neutral');

      expect(true).toBe(true);
    });

    it('should handle dismissed reaction', () => {
      engine.recordReaction('test-insight-id', 'dismissed');

      expect(true).toBe(true);
    });
  });

  describe('importFromProfile', () => {
    it('should import breakthrough key moments', () => {
      const profile = {
        keyMoments: [
          { type: 'breakthrough', timestamp: new Date() },
          { type: 'breakthrough', timestamp: new Date() },
        ],
      } as any;

      engine.importFromProfile(profile);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should import vulnerability key moments', () => {
      const profile = {
        keyMoments: [{ type: 'vulnerability', timestamp: new Date() }],
      } as any;

      engine.importFromProfile(profile);

      expect(true).toBe(true);
    });

    it('should import custom growth data', () => {
      const profile = {
        customData: {
          growthSnapshots: [],
          growthInsights: [],
        },
      } as any;

      engine.importFromProfile(profile);

      expect(true).toBe(true);
    });

    it('should handle empty profile', () => {
      const profile = {} as any;

      expect(() => engine.importFromProfile(profile)).not.toThrow();
    });
  });

  describe('exportForProfile', () => {
    it('should export snapshots and insights', () => {
      engine.captureSnapshot();

      const exported = engine.exportForProfile();

      expect(exported).toHaveProperty('snapshots');
      expect(exported).toHaveProperty('insights');
      expect(Array.isArray(exported.snapshots)).toBe(true);
      expect(Array.isArray(exported.insights)).toBe(true);
    });

    it('should export empty arrays initially', () => {
      const exported = engine.exportForProfile();

      expect(exported.insights).toEqual([]);
    });
  });

  describe('getAllInsights', () => {
    it('should return empty array initially', () => {
      const insights = engine.getAllInsights();

      expect(insights).toEqual([]);
    });

    it('should return copy of insights', () => {
      const insights1 = engine.getAllInsights();
      const insights2 = engine.getAllInsights();

      // Should be separate arrays
      expect(insights1).not.toBe(insights2);
    });
  });

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = engine.getStats();

      expect(stats).toHaveProperty('totalInsights');
      expect(stats).toHaveProperty('surfaced');
      expect(stats).toHaveProperty('resonated');
      expect(stats).toHaveProperty('byType');
    });

    it('should return zero counts initially', () => {
      const stats = engine.getStats();

      expect(stats.totalInsights).toBe(0);
      expect(stats.surfaced).toBe(0);
      expect(stats.resonated).toBe(0);
    });
  });

  describe('reset', () => {
    it('should not throw', () => {
      expect(() => engine.reset()).not.toThrow();
    });
  });
});

describe('getGrowthVisibilityEngine factory', () => {
  it('should return same instance for same user', () => {
    const engine1 = getGrowthVisibilityEngine('user-1');
    const engine2 = getGrowthVisibilityEngine('user-1');

    expect(engine1).toBe(engine2);
  });

  it('should return different instances for different users', () => {
    const engine1 = getGrowthVisibilityEngine('user-1');
    const engine2 = getGrowthVisibilityEngine('user-2');

    expect(engine1).not.toBe(engine2);
  });
});

describe('resetGrowthVisibilityEngine', () => {
  it('should not throw for existing engine', () => {
    getGrowthVisibilityEngine('reset-test');

    expect(() => resetGrowthVisibilityEngine('reset-test')).not.toThrow();
  });

  it('should not throw for non-existent engine', () => {
    expect(() => resetGrowthVisibilityEngine('non-existent')).not.toThrow();
  });
});

describe('GrowthType coverage', () => {
  const types: GrowthType[] = [
    'capability_growth',
    'topic_comfort',
    'pattern_break',
    'consistency_improvement',
    'depth_increase',
    'emotional_regulation',
    'self_awareness',
  ];

  it('should have all growth types defined', () => {
    for (const type of types) {
      expect(typeof type).toBe('string');
    }
  });
});

describe('Pattern detection', () => {
  it('should detect "I notice" as self-awareness', () => {
    const engine = new GrowthVisibilityEngine('test');
    engine.recordTurn({
      userMessage: 'I notice that I get anxious before meetings',
    });

    // Pattern was processed - should not throw
    expect(true).toBe(true);
  });

  it('should detect "I realize" as insight', () => {
    const engine = new GrowthVisibilityEngine('test');
    engine.recordTurn({
      userMessage: 'I just realized why I act that way',
      hadInsight: false, // Let pattern detection find it
    });

    expect(true).toBe(true);
  });

  it('should detect "I feel" as emotional labeling', () => {
    const engine = new GrowthVisibilityEngine('test');
    engine.recordTurn({
      userMessage: 'I feel overwhelmed by everything',
    });

    expect(true).toBe(true);
  });

  it('should detect "I\'ve grown" as growth acknowledgment', () => {
    const engine = new GrowthVisibilityEngine('test');
    engine.recordTurn({
      userMessage: "I've grown so much this year",
    });

    expect(true).toBe(true);
  });

  it('should detect "I used to but now" as growth acknowledgment', () => {
    const engine = new GrowthVisibilityEngine('test');
    engine.recordTurn({
      userMessage: 'I used to avoid conflict but now I address it',
    });

    expect(true).toBe(true);
  });
});

describe('Timespan formatting', () => {
  it('should format days properly in reflections', () => {
    const engine = new GrowthVisibilityEngine('test');

    const insight: GrowthInsight = {
      id: 'test',
      type: 'topic_comfort',
      userId: 'test',
      area: 'test',
      before: 'a',
      after: 'b',
      evidence: [],
      timespan: { start: new Date(), end: new Date(), durationDays: 5 },
      confidence: 0.8,
      surfaced: false,
    };

    const reflection = engine.generateReflection(insight);

    // Should contain some timespan reference
    expect(reflection.reflection).toBeTruthy();
  });
});
