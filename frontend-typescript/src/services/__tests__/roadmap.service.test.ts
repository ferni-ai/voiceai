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
} from '../roadmap.service.js';

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
      expect(STAGE_INFO[stage].emoji).toBeTruthy();
      expect(STAGE_INFO[stage].label).toBeTruthy();
      expect(STAGE_INFO[stage].description).toBeTruthy();
      expect(STAGE_INFO[stage].color).toBeTruthy();
    });
  });

  it('should have unique emojis for each stage', () => {
    const emojis = Object.values(STAGE_INFO).map((s) => s.emoji);
    const uniqueEmojis = new Set(emojis);

    expect(uniqueEmojis.size).toBe(emojis.length);
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

      expect(features).toEqual(ROADMAP_FEATURES);
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
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('hasVoted', () => {
    it('should return false initially', () => {
      expect(roadmapService.hasVoted('group-coaching')).toBe(false);
    });

    it('should return true after voting', () => {
      roadmapService.vote('group-coaching');

      expect(roadmapService.hasVoted('group-coaching')).toBe(true);
    });
  });

  describe('vote', () => {
    it('should add feature to voted list', () => {
      roadmapService.vote('group-coaching');

      expect(roadmapService.hasVoted('group-coaching')).toBe(true);
    });

    it('should persist votes to localStorage', () => {
      roadmapService.vote('group-coaching');

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should allow voting for multiple features', () => {
      roadmapService.vote('group-coaching');
      roadmapService.vote('video-settings');

      expect(roadmapService.hasVoted('group-coaching')).toBe(true);
      expect(roadmapService.hasVoted('video-settings')).toBe(true);
    });
  });

  describe('unvote', () => {
    it('should remove feature from voted list', () => {
      roadmapService.vote('group-coaching');
      expect(roadmapService.hasVoted('group-coaching')).toBe(true);

      roadmapService.unvote('group-coaching');
      expect(roadmapService.hasVoted('group-coaching')).toBe(false);
    });

    it('should handle unvoting non-voted feature', () => {
      // Should not throw
      expect(() => roadmapService.unvote('group-coaching')).not.toThrow();
    });
  });

  describe('getVoteCount', () => {
    it('should return 0 initially', () => {
      expect(roadmapService.getVoteCount()).toBe(0);
    });

    it('should return correct count after voting', () => {
      roadmapService.vote('group-coaching');
      expect(roadmapService.getVoteCount()).toBe(1);

      roadmapService.vote('video-settings');
      expect(roadmapService.getVoteCount()).toBe(2);
    });

    it('should decrease count after unvoting', () => {
      roadmapService.vote('group-coaching');
      roadmapService.vote('video-settings');
      expect(roadmapService.getVoteCount()).toBe(2);

      roadmapService.unvote('group-coaching');
      expect(roadmapService.getVoteCount()).toBe(1);
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
