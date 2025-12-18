/**
 * Roadmap Service Tests
 *
 * Tests for the "What's Growing" roadmap feature service.
 * Tests feature detection, voting, and stage information.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ROADMAP_FEATURES,
  roadmapService,
  STAGE_INFO,
  type RoadmapStage,
} from '@/services/roadmap.service.js';

// ============================================================================
// MOCK LOCAL STORAGE
// ============================================================================

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('STAGE_INFO', () => {
  it('should have all four stages defined', () => {
    const stages: RoadmapStage[] = ['seed', 'sprout', 'bud', 'bloom'];

    stages.forEach((stage) => {
      expect(STAGE_INFO[stage]).toBeDefined();
      expect(STAGE_INFO[stage].icon).toBeTruthy();
      expect(STAGE_INFO[stage].label).toBeTruthy();
      expect(STAGE_INFO[stage].description).toBeTruthy();
      expect(STAGE_INFO[stage].colorClass).toBeTruthy();
    });
  });

  it('should have unique icons for each stage', () => {
    const icons = Object.values(STAGE_INFO).map((s) => s.icon);
    const uniqueIcons = new Set(icons);

    expect(uniqueIcons.size).toBe(icons.length);
  });
});

describe('ROADMAP_FEATURES', () => {
  it('should have at least one feature', () => {
    expect(ROADMAP_FEATURES.length).toBeGreaterThan(0);
  });

  it('should have all required properties for each feature', () => {
    ROADMAP_FEATURES.forEach((feature) => {
      expect(feature.id).toBeTruthy();
      expect(feature.headline).toBeTruthy();
      expect(feature.description).toBeTruthy();
      expect(['seed', 'sprout', 'bud', 'bloom']).toContain(feature.stage);
      expect(Array.isArray(feature.superhuman)).toBe(true);
      expect(feature.estimatedArrival).toBeTruthy();
      expect(typeof feature.canVote).toBe('boolean');
      expect(feature.icon).toBeTruthy();
      expect(['connect', 'personalize', 'platform']).toContain(feature.category);
    });
  });

  it('should have unique IDs for each feature', () => {
    const ids = ROADMAP_FEATURES.map((f) => f.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should include expected roadmap features', () => {
    const ids = ROADMAP_FEATURES.map((f) => f.id);

    // These should be on the roadmap
    expect(ids).toContain('group-coaching');
    expect(ids).toContain('video-settings');
    expect(ids).toContain('household');
  });
});

// ============================================================================
// ROADMAP SERVICE TESTS
// ============================================================================

describe('RoadmapService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getAllFeatures', () => {
    it('should return all roadmap features', () => {
      const features = roadmapService.getAllFeatures();

      // Check same number of features
      expect(features.length).toBe(ROADMAP_FEATURES.length);

      // Check all feature IDs are present
      const featureIds = features.map(f => f.id);
      ROADMAP_FEATURES.forEach(f => {
        expect(featureIds).toContain(f.id);
      });
    });
  });

  describe('getFeature', () => {
    it('should return a feature by ID', () => {
      const feature = roadmapService.getFeature('group-coaching');

      expect(feature).toBeDefined();
      expect(feature?.id).toBe('group-coaching');
    });

    it('should return undefined for unknown feature', () => {
      const feature = roadmapService.getFeature('unknown-feature-xyz');

      expect(feature).toBeUndefined();
    });
  });

  describe('isRoadmapFeature', () => {
    it('should return true for roadmap features', () => {
      expect(roadmapService.isRoadmapFeature('group-coaching')).toBe(true);
      expect(roadmapService.isRoadmapFeature('video-settings')).toBe(true);
    });

    it('should return false for non-roadmap features', () => {
      expect(roadmapService.isRoadmapFeature('subscription')).toBe(false);
      expect(roadmapService.isRoadmapFeature('theme')).toBe(false);
      expect(roadmapService.isRoadmapFeature('unknown')).toBe(false);
    });
  });

  describe('getFeaturesByCategory', () => {
    it('should return features in connect category', () => {
      const features = roadmapService.getFeaturesByCategory('connect');

      expect(features.length).toBeGreaterThan(0);
      features.forEach((f) => {
        expect(f.category).toBe('connect');
      });
    });

    it('should return features in personalize category', () => {
      const features = roadmapService.getFeaturesByCategory('personalize');

      expect(features.length).toBeGreaterThan(0);
      features.forEach((f) => {
        expect(f.category).toBe('personalize');
      });
    });

    it('should return features in platform category', () => {
      const features = roadmapService.getFeaturesByCategory('platform');

      expect(features.length).toBeGreaterThan(0);
      features.forEach((f) => {
        expect(f.category).toBe('platform');
      });
    });

    it('should return empty array for invalid category', () => {
      const features = roadmapService.getFeaturesByCategory('invalid' as 'connect');

      expect(features).toEqual([]);
    });
  });

  describe('getFeaturesByStage', () => {
    it('should filter features by stage', () => {
      const stages: RoadmapStage[] = ['seed', 'sprout', 'bud', 'bloom'];

      stages.forEach((stage) => {
        const features = roadmapService.getFeaturesByStage(stage);

        features.forEach((f) => {
          expect(f.stage).toBe(stage);
        });
      });
    });
  });
});

// ============================================================================
// VOTING TESTS
// ============================================================================

describe('RoadmapService Voting', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    // Mock fetch for API calls
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        voteId: 'test-vote-123',
        newTotalSeeds: 5,
        newGardeners: 1,
        userSeedsOnFeature: 5,
        newSeedBalance: 15,
      }),
    });
    global.fetch = mockFetch;
  });

  describe('hasVoted', () => {
    it('should return false initially', () => {
      expect(roadmapService.hasVoted('video-settings')).toBe(false);
    });

    it('should return true after successful voting', async () => {
      await roadmapService.vote('video-settings');
      expect(roadmapService.hasVoted('video-settings')).toBe(true);
    });
  });

  describe('vote (async)', () => {
    it('should call API and return success', async () => {
      const result = await roadmapService.vote('video-settings');
      expect(result.success).toBe(true);
    });

    it('should mark feature as voted after success', async () => {
      await roadmapService.vote('video-settings');
      expect(roadmapService.hasVoted('video-settings')).toBe(true);
    });

    it('should allow voting for multiple features', async () => {
      await roadmapService.vote('video-settings');
      await roadmapService.vote('household');

      expect(roadmapService.hasVoted('video-settings')).toBe(true);
      expect(roadmapService.hasVoted('household')).toBe(true);
    });
  });

  describe('unvote (async)', () => {
    it('should call API and return success', async () => {
      // First vote, then unvote
      await roadmapService.vote('video-settings');
      const result = await roadmapService.unvote('video-settings');
      expect(result.success).toBe(true);
    });

    it('should mark feature as unvoted after success', async () => {
      await roadmapService.vote('video-settings');
      expect(roadmapService.hasVoted('video-settings')).toBe(true);

      await roadmapService.unvote('video-settings');
      expect(roadmapService.hasVoted('video-settings')).toBe(false);
    });
  });

  describe('getVoteCount', () => {
    it('should return a non-negative number', () => {
      const count = roadmapService.getVoteCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should increase count after voting', async () => {
      const initialCount = roadmapService.getVoteCount();
      await roadmapService.vote('developer-portal'); // Use a unique feature
      expect(roadmapService.getVoteCount()).toBe(initialCount + 1);
    });

    it('should decrease count after unvoting', async () => {
      // First ensure we have a vote to remove
      await roadmapService.vote('marketplace'); // Use another unique feature
      const countAfterVote = roadmapService.getVoteCount();

      await roadmapService.unvote('marketplace');
      expect(roadmapService.getVoteCount()).toBe(countAfterVote - 1);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('RoadmapService Edge Cases', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should handle localStorage errors gracefully', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('localStorage error');
    });

    // Should not throw
    expect(() => roadmapService.getAllFeatures()).not.toThrow();
  });

  it('should handle invalid JSON in localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('invalid json{');

    // Should not throw
    expect(() => roadmapService.hasVoted('group-coaching')).not.toThrow();
  });

  it('should handle empty feature ID', () => {
    expect(roadmapService.isRoadmapFeature('')).toBe(false);
    expect(roadmapService.getFeature('')).toBeUndefined();
  });
});

// ============================================================================
// SEED ECONOMY TESTS
// ============================================================================

import {
  smartPromptTracker,
  SMART_PROMPT_RULES,
  type SmartPromptRecommendation,
} from '@/services/roadmap.service.js';

describe('SmartPromptTracker', () => {
  describe('SMART_PROMPT_RULES', () => {
    it('should have rules defined for key features', () => {
      const featureIds = SMART_PROMPT_RULES.map(r => r.featureId);

      expect(featureIds).toContain('video-settings');
      expect(featureIds).toContain('group-coaching');
      expect(featureIds).toContain('wearable-settings');
      expect(featureIds).toContain('household');
    });

    it('should have valid trigger keywords for each rule', () => {
      SMART_PROMPT_RULES.forEach(rule => {
        expect(rule.triggers.length).toBeGreaterThan(0);
        expect(rule.minMentions).toBeGreaterThanOrEqual(1);
        rule.triggers.forEach(trigger => {
          expect(typeof trigger).toBe('string');
          expect(trigger.length).toBeGreaterThan(0);
        });
      });
    });

    it('should have at least 5 rules defined', () => {
      expect(SMART_PROMPT_RULES.length).toBeGreaterThanOrEqual(5);
    });

    it('should have unique feature IDs', () => {
      const featureIds = SMART_PROMPT_RULES.map(r => r.featureId);
      const uniqueIds = new Set(featureIds);
      expect(uniqueIds.size).toBe(featureIds.length);
    });
  });

  describe('analyzeText', () => {
    it('should not throw when analyzing text', () => {
      expect(() => smartPromptTracker.analyzeText('I want to see your video')).not.toThrow();
      expect(() => smartPromptTracker.analyzeText('')).not.toThrow();
      expect(() => smartPromptTracker.analyzeText('Normal conversation text')).not.toThrow();
    });
  });

  describe('getRecommendations', () => {
    it('should return an array', () => {
      const recs = smartPromptTracker.getRecommendations();
      expect(Array.isArray(recs)).toBe(true);
    });

    it('should return recommendations with required properties', () => {
      // First accumulate some mentions to trigger recommendations
      for (let i = 0; i < 10; i++) {
        smartPromptTracker.analyzeText('video call face calendar schedule');
      }

      const recs = smartPromptTracker.getRecommendations();
      recs.forEach(rec => {
        expect(rec).toHaveProperty('featureId');
        expect(rec).toHaveProperty('mentionCount');
        expect(rec).toHaveProperty('feature');
      });
    });
  });

  describe('dismissFeature', () => {
    it('should not throw when dismissing features', () => {
      expect(() => smartPromptTracker.dismissFeature('video-settings')).not.toThrow();
      expect(() => smartPromptTracker.dismissFeature('unknown-feature')).not.toThrow();
    });
  });

  describe('getMentionCount', () => {
    it('should return a number', () => {
      const count = smartPromptTracker.getMentionCount('video-settings');
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('hasRecommendations', () => {
    it('should return a boolean', () => {
      const hasRecs = smartPromptTracker.hasRecommendations();
      expect(typeof hasRecs).toBe('boolean');
    });
  });
});

// ============================================================================
// SEED BALANCE TESTS
// ============================================================================

describe('RoadmapService Seed Economy', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getSeedBalance', () => {
    it('should return initial seed balance', () => {
      const balance = roadmapService.getSeedBalance();
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSeedsPlanted', () => {
    it('should return feature-specific seed counts', () => {
      const seeds = roadmapService.getSeedsPlanted('group-coaching');
      expect(typeof seeds).toBe('number');
      expect(seeds).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for features not yet voted on', () => {
      const seeds = roadmapService.getSeedsPlanted('video-settings');
      expect(seeds).toBe(0);
    });
  });
});

// ============================================================================
// PRIORITY VOTING (MULTI-SEED) TESTS
// ============================================================================

describe('RoadmapService Priority Voting', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    // Mock fetch for API calls
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        voteId: 'test-vote-123',
        newTotalSeeds: 5,
        newGardeners: 1,
        userSeedsOnFeature: 5,
        newSeedBalance: 15,
      }),
    });
    global.fetch = mockFetch;
  });

  describe('vote', () => {
    it('should return success when API succeeds', async () => {
      const result = await roadmapService.vote('video-settings', 5, 'testing');
      expect(result.success).toBe(true);
    });

    it('should call the vote API endpoint', async () => {
      await roadmapService.vote('video-settings', 3);

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('/api/roadmap/vote');
      expect(callArgs[1].method).toBe('POST');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await roadmapService.vote('video-settings', 5);
      expect(result.success).toBe(false);
    });

    it('should handle non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'Failed' }),
      });
      const result = await roadmapService.vote('video-settings', 5);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// FEATURE SUGGESTION TESTS
// ============================================================================

describe('RoadmapService Feature Suggestions', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    // Mock fetch for API calls
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        suggestion: {
          id: 'test-suggestion-123',
          title: 'Test suggestion',
          category: 'connect',
        },
        newSeedBalance: 5,
      }),
    });
    global.fetch = mockFetch;
  });

  describe('submitSuggestion', () => {
    it('should return success when API succeeds', async () => {
      const result = await roadmapService.submitSuggestion({
        title: 'Sleep tracking integration',
        description: 'Connect to sleep apps to discuss sleep patterns',
        category: 'connect',
      });

      expect(result.success).toBe(true);
    });

    it('should call the suggest API endpoint', async () => {
      await roadmapService.submitSuggestion({
        title: 'Test Feature',
        description: 'A great new feature',
        category: 'platform',
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('/api/roadmap/suggest');
      expect(callArgs[1].method).toBe('POST');
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await roadmapService.submitSuggestion({
        title: 'Test',
        description: 'Test',
        category: 'connect',
      });

      expect(result.success).toBe(false);
    });

    it('should handle non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          success: false,
          error: 'Insufficient seeds',
        }),
      });

      const result = await roadmapService.submitSuggestion({
        title: 'Test',
        description: 'Test',
        category: 'connect',
      });

      expect(result.success).toBe(false);
    });
  });
});
