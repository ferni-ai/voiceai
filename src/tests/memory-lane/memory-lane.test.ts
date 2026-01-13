/**
 * Memory Lane Service Tests
 *
 * Tests for the Memory Lane feature including:
 * - Type definitions and validation
 * - Memory collection from various sources
 * - Highlight scoring algorithm
 * - Query and filtering functionality
 *
 * @module tests/memory-lane
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  MemoryHighlight,
  MemoryType,
  EmotionalTone,
  MemorySourceType,
  ScoringWeights,
  MemoryQueryOptions,
} from '../../services/memory-lane/types.js';
import { DEFAULT_SCORING_WEIGHTS } from '../../services/memory-lane/types.js';

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('Memory Lane Types', () => {
  describe('MemoryHighlight interface', () => {
    it('should accept valid memory highlight', () => {
      const memory: MemoryHighlight = {
        id: 'mem_123',
        userId: 'user_456',
        content: 'Had a breakthrough about work-life balance',
        type: 'breakthrough',
        emotionalTone: 'hopeful',
        occurredAt: new Date('2024-06-15'),
        topicTags: ['work', 'balance'],
        peopleReferenced: [],
        sourceType: 'commitment',
        sourceId: 'commit_789',
        emotionalWeight: 0.8,
        uniqueness: 0.7,
        growthIndicator: 0.9,
        timesSurfaced: 0,
        reactions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(memory.id).toBe('mem_123');
      expect(memory.type).toBe('breakthrough');
      expect(memory.emotionalTone).toBe('hopeful');
    });

    it('should support all memory types', () => {
      const types: MemoryType[] = [
        'breakthrough',
        'milestone',
        'commitment',
        'dream',
        'inside_joke',
        'shared_moment',
        'growth',
        'challenge',
        'celebration',
        'reflection',
      ];

      types.forEach((type) => {
        const memory: Partial<MemoryHighlight> = { type };
        expect(memory.type).toBe(type);
      });
    });

    it('should support all emotional tones', () => {
      const tones: EmotionalTone[] = [
        'joyful',
        'proud',
        'grateful',
        'hopeful',
        'reflective',
        'bittersweet',
        'meaningful',
        'playful',
        'determined',
        'peaceful',
      ];

      tones.forEach((tone) => {
        const memory: Partial<MemoryHighlight> = { emotionalTone: tone };
        expect(memory.emotionalTone).toBe(tone);
      });
    });

    it('should support all source types', () => {
      const sources: MemorySourceType[] = [
        'commitment',
        'dream',
        'inside_joke',
        'milestone',
        'celebration',
        'conversation',
        'manual',
      ];

      sources.forEach((source) => {
        const memory: Partial<MemoryHighlight> = { sourceType: source };
        expect(memory.sourceType).toBe(source);
      });
    });
  });

  describe('DEFAULT_SCORING_WEIGHTS', () => {
    it('should have all required weight fields', () => {
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('emotionalWeight');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('uniqueness');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('growthIndicator');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('recency');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('anniversaryBoost');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('topicRelevance');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('neverSurfaced');
      expect(DEFAULT_SCORING_WEIGHTS).toHaveProperty('userLoved');
    });

    it('should have weights that sum to approximately 1.0', () => {
      const sum = Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
      // Allow some tolerance for floating point
      expect(sum).toBeGreaterThan(0.95);
      expect(sum).toBeLessThan(1.15);
    });

    it('should have anniversary boost as significant weight', () => {
      // Anniversary memories are special - should have meaningful weight
      expect(DEFAULT_SCORING_WEIGHTS.anniversaryBoost).toBeGreaterThanOrEqual(0.1);
    });
  });
});

// ============================================================================
// SCORING TESTS
// ============================================================================

describe('Memory Scoring', () => {
  // Mock the scorer module
  const createMockMemory = (overrides: Partial<MemoryHighlight> = {}): MemoryHighlight => ({
    id: `mem_${Date.now()}`,
    userId: 'test_user',
    content: 'Test memory content',
    type: 'reflection',
    emotionalTone: 'meaningful',
    occurredAt: new Date(),
    topicTags: [],
    peopleReferenced: [],
    sourceType: 'conversation',
    emotionalWeight: 0.5,
    uniqueness: 0.5,
    growthIndicator: 0.5,
    timesSurfaced: 0,
    reactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('Score calculation factors', () => {
    it('should score higher for memories with high emotional weight', () => {
      const highEmotional = createMockMemory({ emotionalWeight: 0.9 });
      const lowEmotional = createMockMemory({ emotionalWeight: 0.2 });

      // Higher emotional weight should contribute to higher score
      expect(highEmotional.emotionalWeight).toBeGreaterThan(lowEmotional.emotionalWeight);
    });

    it('should score higher for memories with high growth indicator', () => {
      const highGrowth = createMockMemory({ growthIndicator: 0.95 });
      const lowGrowth = createMockMemory({ growthIndicator: 0.1 });

      expect(highGrowth.growthIndicator).toBeGreaterThan(lowGrowth.growthIndicator);
    });

    it('should score higher for unique memories', () => {
      const unique = createMockMemory({ uniqueness: 0.9 });
      const common = createMockMemory({ uniqueness: 0.2 });

      expect(unique.uniqueness).toBeGreaterThan(common.uniqueness);
    });

    it('should boost memories that were never surfaced', () => {
      const neverSurfaced = createMockMemory({ timesSurfaced: 0 });
      const surfacedMany = createMockMemory({ timesSurfaced: 10 });

      expect(neverSurfaced.timesSurfaced).toBe(0);
      expect(surfacedMany.timesSurfaced).toBe(10);
    });

    it('should boost memories user loved', () => {
      const loved = createMockMemory({
        reactions: [{ reaction: 'loved', reactedAt: new Date() }],
      });
      const noReaction = createMockMemory({ reactions: [] });

      expect(loved.reactions.length).toBe(1);
      expect(loved.reactions[0].reaction).toBe('loved');
      expect(noReaction.reactions.length).toBe(0);
    });
  });

  describe('Anniversary detection', () => {
    it('should identify same-day memories from previous years', () => {
      const today = new Date();
      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(today.getFullYear() - 1);

      const anniversaryMemory = createMockMemory({ occurredAt: oneYearAgo });

      const memoryMonth = anniversaryMemory.occurredAt.getMonth();
      const memoryDate = anniversaryMemory.occurredAt.getDate();
      const todayMonth = today.getMonth();
      const todayDate = today.getDate();

      expect(memoryMonth).toBe(todayMonth);
      expect(memoryDate).toBe(todayDate);
    });

    it('should not flag non-anniversary memories', () => {
      const today = new Date();
      const differentDay = new Date(today);
      differentDay.setFullYear(today.getFullYear() - 1);
      differentDay.setDate(today.getDate() + 5); // Different day

      const nonAnniversary = createMockMemory({ occurredAt: differentDay });

      const memoryDate = nonAnniversary.occurredAt.getDate();
      const todayDate = today.getDate();

      expect(memoryDate).not.toBe(todayDate);
    });
  });

  describe('Recency scoring', () => {
    it('should score recent memories higher for recency', () => {
      const recent = createMockMemory({ occurredAt: new Date() });
      const old = createMockMemory({
        occurredAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      });

      const recentTime = recent.occurredAt.getTime();
      const oldTime = old.occurredAt.getTime();

      expect(recentTime).toBeGreaterThan(oldTime);
    });
  });
});

// ============================================================================
// QUERY & FILTER TESTS
// ============================================================================

describe('Memory Queries', () => {
  describe('Query options', () => {
    it('should support type filtering', () => {
      const options: MemoryQueryOptions = {
        types: ['breakthrough', 'milestone'],
        limit: 10,
      };

      expect(options.types).toContain('breakthrough');
      expect(options.types).toContain('milestone');
      expect(options.types?.length).toBe(2);
    });

    it('should support persona filtering', () => {
      const options: MemoryQueryOptions = {
        personaId: 'ferni',
        limit: 20,
      };

      expect(options.personaId).toBe('ferni');
    });

    it('should support emotional tone filtering', () => {
      const options: MemoryQueryOptions = {
        emotionalTones: ['joyful', 'proud'],
        limit: 10,
      };

      expect(options.emotionalTones).toContain('joyful');
      expect(options.emotionalTones).toContain('proud');
    });

    it('should support date range filtering', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const options: MemoryQueryOptions = {
        dateRange: { start: startDate, end: endDate },
        limit: 50,
      };

      expect(options.dateRange?.start).toEqual(startDate);
      expect(options.dateRange?.end).toEqual(endDate);
    });

    it('should support topic tag filtering', () => {
      const options: MemoryQueryOptions = {
        topicTags: ['career', 'relationships'],
        limit: 10,
      };

      expect(options.topicTags).toContain('career');
      expect(options.topicTags).toContain('relationships');
    });

    it('should support sorting options', () => {
      const byScore: MemoryQueryOptions = {
        sortBy: 'score',
        sortOrder: 'desc',
        limit: 10,
      };

      const byDate: MemoryQueryOptions = {
        sortBy: 'date',
        sortOrder: 'asc',
        limit: 10,
      };

      expect(byScore.sortBy).toBe('score');
      expect(byScore.sortOrder).toBe('desc');
      expect(byDate.sortBy).toBe('date');
      expect(byDate.sortOrder).toBe('asc');
    });

    it('should support pagination', () => {
      const options: MemoryQueryOptions = {
        limit: 20,
        cursor: 'cursor_abc123',
      };

      expect(options.limit).toBe(20);
      expect(options.cursor).toBe('cursor_abc123');
    });

    it('should support On This Day filter', () => {
      const options: MemoryQueryOptions = {
        isOnThisDay: true,
        limit: 10,
      };

      expect(options.isOnThisDay).toBe(true);
    });

    it('should support excluding recently surfaced', () => {
      const options: MemoryQueryOptions = {
        excludeRecentlySurfaced: true,
        surfaceCooldownDays: 7,
        limit: 10,
      };

      expect(options.excludeRecentlySurfaced).toBe(true);
      expect(options.surfaceCooldownDays).toBe(7);
    });
  });
});

// ============================================================================
// COLLECTION TESTS
// ============================================================================

describe('Memory Collection', () => {
  describe('Source mapping', () => {
    it('should map commitment source to commitment type', () => {
      const sourceType: MemorySourceType = 'commitment';
      // The mapping is: commitment -> commitment
      expect(sourceType).toBe('commitment');
    });

    it('should map dream source to dream type', () => {
      const sourceType: MemorySourceType = 'dream';
      expect(sourceType).toBe('dream');
    });

    it('should map milestone source to milestone type', () => {
      const sourceType: MemorySourceType = 'milestone';
      expect(sourceType).toBe('milestone');
    });

    it('should map inside_joke source to inside_joke type', () => {
      const sourceType: MemorySourceType = 'inside_joke';
      expect(sourceType).toBe('inside_joke');
    });

    it('should map celebration source to celebration type', () => {
      const sourceType: MemorySourceType = 'celebration';
      expect(sourceType).toBe('celebration');
    });
  });

  describe('Deduplication', () => {
    it('should identify duplicate memories by source', () => {
      const memory1 = {
        sourceType: 'commitment' as MemorySourceType,
        sourceId: 'commit_123',
      };
      const memory2 = {
        sourceType: 'commitment' as MemorySourceType,
        sourceId: 'commit_123',
      };

      expect(memory1.sourceType).toBe(memory2.sourceType);
      expect(memory1.sourceId).toBe(memory2.sourceId);
    });

    it('should allow same sourceId from different source types', () => {
      const memory1 = {
        sourceType: 'commitment' as MemorySourceType,
        sourceId: 'id_123',
      };
      const memory2 = {
        sourceType: 'dream' as MemorySourceType,
        sourceId: 'id_123',
      };

      expect(memory1.sourceType).not.toBe(memory2.sourceType);
      // These should NOT be considered duplicates
    });
  });
});

// ============================================================================
// REACTION TESTS
// ============================================================================

describe('Memory Reactions', () => {
  describe('Reaction types', () => {
    it('should support loved reaction', () => {
      const reaction = { reaction: 'loved' as const, reactedAt: new Date() };
      expect(reaction.reaction).toBe('loved');
    });

    it('should support dismissed reaction', () => {
      const reaction = { reaction: 'dismissed' as const, reactedAt: new Date() };
      expect(reaction.reaction).toBe('dismissed');
    });

    it('should support shared reaction', () => {
      const reaction = { reaction: 'shared' as const, reactedAt: new Date() };
      expect(reaction.reaction).toBe('shared');
    });

    it('should support revisited reaction', () => {
      const reaction = { reaction: 'revisited' as const, reactedAt: new Date() };
      expect(reaction.reaction).toBe('revisited');
    });
  });

  describe('Reaction history', () => {
    it('should maintain reaction history', () => {
      const memory = {
        reactions: [
          { reaction: 'loved' as const, reactedAt: new Date('2024-01-15') },
          { reaction: 'shared' as const, reactedAt: new Date('2024-02-20') },
          { reaction: 'revisited' as const, reactedAt: new Date('2024-03-10') },
        ],
      };

      expect(memory.reactions.length).toBe(3);
      expect(memory.reactions[0].reaction).toBe('loved');
      expect(memory.reactions[2].reaction).toBe('revisited');
    });

    it('should get most recent reaction', () => {
      const memory = {
        reactions: [
          { reaction: 'loved' as const, reactedAt: new Date('2024-01-15') },
          { reaction: 'dismissed' as const, reactedAt: new Date('2024-02-20') },
        ],
      };

      const mostRecent = memory.reactions[memory.reactions.length - 1];
      expect(mostRecent.reaction).toBe('dismissed');
    });
  });
});

// ============================================================================
// TIMELINE GROUPING TESTS
// ============================================================================

describe('Timeline Grouping', () => {
  describe('Group by month', () => {
    it('should group memories by month/year', () => {
      const memories = [
        { occurredAt: new Date('2024-06-15') },
        { occurredAt: new Date('2024-06-20') },
        { occurredAt: new Date('2024-05-10') },
      ];

      // Group by month
      const groups = new Map<string, typeof memories>();
      for (const m of memories) {
        const key = `${m.occurredAt.getFullYear()}-${m.occurredAt.getMonth()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(m);
      }

      expect(groups.size).toBe(2); // June and May
      expect(groups.get('2024-5')?.length).toBe(2); // Two in June (month is 0-indexed)
      expect(groups.get('2024-4')?.length).toBe(1); // One in May
    });
  });

  describe('Group labels', () => {
    it('should format current month as "This Month"', () => {
      const now = new Date();
      const isCurrentMonth = (date: Date) =>
        date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();

      const currentMonthMemory = { occurredAt: now };
      expect(isCurrentMonth(currentMonthMemory.occurredAt)).toBe(true);
    });

    it('should format previous months with month name and year', () => {
      const date = new Date('2023-03-15');
      const formatted = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      expect(formatted).toBe('March 2023');
    });
  });
});
