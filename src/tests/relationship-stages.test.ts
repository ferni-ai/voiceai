/**
 * Tests for types/relationship-stages.ts
 *
 * Tests stage conversion, calculation, type guards, and comparison utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  // Stage conversion
  fromLegacyStage,
  toLegacyStage,
  fromHumanizingStage,
  toHumanizingStage,
  // Stage calculation
  calculateStage,
  meetsStageRequirements,
  getProgressToNextStage,
  // Type guards
  isRelationshipStage,
  isLegacyRelationshipStage,
  isHumanizingRelationshipStage,
  // Comparison utilities
  isAtLeast,
  isDeeperThan,
  getNextStage,
  getPreviousStage,
  // Constants
  STAGE_LEVELS,
  STAGE_DESCRIPTIONS,
  STAGE_THRESHOLDS,
  // Types
  type RelationshipStage,
  type LegacyRelationshipStage,
  type HumanizingRelationshipStage,
  type RelationshipMetrics,
} from '../types/relationship-stages.js';

// ============================================================================
// STAGE CONVERSION TESTS
// ============================================================================

describe('fromLegacyStage', () => {
  it('converts new_acquaintance to stranger', () => {
    expect(fromLegacyStage('new_acquaintance')).toBe('stranger');
  });

  it('converts getting_to_know to acquaintance', () => {
    expect(fromLegacyStage('getting_to_know')).toBe('acquaintance');
  });

  it('converts trusted_advisor to friend', () => {
    expect(fromLegacyStage('trusted_advisor')).toBe('friend');
  });

  it('converts old_friend to trusted_confidant', () => {
    expect(fromLegacyStage('old_friend')).toBe('trusted_confidant');
  });
});

describe('toLegacyStage', () => {
  it('converts stranger to new_acquaintance', () => {
    expect(toLegacyStage('stranger')).toBe('new_acquaintance');
  });

  it('converts acquaintance to getting_to_know', () => {
    expect(toLegacyStage('acquaintance')).toBe('getting_to_know');
  });

  it('converts friend to trusted_advisor', () => {
    expect(toLegacyStage('friend')).toBe('trusted_advisor');
  });

  it('converts trusted_confidant to old_friend', () => {
    expect(toLegacyStage('trusted_confidant')).toBe('old_friend');
  });
});

describe('fromHumanizingStage', () => {
  it('converts humanizing stages to canonical', () => {
    expect(fromHumanizingStage('stranger')).toBe('stranger');
    expect(fromHumanizingStage('acquaintance')).toBe('acquaintance');
    expect(fromHumanizingStage('friend')).toBe('friend');
    expect(fromHumanizingStage('trusted_advisor')).toBe('trusted_confidant');
  });
});

describe('toHumanizingStage', () => {
  it('converts canonical stages to humanizing', () => {
    expect(toHumanizingStage('stranger')).toBe('stranger');
    expect(toHumanizingStage('acquaintance')).toBe('acquaintance');
    expect(toHumanizingStage('friend')).toBe('friend');
    expect(toHumanizingStage('trusted_confidant')).toBe('trusted_advisor');
  });
});

describe('Round-trip conversions', () => {
  it('legacy -> canonical -> legacy is identity', () => {
    const legacyStages: LegacyRelationshipStage[] = [
      'new_acquaintance',
      'getting_to_know',
      'trusted_advisor',
      'old_friend',
    ];

    for (const stage of legacyStages) {
      const canonical = fromLegacyStage(stage);
      const backToLegacy = toLegacyStage(canonical);
      expect(backToLegacy).toBe(stage);
    }
  });

  it('humanizing -> canonical -> humanizing is identity', () => {
    const humanizingStages: HumanizingRelationshipStage[] = [
      'stranger',
      'acquaintance',
      'friend',
      'trusted_advisor',
    ];

    for (const stage of humanizingStages) {
      const canonical = fromHumanizingStage(stage);
      const backToHumanizing = toHumanizingStage(canonical);
      expect(backToHumanizing).toBe(stage);
    }
  });
});

// ============================================================================
// STAGE CALCULATION TESTS
// ============================================================================

describe('calculateStage', () => {
  it('returns stranger for brand new user', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 0,
      totalMinutesTalked: 0,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    expect(calculateStage(metrics)).toBe('stranger');
  });

  it('returns stranger for user with 1-2 conversations', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 2,
      totalMinutesTalked: 10,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    expect(calculateStage(metrics)).toBe('stranger');
  });

  it('returns acquaintance when thresholds met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 3,
      totalMinutesTalked: 15,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    expect(calculateStage(metrics)).toBe('acquaintance');
  });

  it('returns friend when thresholds met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 6,
      totalMinutesTalked: 60,
      keyMomentsCount: 2,
      vulnerabilityMomentsCount: 0,
    };
    expect(calculateStage(metrics)).toBe('friend');
  });

  it('returns trusted_confidant when all thresholds met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 10,
      totalMinutesTalked: 120,
      keyMomentsCount: 5,
      vulnerabilityMomentsCount: 2,
    };
    expect(calculateStage(metrics)).toBe('trusted_confidant');
  });

  it('stays at lower stage if any threshold not met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 10, // Meets trusted_confidant
      totalMinutesTalked: 120, // Meets trusted_confidant
      keyMomentsCount: 5, // Meets trusted_confidant
      vulnerabilityMomentsCount: 1, // Does NOT meet trusted_confidant (needs 2)
    };
    expect(calculateStage(metrics)).toBe('friend');
  });

  it('handles high metrics correctly', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 100,
      totalMinutesTalked: 500,
      keyMomentsCount: 20,
      vulnerabilityMomentsCount: 10,
    };
    expect(calculateStage(metrics)).toBe('trusted_confidant');
  });
});

describe('meetsStageRequirements', () => {
  it('returns true when all requirements met for stranger', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 0,
      totalMinutesTalked: 0,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    expect(meetsStageRequirements('stranger', metrics)).toBe(true);
  });

  it('returns true when requirements met for acquaintance', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 5,
      totalMinutesTalked: 30,
      keyMomentsCount: 1,
      vulnerabilityMomentsCount: 0,
    };
    expect(meetsStageRequirements('acquaintance', metrics)).toBe(true);
  });

  it('returns false when requirements not met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 2,
      totalMinutesTalked: 10,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    expect(meetsStageRequirements('acquaintance', metrics)).toBe(false);
  });

  it('returns false for trusted_confidant without vulnerability moments', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 10,
      totalMinutesTalked: 120,
      keyMomentsCount: 5,
      vulnerabilityMomentsCount: 0,
    };
    expect(meetsStageRequirements('trusted_confidant', metrics)).toBe(false);
  });
});

describe('getProgressToNextStage', () => {
  it('returns 100% progress and no next stage for trusted_confidant', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 20,
      totalMinutesTalked: 200,
      keyMomentsCount: 10,
      vulnerabilityMomentsCount: 5,
    };
    const result = getProgressToNextStage('trusted_confidant', metrics);

    expect(result.nextStage).toBeNull();
    expect(result.progress).toBe(100);
    expect(result.missingRequirements).toEqual([]);
  });

  it('returns progress toward acquaintance from stranger', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 1,
      totalMinutesTalked: 5,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    const result = getProgressToNextStage('stranger', metrics);

    expect(result.nextStage).toBe('acquaintance');
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThan(100);
    expect(result.missingRequirements.length).toBeGreaterThan(0);
  });

  it('returns 100% when all requirements for next stage met', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 10,
      totalMinutesTalked: 120, // Must meet 120 min threshold for trusted_confidant
      keyMomentsCount: 5,
      vulnerabilityMomentsCount: 2,
    };
    const result = getProgressToNextStage('friend', metrics);

    expect(result.nextStage).toBe('trusted_confidant');
    expect(result.progress).toBe(100);
    expect(result.missingRequirements).toEqual([]);
  });

  it('lists missing requirements correctly', () => {
    const metrics: RelationshipMetrics = {
      conversationCount: 0,
      totalMinutesTalked: 0,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    };
    const result = getProgressToNextStage('stranger', metrics);

    expect(result.missingRequirements.length).toBeGreaterThan(0);
    expect(result.missingRequirements.some((r) => r.includes('conversations'))).toBe(true);
    expect(result.missingRequirements.some((r) => r.includes('minutes'))).toBe(true);
  });
});

// ============================================================================
// TYPE GUARD TESTS
// ============================================================================

describe('isRelationshipStage', () => {
  it('returns true for valid stages', () => {
    expect(isRelationshipStage('stranger')).toBe(true);
    expect(isRelationshipStage('acquaintance')).toBe(true);
    expect(isRelationshipStage('friend')).toBe(true);
    expect(isRelationshipStage('trusted_confidant')).toBe(true);
  });

  it('returns false for invalid stages', () => {
    expect(isRelationshipStage('unknown')).toBe(false);
    expect(isRelationshipStage('trusted_advisor')).toBe(false); // Humanizing stage
    expect(isRelationshipStage('old_friend')).toBe(false); // Legacy stage
    expect(isRelationshipStage('')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isRelationshipStage(null)).toBe(false);
    expect(isRelationshipStage(undefined)).toBe(false);
    expect(isRelationshipStage(123)).toBe(false);
    expect(isRelationshipStage({})).toBe(false);
    expect(isRelationshipStage(['stranger'])).toBe(false);
  });
});

describe('isLegacyRelationshipStage', () => {
  it('returns true for valid legacy stages', () => {
    expect(isLegacyRelationshipStage('new_acquaintance')).toBe(true);
    expect(isLegacyRelationshipStage('getting_to_know')).toBe(true);
    expect(isLegacyRelationshipStage('trusted_advisor')).toBe(true);
    expect(isLegacyRelationshipStage('old_friend')).toBe(true);
  });

  it('returns false for canonical stages', () => {
    expect(isLegacyRelationshipStage('stranger')).toBe(false);
    expect(isLegacyRelationshipStage('acquaintance')).toBe(false);
    expect(isLegacyRelationshipStage('friend')).toBe(false);
    expect(isLegacyRelationshipStage('trusted_confidant')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isLegacyRelationshipStage(null)).toBe(false);
    expect(isLegacyRelationshipStage(undefined)).toBe(false);
    expect(isLegacyRelationshipStage({})).toBe(false);
  });
});

describe('isHumanizingRelationshipStage', () => {
  it('returns true for valid humanizing stages', () => {
    expect(isHumanizingRelationshipStage('stranger')).toBe(true);
    expect(isHumanizingRelationshipStage('acquaintance')).toBe(true);
    expect(isHumanizingRelationshipStage('friend')).toBe(true);
    expect(isHumanizingRelationshipStage('trusted_advisor')).toBe(true);
  });

  it('returns false for trusted_confidant (canonical only)', () => {
    expect(isHumanizingRelationshipStage('trusted_confidant')).toBe(false);
  });

  it('returns false for legacy stages', () => {
    expect(isHumanizingRelationshipStage('new_acquaintance')).toBe(false);
    expect(isHumanizingRelationshipStage('getting_to_know')).toBe(false);
    expect(isHumanizingRelationshipStage('old_friend')).toBe(false);
  });
});

// ============================================================================
// COMPARISON UTILITY TESTS
// ============================================================================

describe('isAtLeast', () => {
  it('returns true when stages are equal', () => {
    expect(isAtLeast('stranger', 'stranger')).toBe(true);
    expect(isAtLeast('friend', 'friend')).toBe(true);
    expect(isAtLeast('trusted_confidant', 'trusted_confidant')).toBe(true);
  });

  it('returns true when first stage is deeper', () => {
    expect(isAtLeast('acquaintance', 'stranger')).toBe(true);
    expect(isAtLeast('friend', 'acquaintance')).toBe(true);
    expect(isAtLeast('trusted_confidant', 'stranger')).toBe(true);
  });

  it('returns false when first stage is shallower', () => {
    expect(isAtLeast('stranger', 'acquaintance')).toBe(false);
    expect(isAtLeast('acquaintance', 'friend')).toBe(false);
    expect(isAtLeast('friend', 'trusted_confidant')).toBe(false);
  });
});

describe('isDeeperThan', () => {
  it('returns false when stages are equal', () => {
    expect(isDeeperThan('stranger', 'stranger')).toBe(false);
    expect(isDeeperThan('friend', 'friend')).toBe(false);
  });

  it('returns true when first stage is deeper', () => {
    expect(isDeeperThan('acquaintance', 'stranger')).toBe(true);
    expect(isDeeperThan('friend', 'acquaintance')).toBe(true);
    expect(isDeeperThan('trusted_confidant', 'friend')).toBe(true);
  });

  it('returns false when first stage is shallower', () => {
    expect(isDeeperThan('stranger', 'acquaintance')).toBe(false);
    expect(isDeeperThan('acquaintance', 'friend')).toBe(false);
  });
});

describe('getNextStage', () => {
  it('returns next stage in progression', () => {
    expect(getNextStage('stranger')).toBe('acquaintance');
    expect(getNextStage('acquaintance')).toBe('friend');
    expect(getNextStage('friend')).toBe('trusted_confidant');
  });

  it('returns null for highest stage', () => {
    expect(getNextStage('trusted_confidant')).toBeNull();
  });
});

describe('getPreviousStage', () => {
  it('returns previous stage in progression', () => {
    expect(getPreviousStage('trusted_confidant')).toBe('friend');
    expect(getPreviousStage('friend')).toBe('acquaintance');
    expect(getPreviousStage('acquaintance')).toBe('stranger');
  });

  it('returns null for lowest stage', () => {
    expect(getPreviousStage('stranger')).toBeNull();
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('STAGE_LEVELS', () => {
  it('has correct ordering', () => {
    expect(STAGE_LEVELS.stranger).toBe(1);
    expect(STAGE_LEVELS.acquaintance).toBe(2);
    expect(STAGE_LEVELS.friend).toBe(3);
    expect(STAGE_LEVELS.trusted_confidant).toBe(4);
  });

  it('has increasing values', () => {
    expect(STAGE_LEVELS.stranger).toBeLessThan(STAGE_LEVELS.acquaintance);
    expect(STAGE_LEVELS.acquaintance).toBeLessThan(STAGE_LEVELS.friend);
    expect(STAGE_LEVELS.friend).toBeLessThan(STAGE_LEVELS.trusted_confidant);
  });
});

describe('STAGE_DESCRIPTIONS', () => {
  it('has description for each stage', () => {
    expect(STAGE_DESCRIPTIONS.stranger).toBeDefined();
    expect(STAGE_DESCRIPTIONS.acquaintance).toBeDefined();
    expect(STAGE_DESCRIPTIONS.friend).toBeDefined();
    expect(STAGE_DESCRIPTIONS.trusted_confidant).toBeDefined();
  });

  it('descriptions are non-empty strings', () => {
    Object.values(STAGE_DESCRIPTIONS).forEach((desc) => {
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });
  });
});

describe('STAGE_THRESHOLDS', () => {
  it('stranger has zero thresholds', () => {
    const strangerThresholds = STAGE_THRESHOLDS.stranger;
    expect(strangerThresholds.minConversations).toBe(0);
    expect(strangerThresholds.minMinutesTalked).toBe(0);
    expect(strangerThresholds.minKeyMoments).toBe(0);
    expect(strangerThresholds.minVulnerabilityMoments).toBe(0);
  });

  it('thresholds increase with stage', () => {
    const stages: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted_confidant'];

    for (let i = 1; i < stages.length; i++) {
      const prev = STAGE_THRESHOLDS[stages[i - 1]];
      const curr = STAGE_THRESHOLDS[stages[i]];

      expect(curr.minConversations).toBeGreaterThanOrEqual(prev.minConversations);
      expect(curr.minMinutesTalked).toBeGreaterThanOrEqual(prev.minMinutesTalked);
    }
  });

  it('trusted_confidant requires vulnerability moments', () => {
    const thresholds = STAGE_THRESHOLDS.trusted_confidant;
    expect(thresholds.minVulnerabilityMoments).toBeGreaterThan(0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Stage progression', () => {
  it('simulates relationship progression from stranger to trusted_confidant', () => {
    let currentStage = calculateStage({
      conversationCount: 0,
      totalMinutesTalked: 0,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    });
    expect(currentStage).toBe('stranger');

    // After a few conversations
    currentStage = calculateStage({
      conversationCount: 3,
      totalMinutesTalked: 20,
      keyMomentsCount: 0,
      vulnerabilityMomentsCount: 0,
    });
    expect(currentStage).toBe('acquaintance');

    // After more time and key moments
    currentStage = calculateStage({
      conversationCount: 7,
      totalMinutesTalked: 80,
      keyMomentsCount: 3,
      vulnerabilityMomentsCount: 0,
    });
    expect(currentStage).toBe('friend');

    // After vulnerability shared
    currentStage = calculateStage({
      conversationCount: 15,
      totalMinutesTalked: 150,
      keyMomentsCount: 8,
      vulnerabilityMomentsCount: 3,
    });
    expect(currentStage).toBe('trusted_confidant');
  });

  it('converts between all stage formats correctly', () => {
    // Start with legacy stage
    const legacy: LegacyRelationshipStage = 'trusted_advisor';

    // Convert to canonical
    const canonical = fromLegacyStage(legacy);
    expect(canonical).toBe('friend');

    // Convert to humanizing
    const humanizing = toHumanizingStage(canonical);
    expect(humanizing).toBe('friend');

    // Back to legacy
    const backToLegacy = toLegacyStage(canonical);
    expect(backToLegacy).toBe('trusted_advisor');
  });
});
