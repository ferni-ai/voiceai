/**
 * Cross-Session Reflection Tests
 *
 * Tests for the reflection system that enables personas to
 * "think about" significant moments between sessions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  detectReflectionMoment,
  generateReflection,
  selectBestReflection,
  getReflectionMoments,
  saveReflectionMoment,
  markMomentReflectedOn,
  calculateAppropiateness,
  reflectionTemplates,
  type ReflectionMoment,
  type GeneratedReflection,
} from '../intelligence/cross-session-reflection.js';

import type { UserProfile } from '../types/user-profile.js';

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

function createMoment(overrides: Partial<ReflectionMoment> = {}): ReflectionMoment {
  return {
    id: `test-moment-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    sessionId: 'test-session',
    userStatement: 'Test statement',
    topic: 'test topic',
    emotionalWeight: 'medium',
    type: 'vulnerability_shared',
    reflectionSeed: 'what you shared about test topic',
    reflectedOn: false,
    ...overrides,
  };
}

function createProfile(customData: Record<string, unknown> = {}): UserProfile {
  return {
    id: 'test-user',
    customData,
  };
}

// ============================================================================
// DETECTION TESTS
// ============================================================================

describe('detectReflectionMoment', () => {
  describe('vulnerability patterns', () => {
    it('should detect "I\'ve never told anyone"', () => {
      const result = detectReflectionMoment(
        "I've never told anyone this before, but I'm struggling",
        'personal struggles',
        'sadness',
        0.6,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('vulnerability_shared');
      expect(result?.emotionalWeight).toBe('heavy');
    });

    it('should detect "This is hard to say"', () => {
      const result = detectReflectionMoment(
        'This is hard to say but I made a mistake',
        'mistakes',
        'regret',
        0.5,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('vulnerability_shared');
    });

    it('should detect "I\'m scared of"', () => {
      const result = detectReflectionMoment(
        "I'm scared of losing everything I've worked for",
        'financial fears',
        'fear',
        0.7,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('vulnerability_shared');
    });

    it('should detect "I feel so alone"', () => {
      const result = detectReflectionMoment(
        'I feel so alone in this situation',
        'loneliness',
        'sadness',
        0.8,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('vulnerability_shared');
    });
  });

  describe('breakthrough patterns', () => {
    it('should detect "I just realized"', () => {
      const result = detectReflectionMoment(
        'I just realized that I was blaming myself unnecessarily',
        'self-blame',
        'neutral',
        0.4,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('breakthrough_moment');
    });

    it('should detect "It hit me that"', () => {
      const result = detectReflectionMoment(
        'It hit me that I need to change my approach',
        'personal growth',
        'anticipation',
        0.5,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('breakthrough_moment');
    });

    it('should detect "I finally understand"', () => {
      const result = detectReflectionMoment(
        "I've finally understood why I was holding back",
        'self-awareness',
        'joy',
        0.5,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('breakthrough_moment');
    });
  });

  describe('commitment patterns', () => {
    it('should detect "I\'m going to"', () => {
      const result = detectReflectionMoment(
        "I'm going to start exercising every day",
        'fitness',
        'anticipation',
        0.5,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('goal_commitment');
    });

    it('should detect "I\'ve decided to"', () => {
      const result = detectReflectionMoment(
        "I've decided to look for a new job",
        'career change',
        'neutral',
        0.4,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('goal_commitment');
    });

    it('should detect "Starting tomorrow"', () => {
      const result = detectReflectionMoment(
        "Starting tomorrow I'm cutting back on spending",
        'budgeting',
        'anticipation',
        0.4,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('goal_commitment');
    });
  });

  describe('fear patterns', () => {
    it('should detect "I\'m worried about"', () => {
      const result = detectReflectionMoment(
        "I'm worried about the market crash",
        'investments',
        'anxiety',
        0.6,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('fear_expressed');
    });

    it('should detect "What if it fails"', () => {
      const result = detectReflectionMoment(
        'What if this fails and I lose everything',
        'business venture',
        'fear',
        0.7,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('fear_expressed');
    });
  });

  describe('joy patterns', () => {
    it('should detect high intensity joy', () => {
      const result = detectReflectionMoment(
        "I'm so happy I could cry! This is the best news ever!",
        'good news',
        'joy',
        0.9,
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('joy_shared');
    });

    it('should not detect joy with low intensity', () => {
      const result = detectReflectionMoment(
        "I'm so excited about the weekend",
        'plans',
        'joy',
        0.3, // Below 0.5 threshold
        'session-1'
      );

      // Low intensity joy doesn't trigger - falls through to high emotion check
      expect(result).toBeNull();
    });
  });

  describe('high emotion fallback', () => {
    it('should detect difficult admission on high emotion without pattern', () => {
      const result = detectReflectionMoment(
        'I made some really bad choices with money',
        'financial mistakes',
        'shame',
        0.8, // High emotion
        'session-1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('difficult_admission');
    });
  });

  describe('no match cases', () => {
    it('should return null for neutral statements', () => {
      const result = detectReflectionMoment(
        'The weather is nice today',
        'weather',
        'neutral',
        0.2,
        'session-1'
      );

      expect(result).toBeNull();
    });

    it('should return null for low emotion statements', () => {
      const result = detectReflectionMoment(
        "I think I'll go for a walk later",
        'activities',
        'neutral',
        0.1,
        'session-1'
      );

      expect(result).toBeNull();
    });
  });

  describe('emotional weight', () => {
    it('should set heavy weight for vulnerability', () => {
      const result = detectReflectionMoment(
        "I've never told anyone but I feel so alone",
        'loneliness',
        'sadness',
        0.5,
        'session-1'
      );

      expect(result?.emotionalWeight).toBe('heavy');
    });

    it('should set heavy weight for high intensity', () => {
      const result = detectReflectionMoment(
        "I'm going to change everything starting now",
        'life change',
        'anticipation',
        0.8, // High intensity
        'session-1'
      );

      expect(result?.emotionalWeight).toBe('heavy');
    });

    it('should set medium weight for goal commitments', () => {
      const result = detectReflectionMoment(
        "I'm going to exercise more",
        'fitness',
        'neutral',
        0.4,
        'session-1'
      );

      expect(result?.emotionalWeight).toBe('medium');
    });
  });

  describe('metadata', () => {
    it('should include personaId when provided', () => {
      const result = detectReflectionMoment(
        "I've decided to make a change",
        'life',
        'anticipation',
        0.5,
        'session-1',
        'ferni'
      );

      expect(result?.personaId).toBe('ferni');
    });

    it('should truncate long statements', () => {
      const longStatement = 'x'.repeat(1000);
      const result = detectReflectionMoment(
        `${longStatement} I've never told anyone`,
        'secrets',
        'neutral',
        0.5,
        'session-1'
      );

      expect(result?.userStatement.length).toBeLessThanOrEqual(500);
    });
  });
});

// ============================================================================
// REFLECTION GENERATION TESTS
// ============================================================================

describe('generateReflection', () => {
  it('should generate reflection for vulnerability moment', () => {
    const moment = createMoment({
      type: 'vulnerability_shared',
      reflectionSeed: 'what you shared about your struggles',
      topic: 'struggles',
    });

    const result = generateReflection(moment);

    expect(result.phrase).toBeDefined();
    expect(result.phrase.length).toBeGreaterThan(0);
    expect(result.momentId).toBe(moment.id);
    expect(result.appropriateness).toBeGreaterThan(0);
  });

  it('should generate reflection for breakthrough moment', () => {
    const moment = createMoment({
      type: 'breakthrough_moment',
      reflectionSeed: 'your realization about growth',
      topic: 'personal growth',
    });

    const result = generateReflection(moment);

    expect(result.phrase).toBeDefined();
    expect(result.appropriateness).toBeGreaterThan(0);
  });

  it('should generate reflection for goal commitment', () => {
    const moment = createMoment({
      type: 'goal_commitment',
      reflectionSeed: 'your commitment to exercise',
      topic: 'exercise',
    });

    const result = generateReflection(moment);

    expect(result.phrase).toBeDefined();
  });

  it('should include user name occasionally', () => {
    const moment = createMoment();

    // Run multiple times to test randomness
    let nameIncluded = false;
    for (let i = 0; i < 20; i++) {
      const result = generateReflection(moment, 'Alice');
      if (result.phrase.includes('Alice')) {
        nameIncluded = true;
        break;
      }
    }

    // With 30% chance, 20 tries should hit it
    // This is probabilistic but very likely
    expect(nameIncluded).toBe(true);
  });

  it('should substitute topic and seed in template', () => {
    const moment = createMoment({
      type: 'life_update',
      reflectionSeed: 'things with your new job',
      topic: 'new job',
    });

    const result = generateReflection(moment);

    expect(result.phrase).toMatch(/new job|things/i);
  });
});

// ============================================================================
// APPROPRIATENESS CALCULATION TESTS
// ============================================================================

describe('calculateAppropiateness', () => {
  it('should score heavy moments higher', () => {
    const heavyMoment = createMoment({ emotionalWeight: 'heavy' });
    const lightMoment = createMoment({ emotionalWeight: 'light' });

    const heavyScore = calculateAppropiateness(heavyMoment);
    const lightScore = calculateAppropiateness(lightMoment);

    expect(heavyScore).toBeGreaterThan(lightScore);
  });

  it('should score same-day moments lower', () => {
    const recentMoment = createMoment({ timestamp: new Date() });
    const oldMoment = createMoment({
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });

    const recentScore = calculateAppropiateness(recentMoment);
    const oldScore = calculateAppropiateness(oldMoment);

    expect(recentScore).toBeLessThan(oldScore);
  });

  it('should score already-reflected moments lower', () => {
    const unreflected = createMoment({ reflectedOn: false });
    const reflected = createMoment({ reflectedOn: true });

    const unreflectedScore = calculateAppropiateness(unreflected);
    const reflectedScore = calculateAppropiateness(reflected);

    expect(unreflectedScore).toBeGreaterThan(reflectedScore);
  });

  it('should score vulnerability moments higher', () => {
    const vulnerability = createMoment({ type: 'vulnerability_shared' });
    const lifeUpdate = createMoment({ type: 'life_update' });

    const vulnerabilityScore = calculateAppropiateness(vulnerability);
    const lifeUpdateScore = calculateAppropiateness(lifeUpdate);

    expect(vulnerabilityScore).toBeGreaterThan(lifeUpdateScore);
  });

  it('should clamp scores between 0 and 1', () => {
    const moment = createMoment({
      emotionalWeight: 'heavy',
      type: 'vulnerability_shared',
      reflectedOn: false,
      timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const score = calculateAppropiateness(moment);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// SELECTION TESTS
// ============================================================================

describe('selectBestReflection', () => {
  it('should return null when no moments', () => {
    const result = selectBestReflection([], ['topic'], 'neutral', 3);

    expect(result).toBeNull();
  });

  it('should return null when turn count too low', () => {
    const moments = [createMoment()];
    const result = selectBestReflection(moments, ['topic'], 'neutral', 1);

    expect(result).toBeNull();
  });

  it('should return null when turn count too high', () => {
    const moments = [createMoment()];
    const result = selectBestReflection(moments, ['topic'], 'neutral', 10);

    expect(result).toBeNull();
  });

  it('should filter out already-reflected moments', () => {
    const reflected = createMoment({ reflectedOn: true });
    const result = selectBestReflection([reflected], ['topic'], 'neutral', 3);

    expect(result).toBeNull();
  });

  it('should filter out same-day moments', () => {
    const todayMoment = createMoment({ timestamp: new Date() });
    const result = selectBestReflection([todayMoment], ['topic'], 'neutral', 3);

    expect(result).toBeNull();
  });

  it('should boost score for matching topics', () => {
    // Create two moments with same base score
    const matchingMoment = createMoment({
      topic: 'investing',
      emotionalWeight: 'medium',
    });
    const otherMoment = createMoment({
      topic: 'cooking',
      emotionalWeight: 'medium',
    });

    // Run selection multiple times - matching topic should be selected more often
    let matchingSelected = 0;
    for (let i = 0; i < 50; i++) {
      const result = selectBestReflection(
        [matchingMoment, otherMoment],
        ['investing', 'money'],
        'neutral',
        3
      );
      if (result?.momentId === matchingMoment.id) {
        matchingSelected++;
      }
    }

    // Should be selected significantly more often due to topic boost
    // Note: there's also randomness in selection
    expect(matchingSelected).toBeGreaterThan(5); // At least some matches
  });
});

// ============================================================================
// USER PROFILE INTEGRATION TESTS
// ============================================================================

describe('getReflectionMoments', () => {
  it('should return empty array for null profile', () => {
    const result = getReflectionMoments(null);

    expect(result).toEqual([]);
  });

  it('should return empty array for profile without moments', () => {
    const profile = createProfile();
    const result = getReflectionMoments(profile);

    expect(result).toEqual([]);
  });

  it('should return moments from profile', () => {
    const moments = [createMoment(), createMoment()];
    const profile = createProfile({ reflectionMoments: moments });

    const result = getReflectionMoments(profile);

    expect(result).toHaveLength(2);
  });
});

describe('saveReflectionMoment', () => {
  it('should initialize customData if missing', () => {
    const profile: UserProfile = { id: 'test' };
    const moment = createMoment();

    saveReflectionMoment(profile, moment);

    expect(profile.customData).toBeDefined();
    expect(profile.customData?.reflectionMoments).toHaveLength(1);
  });

  it('should add moment to existing array', () => {
    const existing = createMoment();
    const profile = createProfile({ reflectionMoments: [existing] });
    const newMoment = createMoment();

    saveReflectionMoment(profile, newMoment);

    const moments = profile.customData?.reflectionMoments as ReflectionMoment[];
    expect(moments).toHaveLength(2);
  });

  it('should keep max 20 moments', () => {
    const profile = createProfile({
      reflectionMoments: Array.from({ length: 20 }, () => createMoment()),
    });

    const newMoment = createMoment();
    saveReflectionMoment(profile, newMoment);

    const moments = profile.customData?.reflectionMoments as ReflectionMoment[];
    expect(moments).toHaveLength(20);
  });

  it('should prefer removing light moments when at capacity', () => {
    const lightMoment = createMoment({ emotionalWeight: 'light', id: 'light-1' });
    const heavyMoments = Array.from({ length: 19 }, () =>
      createMoment({ emotionalWeight: 'heavy' })
    );
    const profile = createProfile({
      reflectionMoments: [lightMoment, ...heavyMoments],
    });

    const newMoment = createMoment({ emotionalWeight: 'heavy', id: 'new' });
    saveReflectionMoment(profile, newMoment);

    const moments = profile.customData?.reflectionMoments as ReflectionMoment[];
    const hasLight = moments.some((m) => m.id === 'light-1');

    expect(hasLight).toBe(false); // Light moment should be removed
    expect(moments.some((m) => m.id === 'new')).toBe(true); // New moment should be there
  });
});

describe('markMomentReflectedOn', () => {
  it('should mark moment as reflected', () => {
    const moment = createMoment({ id: 'test-id' });
    const profile = createProfile({ reflectionMoments: [moment] });

    markMomentReflectedOn(profile, 'test-id');

    const moments = profile.customData?.reflectionMoments as ReflectionMoment[];
    expect(moments[0].reflectedOn).toBe(true);
    expect(moments[0].reflectedOnAt).toBeDefined();
  });

  it('should handle missing moment gracefully', () => {
    const profile = createProfile({ reflectionMoments: [] });

    expect(() => markMomentReflectedOn(profile, 'nonexistent')).not.toThrow();
  });
});

// ============================================================================
// TEMPLATE TESTS
// ============================================================================

describe('reflectionTemplates', () => {
  it('should have templates for all moment types', () => {
    const types: Array<ReflectionMoment['type']> = [
      'vulnerability_shared',
      'breakthrough_moment',
      'difficult_admission',
      'meaningful_question',
      'life_update',
      'goal_commitment',
      'fear_expressed',
      'joy_shared',
    ];

    for (const type of types) {
      expect(reflectionTemplates[type]).toBeDefined();
      expect(reflectionTemplates[type].length).toBeGreaterThan(0);
    }
  });

  it('should have templates containing placeholder tokens', () => {
    for (const templates of Object.values(reflectionTemplates)) {
      const hasPlaceholder = templates.some((t) => t.includes('{seed}') || t.includes('{topic}'));
      expect(hasPlaceholder).toBe(true);
    }
  });
});
