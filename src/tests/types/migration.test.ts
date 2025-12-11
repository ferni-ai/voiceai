/**
 * Tests for Profile Migration Utilities
 *
 * Tests the migration utilities that convert between UserProfile and CompositeUserProfile.
 * Verifies round-trip conversion integrity and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectProfileFormat,
  needsMigration,
  migrateToComposite,
  migrateToLegacy,
  UnifiedProfileAdapter,
  createUnifiedProfile,
  migrateProfileBatch,
  mergeProfileUpdate,
  diffProfiles,
  type ProfileFormat,
} from '../../types/migration/index.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { CompositeUserProfile } from '../../types/profile/index.js';
import { createCompositeUserProfile } from '../../types/profile/index.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createMockLegacyProfile(overrides?: Partial<UserProfile>): UserProfile {
  return {
    id: 'user_123',
    name: 'Test User',
    preferredName: 'Testy',
    relationshipStage: 'friend',
    totalConversations: 15,
    totalMinutesTalked: 120,
    firstContact: new Date('2024-01-01'),
    lastContact: new Date('2024-06-01'),
    communicationStyle: 'casual',
    speakingPace: 'moderate',
    preferredTopics: ['technology', 'wellness'],
    avoidTopics: ['politics'],
    humorAppreciation: 'high',
    familyMembers: [
      {
        name: 'Jane',
        relationship: 'spouse',
        context: 'Works from home',
        firstMentioned: new Date('2024-01-15'),
        sentiment: 'positive',
      },
    ],
    keyMoments: [
      {
        date: new Date('2024-03-01'),
        summary: 'Got a promotion',
        emotionalWeight: 'significant',
        themes: ['career'],
        followUpNeeded: true,
      },
    ],
    sharedStories: [],
    emotionalPatterns: [],
    goals: [
      {
        id: 'goal_1',
        name: 'Learn Spanish',
        status: 'active',
        createdAt: new Date('2024-02-01'),
        category: 'learning',
        progressNotes: [],
      },
    ],
    primaryConcerns: [],
    investmentEvents: [],
    conversationSummaries: [],
    openQuestions: ['How is the new job going?'],
    pendingFollowUps: [],
    preferences: {
      verbosity: 'balanced',
      wantsProactiveAdvice: true,
      financialPrivacyLevel: 'moderate',
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-06-01'),
    version: 1,
    ...overrides,
  } as UserProfile;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Profile Migration', () => {
  describe('detectProfileFormat', () => {
    it('should detect legacy profile format', () => {
      const legacy = createMockLegacyProfile();
      expect(detectProfileFormat(legacy)).toBe('legacy');
    });

    it('should detect composite profile format', () => {
      const composite = createCompositeUserProfile('user_456');
      expect(detectProfileFormat(composite)).toBe('composite');
    });

    it('should return unknown for invalid input', () => {
      expect(detectProfileFormat(null)).toBe('unknown');
      expect(detectProfileFormat(undefined)).toBe('unknown');
      expect(detectProfileFormat({})).toBe('unknown');
      expect(detectProfileFormat('string')).toBe('unknown');
    });
  });

  describe('needsMigration', () => {
    it('should return true for legacy profiles', () => {
      const legacy = createMockLegacyProfile();
      expect(needsMigration(legacy)).toBe(true);
    });

    it('should return false for composite profiles', () => {
      const composite = createCompositeUserProfile('user_456');
      expect(needsMigration(composite)).toBe(false);
    });

    it('should return false for invalid input', () => {
      expect(needsMigration(null)).toBe(false);
      expect(needsMigration(undefined)).toBe(false);
    });
  });

  describe('migrateToComposite', () => {
    it('should migrate basic fields correctly', () => {
      const legacy = createMockLegacyProfile();
      const composite = migrateToComposite(legacy);

      // Identity fields
      expect(composite.identity.id).toBe('user_123');
      expect(composite.identity.name).toBe('Test User');
      expect(composite.identity.preferredName).toBe('Testy');
      expect(composite.identity.totalConversations).toBe(15);
    });

    it('should migrate communication preferences', () => {
      const legacy = createMockLegacyProfile();
      const composite = migrateToComposite(legacy);

      expect(composite.communication.style).toBe('casual');
      expect(composite.communication.speakingPace).toBe('moderate');
      expect(composite.communication.preferredTopics).toContain('technology');
      expect(composite.communication.avoidTopics).toContain('politics');
    });

    it('should migrate relationship context', () => {
      const legacy = createMockLegacyProfile();
      const composite = migrateToComposite(legacy);

      expect(composite.relationship.stage).toBe('friend');
      expect(composite.relationship.familyMembers).toHaveLength(1);
      expect(composite.relationship.familyMembers[0].name).toBe('Jane');
      expect(composite.relationship.keyMoments).toHaveLength(1);
    });

    it('should migrate financial context', () => {
      const legacy = createMockLegacyProfile({
        hasInvestments: true,
        investmentExperience: 'moderate',
      });
      const composite = migrateToComposite(legacy);

      expect(composite.financial.hasInvestments).toBe(true);
      expect(composite.financial.investmentExperience).toBe('moderate');
    });

    it('should migrate conversation memory', () => {
      const legacy = createMockLegacyProfile({
        lastConversationSummary: 'Discussed career goals',
        openQuestions: ['How is the project?'],
      });
      const composite = migrateToComposite(legacy);

      expect(composite.memory.lastSummary).toBe('Discussed career goals');
      expect(composite.memory.openQuestions).toContain('How is the project?');
    });
  });

  describe('migrateToLegacy (round-trip)', () => {
    it('should round-trip basic fields', () => {
      const original = createMockLegacyProfile();
      const composite = migrateToComposite(original);
      const roundTripped = migrateToLegacy(composite);

      expect(roundTripped.id).toBe(original.id);
      expect(roundTripped.name).toBe(original.name);
      expect(roundTripped.preferredName).toBe(original.preferredName);
      expect(roundTripped.relationshipStage).toBe(original.relationshipStage);
    });

    it('should preserve communication preferences', () => {
      const original = createMockLegacyProfile();
      const composite = migrateToComposite(original);
      const roundTripped = migrateToLegacy(composite);

      expect(roundTripped.communicationStyle).toBe(original.communicationStyle);
      expect(roundTripped.speakingPace).toBe(original.speakingPace);
    });

    it('should preserve family members', () => {
      const original = createMockLegacyProfile();
      const composite = migrateToComposite(original);
      const roundTripped = migrateToLegacy(composite);

      expect(roundTripped.familyMembers).toHaveLength(original.familyMembers.length);
      expect(roundTripped.familyMembers[0].name).toBe(original.familyMembers[0].name);
    });
  });

  describe('UnifiedProfileAdapter', () => {
    it('should work with legacy profiles', () => {
      const legacy = createMockLegacyProfile();
      const adapter = new UnifiedProfileAdapter(legacy);

      expect(adapter.wasLegacy).toBe(true);
      expect(adapter.id).toBe('user_123');
      expect(adapter.name).toBe('Test User');
      expect(adapter.relationshipStage).toBe('friend');
    });

    it('should work with composite profiles', () => {
      const composite = createCompositeUserProfile('user_456', 'Composite User');
      const adapter = new UnifiedProfileAdapter(composite);

      expect(adapter.wasLegacy).toBe(false);
      expect(adapter.id).toBe('user_456');
      expect(adapter.name).toBe('Composite User');
    });

    it('should provide both formats', () => {
      const legacy = createMockLegacyProfile();
      const adapter = new UnifiedProfileAdapter(legacy);

      // Access composite format
      expect(adapter.composite.identity.id).toBe('user_123');

      // Access legacy format
      expect(adapter.legacy.id).toBe('user_123');
    });

    it('should provide summary', () => {
      const legacy = createMockLegacyProfile();
      const adapter = new UnifiedProfileAdapter(legacy);

      const summary = adapter.summary;
      expect(summary.id).toBe('user_123');
      expect(summary.name).toBe('Test User');
      expect(summary.totalConversations).toBe(15);
    });
  });

  describe('createUnifiedProfile', () => {
    it('should create adapter from legacy profile', () => {
      const legacy = createMockLegacyProfile();
      const adapter = createUnifiedProfile(legacy);

      expect(adapter.wasLegacy).toBe(true);
      expect(adapter.id).toBe('user_123');
    });

    it('should create adapter from composite profile', () => {
      const composite = createCompositeUserProfile('user_789');
      const adapter = createUnifiedProfile(composite);

      expect(adapter.wasLegacy).toBe(false);
      expect(adapter.id).toBe('user_789');
    });
  });

  describe('migrateProfileBatch', () => {
    it('should migrate multiple profiles', () => {
      const profiles = [
        createMockLegacyProfile({ id: 'user_1' }),
        createMockLegacyProfile({ id: 'user_2' }),
        createMockLegacyProfile({ id: 'user_3' }),
      ];

      const { migrated, result } = migrateProfileBatch(profiles);

      expect(migrated).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.migrated).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed formats', () => {
      const profiles = [
        createMockLegacyProfile({ id: 'user_1' }),
        createCompositeUserProfile('user_2'),
        createMockLegacyProfile({ id: 'user_3' }),
      ];

      const { migrated, result } = migrateProfileBatch(profiles);

      expect(migrated).toHaveLength(3);
      expect(result.migrated).toBe(3);
    });

    it('should skip already migrated when option set', () => {
      const profiles = [
        createMockLegacyProfile({ id: 'user_1' }),
        createCompositeUserProfile('user_2'),
      ];

      const { migrated, result } = migrateProfileBatch(profiles, { skipAlreadyMigrated: true });

      expect(migrated).toHaveLength(1);
      expect(result.skipped).toBe(1);
    });

    it('should record duration', () => {
      const profiles = [createMockLegacyProfile()];
      const { result } = migrateProfileBatch(profiles);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('mergeProfileUpdate', () => {
    it('should merge partial updates', () => {
      const profile = createCompositeUserProfile('user_123', 'Original Name');

      const updated = mergeProfileUpdate(profile, {
        identity: { ...profile.identity, name: 'Updated Name' },
      });

      expect(updated.identity.name).toBe('Updated Name');
      expect(updated.identity.id).toBe('user_123');
    });

    it('should preserve unupdated aggregates', () => {
      const profile = createCompositeUserProfile('user_123');
      profile.communication.style = 'casual';

      const updated = mergeProfileUpdate(profile, {
        identity: { ...profile.identity, preferredName: 'Nick' },
      });

      expect(updated.communication.style).toBe('casual');
    });
  });

  describe('diffProfiles', () => {
    it('should detect changed aggregates', () => {
      const before = createCompositeUserProfile('user_123', 'Before');
      const after = createCompositeUserProfile('user_123', 'After');

      const diff = diffProfiles(before, after);

      expect(diff.changed).toContain('identity');
    });

    it('should detect added optional aggregates', () => {
      // Create profile without optional aggregates
      const before = createCompositeUserProfile('user_123');
      // Remove entertainment from before to simulate it being missing
      const beforeWithoutEntertainment = { ...before, entertainment: undefined };

      const diff = diffProfiles(
        beforeWithoutEntertainment as CompositeUserProfile,
        before
      );

      expect(diff.added).toContain('entertainment');
    });

    it('should detect removed optional aggregates', () => {
      // Create profile with entertainment
      const before = createCompositeUserProfile('user_123');
      // Create profile without entertainment
      const after = { ...before, entertainment: undefined };

      const diff = diffProfiles(before, after as CompositeUserProfile);

      expect(diff.removed).toContain('entertainment');
    });

    it('should detect no changes when profiles are identical', () => {
      const profile = createCompositeUserProfile('user_123');
      const diff = diffProfiles(profile, profile);

      expect(diff.changed).toHaveLength(0);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });
  });
});
