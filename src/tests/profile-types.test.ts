/**
 * Profile Types Tests
 *
 * Tests for the types/profile modules that provide user profile domain separation:
 * - identity.ts - User identity and contact info
 * - relationship.ts - AI relationship context
 * - financial.ts - Financial profile data
 * - migration.ts - Profile migration utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  createUserIdentity,
  type UserIdentity,
  type ContactInfo,
} from '../types/profile/identity.js';

import {
  createRelationshipContext,
  calculateRelationshipStage,
  type RelationshipContext,
  type KeyMoment,
  type FamilyMember,
  type EmotionalPattern,
} from '../types/profile/relationship.js';

import {
  createFinancialProfile,
  type FinancialProfile,
  type FinancialGoal,
} from '../types/profile/financial.js';

import { migrateUserProfile } from '../types/profile/migration.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// IDENTITY TESTS
// ============================================================================

describe('UserIdentity', () => {
  describe('createUserIdentity', () => {
    it('should create identity with just id', () => {
      const identity = createUserIdentity('user-123');

      expect(identity.id).toBe('user-123');
      expect(identity.name).toBeUndefined();
      expect(identity.totalConversations).toBe(0);
      expect(identity.totalMinutesTalked).toBe(0);
      expect(identity.version).toBe(1);
    });

    it('should create identity with id and name', () => {
      const identity = createUserIdentity('user-456', 'John Doe');

      expect(identity.id).toBe('user-456');
      expect(identity.name).toBe('John Doe');
    });

    it('should set timestamps to current time', () => {
      const before = new Date();
      const identity = createUserIdentity('user-789');
      const after = new Date();

      expect(identity.firstContact.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(identity.firstContact.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(identity.lastContact.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(identity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(identity.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should start with zero conversation metrics', () => {
      const identity = createUserIdentity('user-000');

      expect(identity.totalConversations).toBe(0);
      expect(identity.totalMinutesTalked).toBe(0);
    });
  });
});

// ============================================================================
// RELATIONSHIP TESTS
// ============================================================================

describe('RelationshipContext', () => {
  describe('createRelationshipContext', () => {
    it('should create default relationship context', () => {
      const context = createRelationshipContext();

      expect(context.stage).toBe('new_acquaintance');
      expect(context.familyMembers).toEqual([]);
      expect(context.keyMoments).toEqual([]);
      expect(context.sharedStories).toEqual([]);
      expect(context.emotionalPatterns).toEqual([]);
    });
  });

  describe('calculateRelationshipStage', () => {
    it('should return new_acquaintance for 0-2 conversations', () => {
      expect(calculateRelationshipStage(0, 0, [])).toBe('new_acquaintance');
      expect(calculateRelationshipStage(1, 10, [])).toBe('new_acquaintance');
      expect(calculateRelationshipStage(2, 30, [])).toBe('new_acquaintance');
    });

    it('should return getting_to_know for 3-5 conversations with < 60 minutes', () => {
      expect(calculateRelationshipStage(3, 30, [])).toBe('getting_to_know');
      expect(calculateRelationshipStage(4, 45, [])).toBe('getting_to_know');
      expect(calculateRelationshipStage(5, 59, [])).toBe('getting_to_know');
    });

    it('should return trusted_advisor for 5+ conversations', () => {
      expect(calculateRelationshipStage(5, 60, [])).toBe('trusted_advisor');
      expect(calculateRelationshipStage(6, 90, [])).toBe('trusted_advisor');
      expect(calculateRelationshipStage(9, 120, [])).toBe('trusted_advisor');
    });

    it('should return trusted_advisor with 1+ heavy emotional moment when past getting_to_know stage', () => {
      const heavyMoment: KeyMoment = {
        id: '1',
        timestamp: new Date(),
        type: 'shared_vulnerability',
        summary: 'Shared something deep',
        emotionalWeight: 'heavy',
        topics: ['personal'],
      };

      // Need to be past the getting_to_know check (>5 conversations OR >=60 minutes)
      expect(calculateRelationshipStage(6, 30, [heavyMoment])).toBe('trusted_advisor');
      expect(calculateRelationshipStage(4, 70, [heavyMoment])).toBe('trusted_advisor');
    });

    it('should return old_friend for 10+ conversations with 3+ heavy moments', () => {
      const heavyMoments: KeyMoment[] = [
        {
          id: '1',
          timestamp: new Date(),
          type: 'shared_vulnerability',
          summary: 'Moment 1',
          emotionalWeight: 'heavy',
          topics: [],
        },
        {
          id: '2',
          timestamp: new Date(),
          type: 'breakthrough',
          summary: 'Moment 2',
          emotionalWeight: 'heavy',
          topics: [],
        },
        {
          id: '3',
          timestamp: new Date(),
          type: 'milestone',
          summary: 'Moment 3',
          emotionalWeight: 'heavy',
          topics: [],
        },
      ];

      expect(calculateRelationshipStage(10, 200, heavyMoments)).toBe('old_friend');
      expect(calculateRelationshipStage(15, 300, heavyMoments)).toBe('old_friend');
    });

    it('should not return old_friend without enough heavy moments', () => {
      const lightMoments: KeyMoment[] = [
        {
          id: '1',
          timestamp: new Date(),
          type: 'celebration',
          summary: 'Moment 1',
          emotionalWeight: 'light',
          topics: [],
        },
        {
          id: '2',
          timestamp: new Date(),
          type: 'milestone',
          summary: 'Moment 2',
          emotionalWeight: 'medium',
          topics: [],
        },
      ];

      expect(calculateRelationshipStage(15, 300, lightMoments)).toBe('trusted_advisor');
    });

    it('should count only heavy moments for old_friend threshold', () => {
      const mixedMoments: KeyMoment[] = [
        {
          id: '1',
          timestamp: new Date(),
          type: 'breakthrough',
          summary: '',
          emotionalWeight: 'heavy',
          topics: [],
        },
        {
          id: '2',
          timestamp: new Date(),
          type: 'celebration',
          summary: '',
          emotionalWeight: 'light',
          topics: [],
        },
        {
          id: '3',
          timestamp: new Date(),
          type: 'milestone',
          summary: '',
          emotionalWeight: 'medium',
          topics: [],
        },
        {
          id: '4',
          timestamp: new Date(),
          type: 'decision',
          summary: '',
          emotionalWeight: 'heavy',
          topics: [],
        },
      ];

      // Only 2 heavy moments, so not old_friend yet
      expect(calculateRelationshipStage(12, 200, mixedMoments)).toBe('trusted_advisor');

      // Add a third heavy moment
      mixedMoments.push({
        id: '5',
        timestamp: new Date(),
        type: 'shared_vulnerability',
        summary: '',
        emotionalWeight: 'heavy',
        topics: [],
      });
      expect(calculateRelationshipStage(12, 200, mixedMoments)).toBe('old_friend');
    });
  });
});

// ============================================================================
// FINANCIAL TESTS
// ============================================================================

describe('FinancialProfile', () => {
  describe('createFinancialProfile', () => {
    it('should create default financial profile', () => {
      const profile = createFinancialProfile();

      expect(profile.riskProfile.tolerance).toBe('unknown');
      expect(profile.riskProfile.confidence).toBe(0);
      expect(profile.riskProfile.factors).toEqual([]);
      expect(profile.goals).toEqual([]);
      expect(profile.primaryConcerns).toEqual([]);
      expect(profile.investmentEvents).toEqual([]);
      expect(profile.hasInvestments).toBe(false);
      expect(profile.investmentExperience).toBe('unknown');
      expect(profile.financialAnxietyTriggers).toEqual([]);
    });

    it('should set risk assessment timestamp', () => {
      const before = new Date();
      const profile = createFinancialProfile();
      const after = new Date();

      expect(profile.riskProfile.assessedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(profile.riskProfile.assessedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});

// ============================================================================
// MIGRATION TESTS
// ============================================================================

describe('Profile Migration', () => {
  describe('migrateUserProfile', () => {
    it('should migrate basic user profile', () => {
      const legacy: UserProfile = {
        id: 'user-migrate-1',
        name: 'Jane Smith',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.identity.id).toBe('user-migrate-1');
      expect(composite.identity.name).toBe('Jane Smith');
      expect(composite.identity.createdAt).toEqual(new Date('2024-01-01'));
      expect(composite.relationship.stage).toBe('new_acquaintance');
      expect(composite.financial.hasInvestments).toBe(false);
    });

    it('should migrate communication style', () => {
      const legacy: UserProfile = {
        id: 'user-comm',
        communicationStyle: 'direct',
        speakingPace: 'fast',
        averageWPM: 180,
        preferredTopics: ['finance', 'tech'],
        avoidTopics: ['politics'],
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.communication.style).toBe('direct');
      expect(composite.communication.speakingPace).toBe('fast');
      expect(composite.communication.averageWPM).toBe(180);
      expect(composite.communication.preferredTopics).toEqual(['finance', 'tech']);
      expect(composite.communication.avoidTopics).toEqual(['politics']);
    });

    it('should migrate contact info', () => {
      const legacy: UserProfile = {
        id: 'user-contact',
        contactInfo: {
          phone: '+1234567890',
          email: 'test@example.com',
          preferredContactMethod: 'text_message',
          timezone: 'America/New_York',
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
        },
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.identity.contactInfo?.phone).toBe('+1234567890');
      expect(composite.identity.contactInfo?.email).toBe('test@example.com');
      expect(composite.identity.contactInfo?.preferredContactMethod).toBe('text_message');
      expect(composite.identity.contactInfo?.timezone).toBe('America/New_York');
    });

    it('should migrate relationship data', () => {
      const keyMoment: KeyMoment = {
        id: 'km-1',
        timestamp: new Date('2024-03-15'),
        type: 'breakthrough',
        summary: 'Had a breakthrough moment',
        emotionalWeight: 'heavy',
        topics: ['career'],
      };

      const familyMember: FamilyMember = {
        relationship: 'spouse',
        name: 'Alex',
        mentionedTopics: ['travel'],
      };

      const legacy: UserProfile = {
        id: 'user-rel',
        relationshipStage: 'trusted_advisor',
        keyMoments: [keyMoment],
        familyMembers: [familyMember],
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.relationship.stage).toBe('trusted_advisor');
      expect(composite.relationship.keyMoments).toHaveLength(1);
      expect(composite.relationship.keyMoments[0].id).toBe('km-1');
      expect(composite.relationship.familyMembers).toHaveLength(1);
      expect(composite.relationship.familyMembers[0].name).toBe('Alex');
    });

    it('should migrate financial data', () => {
      const legacy: UserProfile = {
        id: 'user-fin',
        riskProfile: {
          tolerance: 'moderate',
          confidence: 0.8,
          assessedAt: new Date(),
          factors: ['time_horizon', 'income'],
        },
        hasInvestments: true,
        goals: [
          {
            id: 'goal-1',
            name: 'Retirement',
            targetAmount: 1000000,
            currentProgress: 250000,
            timeframe: '20 years',
            priority: 'high',
            createdAt: new Date(),
          },
        ],
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.financial.riskProfile.tolerance).toBe('moderate');
      expect(composite.financial.riskProfile.confidence).toBe(0.8);
      expect(composite.financial.hasInvestments).toBe(true);
      expect(composite.financial.goals).toHaveLength(1);
      expect(composite.financial.goals[0].name).toBe('Retirement');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimal: UserProfile = {
        id: 'minimal-user',
      };

      const composite = migrateUserProfile(minimal);

      expect(composite.identity.id).toBe('minimal-user');
      expect(composite.identity.name).toBeUndefined();
      expect(composite.identity.contactInfo).toBeUndefined();
      expect(composite.communication.style).toBe('mixed');
      expect(composite.communication.speakingPace).toBe('moderate');
      expect(composite.relationship.stage).toBe('new_acquaintance');
      expect(composite.financial.riskProfile.tolerance).toBe('unknown');
    });

    it('should set default timestamps when not provided', () => {
      const before = new Date();
      const legacy: UserProfile = {
        id: 'no-dates',
      };

      const composite = migrateUserProfile(legacy);
      const after = new Date();

      expect(composite.identity.firstContact.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(composite.identity.lastContact.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(composite.identity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should preserve conversation metrics', () => {
      const legacy: UserProfile = {
        id: 'user-metrics',
        totalConversations: 42,
        totalMinutesTalked: 350,
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.identity.totalConversations).toBe(42);
      expect(composite.identity.totalMinutesTalked).toBe(350);
    });

    it('should set session-specific fields to undefined', () => {
      const legacy: UserProfile = {
        id: 'user-session',
      };

      const composite = migrateUserProfile(legacy);

      expect(composite.currentSessionId).toBeUndefined();
      expect(composite.currentMood).toBeUndefined();
      expect(composite.currentEnergyLevel).toBeUndefined();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Profile Types Integration', () => {
  it('should work together in a typical user journey', () => {
    // New user starts
    const identity = createUserIdentity('journey-user', 'Journey Test');
    expect(identity.totalConversations).toBe(0);

    // Create relationship context
    const relationship = createRelationshipContext();
    expect(relationship.stage).toBe('new_acquaintance');

    // Create financial profile
    const financial = createFinancialProfile();
    expect(financial.riskProfile.tolerance).toBe('unknown');

    // Simulate progression
    const stage1 = calculateRelationshipStage(1, 10, []);
    expect(stage1).toBe('new_acquaintance');

    const stage2 = calculateRelationshipStage(5, 60, []);
    expect(stage2).toBe('trusted_advisor');
  });
});
