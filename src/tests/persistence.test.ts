/**
 * Shared Persistence Utilities Tests
 *
 * Tests for the persistence layer used by domain tools:
 * - persistInsight
 * - persistKeyMoment
 * - persistTrackedItem
 * - addToSessionContext
 * - queryPastKnowledge
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  persistInsight,
  persistKeyMoment,
  persistTrackedItem,
  addToSessionContext,
  queryPastKnowledge,
  type ToolCtxWithUserData,
} from '../tools/domains/shared/persistence.js';

// Mock the logger
vi.mock('../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ============================================================================
// HELPERS
// ============================================================================

function createToolCtx(
  overrides: Partial<ToolCtxWithUserData['userData']> = {}
): ToolCtxWithUserData {
  return {
    userData: {
      name: 'Test User',
      keyMoments: [],
      topics: [],
      services: {},
      ...overrides,
    },
  };
}

// ============================================================================
// PERSIST INSIGHT TESTS
// ============================================================================

describe('persistInsight', () => {
  it('should return false when no captureInsight service', () => {
    const ctx = createToolCtx();

    const result = persistInsight(ctx, {
      domain: 'health',
      type: 'exercise_log',
      data: { activity: 'running' },
    });

    expect(result).toBe(false);
  });

  it('should return false when userData is undefined', () => {
    const ctx: ToolCtxWithUserData = {};

    const result = persistInsight(ctx, {
      domain: 'health',
      type: 'exercise_log',
      data: { activity: 'running' },
    });

    expect(result).toBe(false);
  });

  it('should call captureInsight with correct parameters', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    const result = persistInsight(ctx, {
      domain: 'health',
      type: 'exercise_log',
      data: { activity: 'running', duration: 30 },
      confidence: 0.9,
    });

    expect(result).toBe(true);
    expect(mockCaptureInsight).toHaveBeenCalledWith(
      'exercise_log',
      'health_exercise_log',
      JSON.stringify({ activity: 'running', duration: 30 }),
      0.9
    );
  });

  it('should use default confidence of 0.7', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    persistInsight(ctx, {
      domain: 'finance',
      type: 'preference',
      data: { savingsGoal: 1000 },
    });

    expect(mockCaptureInsight).toHaveBeenCalledWith(
      'preference',
      'finance_preference',
      expect.any(String),
      0.7
    );
  });

  it('should return false and handle errors gracefully', () => {
    const mockCaptureInsight = vi.fn(() => {
      throw new Error('Service error');
    });
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    const result = persistInsight(ctx, {
      domain: 'test',
      type: 'test',
      data: {},
    });

    expect(result).toBe(false);
  });
});

// ============================================================================
// PERSIST KEY MOMENT TESTS
// ============================================================================

describe('persistKeyMoment', () => {
  it('should add moment to session keyMoments', () => {
    const ctx = createToolCtx({ keyMoments: [] });

    persistKeyMoment(ctx, {
      domain: 'career',
      type: 'breakthrough',
      summary: 'Got the promotion!',
    });

    expect(ctx.userData!.keyMoments).toContain('[career/breakthrough] Got the promotion!');
  });

  it('should initialize keyMoments array if not present', () => {
    const ctx: ToolCtxWithUserData = {
      userData: {
        services: {},
      },
    };

    persistKeyMoment(ctx, {
      domain: 'personal',
      type: 'milestone',
      summary: 'Finished marathon',
    });

    expect(ctx.userData!.keyMoments).toBeDefined();
    expect(ctx.userData!.keyMoments!.length).toBe(1);
  });

  it('should return false when no learningEngine service', () => {
    const ctx = createToolCtx();

    const result = persistKeyMoment(ctx, {
      domain: 'health',
      type: 'milestone',
      summary: 'Lost 10 pounds',
    });

    expect(result).toBe(false);
    // But still stored in session
    expect(ctx.userData!.keyMoments).toContain('[health/milestone] Lost 10 pounds');
  });

  it('should call learningEngine with correct parameters', () => {
    const mockCaptureExternalKeyMoment = vi.fn();
    const ctx = createToolCtx({
      services: {
        learningEngine: {
          captureExternalKeyMoment: mockCaptureExternalKeyMoment,
        },
      },
    });

    const result = persistKeyMoment(ctx, {
      domain: 'relationship',
      type: 'celebration',
      summary: 'Anniversary dinner',
      emotionalWeight: 'heavy',
      topics: ['love', 'commitment'],
    });

    expect(result).toBe(true);
    expect(mockCaptureExternalKeyMoment).toHaveBeenCalledWith({
      id: expect.stringContaining('relationship_celebration_'),
      timestamp: expect.any(Date),
      type: 'celebration',
      summary: 'Anniversary dinner',
      emotionalWeight: 'heavy',
      topics: ['love', 'commitment'],
    });
  });

  it('should use default emotionalWeight of medium', () => {
    const mockCaptureExternalKeyMoment = vi.fn();
    const ctx = createToolCtx({
      services: {
        learningEngine: {
          captureExternalKeyMoment: mockCaptureExternalKeyMoment,
        },
      },
    });

    persistKeyMoment(ctx, {
      domain: 'work',
      type: 'decision',
      summary: 'Accepted job offer',
    });

    expect(mockCaptureExternalKeyMoment).toHaveBeenCalledWith(
      expect.objectContaining({
        emotionalWeight: 'medium',
        topics: ['work'],
      })
    );
  });

  it('should return false and handle errors gracefully', () => {
    const mockCaptureExternalKeyMoment = vi.fn(() => {
      throw new Error('Service error');
    });
    const ctx = createToolCtx({
      services: {
        learningEngine: {
          captureExternalKeyMoment: mockCaptureExternalKeyMoment,
        },
      },
    });

    const result = persistKeyMoment(ctx, {
      domain: 'test',
      type: 'breakthrough',
      summary: 'Test',
    });

    expect(result).toBe(false);
    // Session storage should still work
    expect(ctx.userData!.keyMoments!.length).toBe(1);
  });

  it('should handle empty userData', () => {
    const ctx: ToolCtxWithUserData = {};

    // Should not throw
    const result = persistKeyMoment(ctx, {
      domain: 'test',
      type: 'milestone',
      summary: 'Test',
    });

    expect(result).toBe(false);
  });
});

// ============================================================================
// PERSIST TRACKED ITEM TESTS
// ============================================================================

describe('persistTrackedItem', () => {
  it('should persist tracked item as insight', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    const result = persistTrackedItem(ctx, {
      domain: 'exercise',
      itemType: 'workout',
      item: { type: 'running', distance: 5 },
      importance: 'medium',
    });

    expect(result).toBe(true);
    expect(mockCaptureInsight).toHaveBeenCalledWith(
      'workout',
      'exercise_workout',
      expect.stringContaining('running'),
      0.7 // medium importance = 0.7
    );
  });

  it('should use correct confidence for high importance', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    persistTrackedItem(ctx, {
      domain: 'health',
      itemType: 'medication',
      item: { name: 'Aspirin' },
      importance: 'high',
    });

    expect(mockCaptureInsight).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      0.9
    );
  });

  it('should use correct confidence for low importance', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    persistTrackedItem(ctx, {
      domain: 'misc',
      itemType: 'note',
      item: { text: 'Random thought' },
      importance: 'low',
    });

    expect(mockCaptureInsight).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      0.5
    );
  });

  it('should include timestamp in tracked item data', () => {
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    persistTrackedItem(ctx, {
      domain: 'food',
      itemType: 'meal',
      item: { food: 'salad' },
    });

    const dataArg = mockCaptureInsight.mock.calls[0][2];
    const parsed = JSON.parse(dataArg);
    expect(parsed.timestamp).toBeDefined();
  });

  it('should return false when no services', () => {
    const ctx = createToolCtx();

    const result = persistTrackedItem(ctx, {
      domain: 'test',
      itemType: 'item',
      item: {},
    });

    expect(result).toBe(false);
  });
});

// ============================================================================
// ADD TO SESSION CONTEXT TESTS
// ============================================================================

describe('addToSessionContext', () => {
  it('should add context to keyMoments', () => {
    const ctx = createToolCtx({ keyMoments: [] });

    addToSessionContext(ctx, 'mood', 'current', { level: 'happy' });

    expect(ctx.userData!.keyMoments).toContain('[mood:current] {"level":"happy"}');
  });

  it('should initialize keyMoments if not present', () => {
    const ctx: ToolCtxWithUserData = {
      userData: {},
    };

    addToSessionContext(ctx, 'test', 'key', 'value');

    expect(ctx.userData!.keyMoments).toBeDefined();
    expect(ctx.userData!.keyMoments!.length).toBe(1);
  });

  it('should handle complex objects', () => {
    const ctx = createToolCtx({ keyMoments: [] });

    addToSessionContext(ctx, 'user', 'preferences', {
      theme: 'dark',
      notifications: true,
      nested: { deep: 'value' },
    });

    expect(ctx.userData!.keyMoments![0]).toContain('dark');
    expect(ctx.userData!.keyMoments![0]).toContain('nested');
  });

  it('should handle empty userData', () => {
    const ctx: ToolCtxWithUserData = {};

    // Should not throw
    addToSessionContext(ctx, 'test', 'key', 'value');
  });
});

// ============================================================================
// QUERY PAST KNOWLEDGE TESTS
// ============================================================================

describe('queryPastKnowledge', () => {
  it('should return null when no searchKnowledge service', async () => {
    const ctx = createToolCtx();

    const result = await queryPastKnowledge(ctx, 'test query');

    expect(result).toBeNull();
  });

  it('should return null when userData is undefined', async () => {
    const ctx: ToolCtxWithUserData = {};

    const result = await queryPastKnowledge(ctx, 'test query');

    expect(result).toBeNull();
  });

  it('should call searchKnowledge and return result', async () => {
    const mockSearchKnowledge = vi.fn().mockResolvedValue('Found: User prefers morning workouts');
    const ctx = createToolCtx({
      services: {
        searchKnowledge: mockSearchKnowledge,
      },
    });

    const result = await queryPastKnowledge(ctx, 'workout preferences');

    expect(result).toBe('Found: User prefers morning workouts');
    expect(mockSearchKnowledge).toHaveBeenCalledWith('workout preferences');
  });

  it('should return null when search returns empty', async () => {
    const mockSearchKnowledge = vi.fn().mockResolvedValue(null);
    const ctx = createToolCtx({
      services: {
        searchKnowledge: mockSearchKnowledge,
      },
    });

    const result = await queryPastKnowledge(ctx, 'nonexistent topic');

    expect(result).toBeNull();
  });

  it('should return null and handle errors gracefully', async () => {
    const mockSearchKnowledge = vi.fn().mockRejectedValue(new Error('Search failed'));
    const ctx = createToolCtx({
      services: {
        searchKnowledge: mockSearchKnowledge,
      },
    });

    const result = await queryPastKnowledge(ctx, 'test');

    expect(result).toBeNull();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Persistence Integration', () => {
  it('should work with full service context', async () => {
    const mockCaptureInsight = vi.fn();
    const mockCaptureExternalKeyMoment = vi.fn();
    const mockSearchKnowledge = vi.fn().mockResolvedValue('Previous workout data');

    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
        learningEngine: {
          captureExternalKeyMoment: mockCaptureExternalKeyMoment,
        },
        searchKnowledge: mockSearchKnowledge,
      },
    });

    // Persist insight
    const insightResult = persistInsight(ctx, {
      domain: 'fitness',
      type: 'goal',
      data: { target: '5k run' },
    });
    expect(insightResult).toBe(true);

    // Persist key moment
    const momentResult = persistKeyMoment(ctx, {
      domain: 'fitness',
      type: 'milestone',
      summary: 'First 5k completed!',
    });
    expect(momentResult).toBe(true);

    // Persist tracked item
    const itemResult = persistTrackedItem(ctx, {
      domain: 'fitness',
      itemType: 'run',
      item: { distance: 5, time: 30 },
      importance: 'high',
    });
    expect(itemResult).toBe(true);

    // Query past knowledge
    const knowledge = await queryPastKnowledge(ctx, 'workout history');
    expect(knowledge).toBe('Previous workout data');

    // Verify all services called
    expect(mockCaptureInsight).toHaveBeenCalledTimes(2); // insight + tracked item
    expect(mockCaptureExternalKeyMoment).toHaveBeenCalledTimes(1);
    expect(mockSearchKnowledge).toHaveBeenCalledTimes(1);
  });

  it('should handle partial service availability', () => {
    // Only captureInsight available
    const mockCaptureInsight = vi.fn();
    const ctx = createToolCtx({
      services: {
        captureInsight: mockCaptureInsight,
      },
    });

    // Insight should work
    expect(persistInsight(ctx, { domain: 'test', type: 'test', data: {} })).toBe(true);

    // Key moment should store locally but return false
    expect(persistKeyMoment(ctx, { domain: 'test', type: 'breakthrough', summary: 'Test' })).toBe(
      false
    );
    expect(ctx.userData!.keyMoments!.length).toBe(1);

    // Tracked item should work (uses captureInsight)
    expect(persistTrackedItem(ctx, { domain: 'test', itemType: 'item', item: {} })).toBe(true);
  });
});
