/**
 * Profile Migration Tests
 *
 * Tests for migrating between legacy UserProfile and
 * CompositeUserProfile aggregate structures.
 */

import { describe, it, expect } from 'vitest';

import {
  detectProfileFormat,
  migrateToComposite,
  migrateToLegacy,
  createUnifiedProfile,
} from '../types/migration/profile-migrator.js';

// Canonical function aliases for readability in tests
const migrateUserProfile = migrateToComposite;
const toLegacyProfile = migrateToLegacy;
const isLegacyProfile = (p: unknown): p is UserProfile => detectProfileFormat(p) === 'legacy';
const isCompositeProfile = (p: unknown): p is CompositeUserProfile =>
  detectProfileFormat(p) === 'composite';
const ensureCompositeProfile = (p: UserProfile | CompositeUserProfile): CompositeUserProfile => {
  const format = detectProfileFormat(p);
  if (format === 'composite') return p as CompositeUserProfile;
  if (format === 'legacy') return migrateToComposite(p as UserProfile);
  throw new Error('Unknown profile format');
};

import { createCommunicationProfile } from '../types/profile/communication.js';
import { createConversationMemory } from '../types/profile/conversation-memory.js';

import type { UserProfile } from '../types/user-profile.js';
import type { CompositeUserProfile } from '../types/profile/index.js';

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createCommunicationProfile', () => {
  it('should create a default communication profile', () => {
    const profile = createCommunicationProfile();

    expect(profile.style).toBe('mixed');
    expect(profile.speakingPace).toBe('moderate');
    expect(profile.humorAppreciation).toBe('medium');
    expect(profile.preferredTopics).toEqual([]);
    expect(profile.avoidTopics).toEqual([]);
    expect(profile.verbosity).toBe('balanced');
    expect(profile.wantsProactiveAdvice).toBe(true);
    expect(profile.financialPrivacyLevel).toBe('moderate');
  });
});

describe('createConversationMemory', () => {
  it('should create empty conversation memory', () => {
    const memory = createConversationMemory();

    expect(memory.summaries).toEqual([]);
    expect(memory.openQuestions).toEqual([]);
    expect(memory.pendingFollowUps).toEqual([]);
    expect(memory.lastSummary).toBeUndefined();
  });
});

// ============================================================================
// LEGACY PROFILE DETECTION TESTS
// ============================================================================

describe('isLegacyProfile', () => {
  it('should return true for legacy profile structure', () => {
    const legacy = createMinimalLegacyProfile();
    expect(isLegacyProfile(legacy)).toBe(true);
  });

  it('should return false for composite profile', () => {
    const composite = createMinimalCompositeProfile();
    expect(isLegacyProfile(composite)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isLegacyProfile(null)).toBe(false);
    expect(isLegacyProfile(undefined)).toBe(false);
  });

  it('should return false for non-object types', () => {
    expect(isLegacyProfile('string')).toBe(false);
    expect(isLegacyProfile(123)).toBe(false);
    expect(isLegacyProfile(true)).toBe(false);
  });

  it('should return false for objects missing required fields', () => {
    expect(isLegacyProfile({})).toBe(false);
    expect(isLegacyProfile({ id: 'test' })).toBe(false);
    expect(isLegacyProfile({ relationshipStage: 'new' })).toBe(false);
  });
});

describe('isCompositeProfile', () => {
  it('should return true for composite profile structure', () => {
    const composite = createMinimalCompositeProfile();
    expect(isCompositeProfile(composite)).toBe(true);
  });

  it('should return false for legacy profile', () => {
    const legacy = createMinimalLegacyProfile();
    expect(isCompositeProfile(legacy)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isCompositeProfile(null)).toBe(false);
    expect(isCompositeProfile(undefined)).toBe(false);
  });

  it('should return false for objects missing aggregate fields', () => {
    expect(isCompositeProfile({})).toBe(false);
    expect(isCompositeProfile({ identity: {} })).toBe(false);
    expect(
      isCompositeProfile({
        identity: {},
        communication: {},
        relationship: {},
        financial: {},
        // missing memory
      })
    ).toBe(false);
  });
});

// ============================================================================
// MIGRATION TESTS
// ============================================================================

describe('migrateUserProfile', () => {
  it('should migrate minimal legacy profile', () => {
    const legacy = createMinimalLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.identity.id).toBe(legacy.id);
    expect(composite.identity.name).toBe(legacy.name);
    expect(composite.relationship.stage).toBe(legacy.relationshipStage);
  });

  it('should migrate identity fields', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.identity.id).toBe('user-123');
    expect(composite.identity.name).toBe('John Doe');
    expect(composite.identity.preferredName).toBe('Johnny');
    expect(composite.identity.totalConversations).toBe(10);
    expect(composite.identity.totalMinutesTalked).toBe(120);
  });

  it('should migrate communication fields', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.communication.style).toBe('casual');
    expect(composite.communication.speakingPace).toBe('fast');
    expect(composite.communication.humorAppreciation).toBe('high');
    expect(composite.communication.preferredTopics).toContain('sports');
    expect(composite.communication.avoidTopics).toContain('politics');
  });

  it('should migrate relationship fields', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.relationship.stage).toBe('trusted_friend');
    expect(composite.relationship.familyMembers).toHaveLength(2);
    expect(composite.relationship.keyMoments).toHaveLength(1);
  });

  it('should migrate financial fields', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.financial.hasInvestments).toBe(true);
    expect(composite.financial.investmentExperience).toBe('intermediate');
    expect(composite.financial.goals).toHaveLength(1);
    expect(composite.financial.riskProfile?.tolerance).toBe('moderate');
  });

  it('should migrate conversation memory', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.memory.openQuestions).toContain('What about retirement?');
    expect(composite.memory.pendingFollowUps).toHaveLength(1);
  });

  it('should preserve life stage', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.lifeStage).toBe('mid_career');
  });

  it('should handle missing optional fields gracefully', () => {
    const legacy = createMinimalLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.communication.preferredTopics).toEqual([]);
    expect(composite.communication.avoidTopics).toEqual([]);
    expect(composite.relationship.familyMembers).toEqual([]);
    expect(composite.financial.goals).toEqual([]);
    expect(composite.memory.summaries).toEqual([]);
  });

  it('should use defaults for missing style fields', () => {
    const legacy = createMinimalLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.communication.style).toBe('mixed');
    expect(composite.communication.speakingPace).toBe('moderate');
    expect(composite.communication.humorAppreciation).toBe('medium');
    expect(composite.communication.verbosity).toBe('balanced');
  });

  it('should migrate contact info', () => {
    const legacy = createFullLegacyProfile();
    const composite = migrateUserProfile(legacy);

    expect(composite.identity.contactInfo).toBeDefined();
    expect(composite.identity.contactInfo?.phone).toBe('+14155551234');
    expect(composite.identity.contactInfo?.email).toBe('john@example.com');
    expect(composite.identity.contactInfo?.preferredContactMethod).toBe('voice_message');
  });
});

// ============================================================================
// ENSURE COMPOSITE PROFILE TESTS
// ============================================================================

describe('ensureCompositeProfile', () => {
  it('should return composite profile as-is', () => {
    const composite = createMinimalCompositeProfile();
    const result = ensureCompositeProfile(composite);

    expect(result).toBe(composite);
  });

  it('should migrate legacy profile to composite', () => {
    const legacy = createMinimalLegacyProfile();
    const result = ensureCompositeProfile(legacy);

    expect(isCompositeProfile(result)).toBe(true);
    expect(result.identity.id).toBe(legacy.id);
  });

  it('should throw for unknown profile format', () => {
    const unknown = { random: 'data' };

    expect(() => ensureCompositeProfile(unknown as UserProfile)).toThrow('Unknown profile format');
  });
});

// ============================================================================
// TO LEGACY PROFILE TESTS
// ============================================================================

describe('toLegacyProfile', () => {
  it('should convert composite back to legacy format', () => {
    const composite = createMinimalCompositeProfile();
    const legacy = toLegacyProfile(composite);

    expect(legacy.id).toBe(composite.identity.id);
    expect(legacy.name).toBe(composite.identity.name);
    expect(legacy.relationshipStage).toBe(composite.relationship.stage);
  });

  it('should preserve all identity fields', () => {
    const composite = createFullCompositeProfile();
    const legacy = toLegacyProfile(composite);

    expect(legacy.preferredName).toBe('Johnny');
    expect(legacy.totalConversations).toBe(10);
    expect(legacy.totalMinutesTalked).toBe(120);
    expect(legacy.contactInfo?.phone).toBe('+14155551234');
  });

  it('should preserve all communication fields', () => {
    const composite = createFullCompositeProfile();
    const legacy = toLegacyProfile(composite);

    expect(legacy.communicationStyle).toBe('casual');
    expect(legacy.speakingPace).toBe('fast');
    expect(legacy.humorAppreciation).toBe('high');
    expect(legacy.preferredTopics).toContain('sports');
    expect(legacy.preferences?.verbosity).toBe('storytelling');
  });

  it('should preserve all relationship fields', () => {
    const composite = createFullCompositeProfile();
    const legacy = toLegacyProfile(composite);

    expect(legacy.familyMembers).toHaveLength(2);
    expect(legacy.keyMoments).toHaveLength(1);
  });

  it('should preserve all financial fields', () => {
    const composite = createFullCompositeProfile();
    const legacy = toLegacyProfile(composite);

    expect(legacy.hasInvestments).toBe(true);
    expect(legacy.investmentExperience).toBe('intermediate');
    expect(legacy.goals).toHaveLength(1);
    expect(legacy.riskProfile?.tolerance).toBe('moderate');
  });

  it('should round-trip: legacy -> composite -> legacy preserves data', () => {
    const original = createFullLegacyProfile();
    const composite = migrateUserProfile(original);
    const roundTripped = toLegacyProfile(composite);

    // Core fields should be preserved
    expect(roundTripped.id).toBe(original.id);
    expect(roundTripped.name).toBe(original.name);
    expect(roundTripped.relationshipStage).toBe(original.relationshipStage);
    expect(roundTripped.communicationStyle).toBe(original.communicationStyle);
    expect(roundTripped.hasInvestments).toBe(original.hasInvestments);
    expect(roundTripped.preferredTopics).toEqual(original.preferredTopics);
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createMinimalLegacyProfile(): UserProfile {
  return {
    id: 'user-min',
    name: 'Test User',
    relationshipStage: 'new_acquaintance',
    version: 1,
  } as UserProfile;
}

function createFullLegacyProfile(): UserProfile {
  const now = new Date();
  return {
    id: 'user-123',
    name: 'John Doe',
    preferredName: 'Johnny',
    relationshipStage: 'trusted_friend',
    lifeStage: 'mid_career',

    // Communication
    communicationStyle: 'casual',
    speakingPace: 'fast',
    humorAppreciation: 'high',
    preferredTopics: ['sports', 'tech'],
    avoidTopics: ['politics'],
    preferences: {
      verbosity: 'storytelling',
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'open',
    },

    // Contact
    contactInfo: {
      phone: '+14155551234',
      email: 'john@example.com',
      preferredContactMethod: 'voice_message',
    },

    // Stats
    totalConversations: 10,
    totalMinutesTalked: 120,
    firstContact: now,
    lastContact: now,

    // Relationship
    familyMembers: [
      { name: 'Jane', relationship: 'spouse' },
      { name: 'Jake', relationship: 'child' },
    ],
    keyMoments: [{ summary: 'First conversation', timestamp: now }],

    // Financial
    hasInvestments: true,
    investmentExperience: 'intermediate',
    goals: [{ name: 'Retirement', target: 1000000 }],
    riskProfile: {
      tolerance: 'moderate',
      confidence: 0.8,
      assessedAt: now,
      factors: [],
    },

    // Memory
    openQuestions: ['What about retirement?'],
    pendingFollowUps: [{ topic: 'Follow up on goals', targetDate: now, reason: 'Weekly check' }],

    // Timestamps
    createdAt: now,
    updatedAt: now,
    version: 1,
  } as UserProfile;
}

function createMinimalCompositeProfile(): CompositeUserProfile {
  const now = new Date();
  return {
    identity: {
      id: 'user-comp-min',
      name: 'Composite User',
      linkedIdentifiers: [],
      firstContact: now,
      lastContact: now,
      totalConversations: 0,
      totalMinutesTalked: 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    communication: {
      style: 'mixed',
      speakingPace: 'moderate',
      humorAppreciation: 'medium',
      preferredTopics: [],
      avoidTopics: [],
      verbosity: 'balanced',
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'moderate',
    },
    relationship: {
      stage: 'new_acquaintance',
      familyMembers: [],
      keyMoments: [],
      sharedStories: [],
      emotionalPatterns: [],
    },
    financial: {
      riskProfile: {
        tolerance: 'unknown',
        confidence: 0,
        assessedAt: now,
        factors: [],
      },
      goals: [],
      primaryConcerns: [],
      investmentEvents: [],
      hasInvestments: false,
      investmentExperience: 'unknown',
      financialAnxietyTriggers: [],
    },
    memory: {
      summaries: [],
      openQuestions: [],
      pendingFollowUps: [],
    },
  };
}

function createFullCompositeProfile(): CompositeUserProfile {
  const now = new Date();
  return {
    identity: {
      id: 'user-comp-full',
      name: 'John Doe',
      preferredName: 'Johnny',
      linkedIdentifiers: ['google-123'],
      contactInfo: {
        phone: '+14155551234',
        email: 'john@example.com',
        preferredContactMethod: 'voice_message',
      },
      firstContact: now,
      lastContact: now,
      totalConversations: 10,
      totalMinutesTalked: 120,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    communication: {
      style: 'casual',
      speakingPace: 'fast',
      humorAppreciation: 'high',
      preferredTopics: ['sports', 'tech'],
      avoidTopics: ['politics'],
      verbosity: 'storytelling',
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'open',
    },
    relationship: {
      stage: 'trusted_friend',
      familyMembers: [
        { name: 'Jane', relationship: 'spouse' },
        { name: 'Jake', relationship: 'child' },
      ],
      keyMoments: [{ summary: 'First conversation', timestamp: now }],
      sharedStories: [],
      emotionalPatterns: [],
    },
    financial: {
      riskProfile: {
        tolerance: 'moderate',
        confidence: 0.8,
        assessedAt: now,
        factors: [],
      },
      goals: [{ name: 'Retirement', target: 1000000 }],
      primaryConcerns: [],
      investmentEvents: [],
      hasInvestments: true,
      investmentExperience: 'intermediate',
      financialAnxietyTriggers: [],
    },
    memory: {
      summaries: [],
      openQuestions: ['What about retirement?'],
      pendingFollowUps: [{ topic: 'Follow up', targetDate: now, reason: 'Check' }],
    },
    lifeStage: 'mid_career',
  };
}
