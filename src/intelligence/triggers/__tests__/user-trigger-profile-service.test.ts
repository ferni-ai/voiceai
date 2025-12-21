/**
 * User Trigger Profile Service Tests
 *
 * Tests for Phase 2: Personal Memory Integration storage service.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  UserTriggerProfileService,
  getUserTriggerProfileService,
  resetUserTriggerProfileService,
} from '../user-trigger-profile-service.js';
import type {
  SignificantDate,
  Relationship,
  ProfileExtractionResult,
} from '../user-trigger-profile.types.js';

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn().mockImplementation(() => {
    const data = new Map<string, unknown>();

    return {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
              get: vi.fn().mockResolvedValue({
                exists: data.has('profile'),
                data: () => data.get('profile'),
              }),
              set: vi.fn().mockImplementation((profile) => {
                data.set('profile', profile);
                return Promise.resolve();
              }),
              update: vi.fn().mockResolvedValue(undefined),
              delete: vi.fn().mockImplementation(() => {
                data.delete('profile');
                return Promise.resolve();
              }),
            }),
          }),
        }),
      }),
    };
  }),
}));

describe('UserTriggerProfileService', () => {
  let service: UserTriggerProfileService;

  beforeEach(() => {
    resetUserTriggerProfileService();
    // Create fresh instance for each test
    service = new UserTriggerProfileService({ enablePersistence: false });
    // Clear any existing cache
    service.clearAllCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Ensure clean state after each test
    service.clearAllCache();
  });

  describe('loadProfile', () => {
    it('should create a default profile for new users', async () => {
      const profile = await service.loadProfile('user123');

      expect(profile).toBeDefined();
      expect(profile.userId).toBe('user123');
      expect(profile.significantDates).toEqual([]);
      expect(profile.relationships).toEqual([]);
      expect(profile.conversationsAnalyzed).toBe(0);
      expect(profile.profileConfidence).toBe(0);
    });

    it('should return cached profile on subsequent calls', async () => {
      const profile1 = await service.loadProfile('user123');
      const profile2 = await service.loadProfile('user123');

      expect(profile1).toBe(profile2); // Same object reference
    });
  });

  describe('saveProfile', () => {
    it('should save profile and update cache', async () => {
      const profile = await service.loadProfile('user123');
      profile.conversationsAnalyzed = 5;

      const success = await service.saveProfile('user123', profile);

      expect(success).toBe(true);

      const reloaded = await service.loadProfile('user123');
      expect(reloaded.conversationsAnalyzed).toBe(5);
    });
  });

  describe('addSignificantDate', () => {
    it('should add a new significant date', async () => {
      const date: SignificantDate = {
        id: 'date1',
        date: '2024-03-15',
        isRecurring: true,
        type: 'birthday',
        description: "Mom's birthday",
        relatedPerson: 'Mom',
        emotionalWeight: 0.8,
        triggerCategories: ['relational', 'temporal'],
        extractedAt: new Date(),
        confidence: 0.9,
        source: 'explicit',
      };

      const success = await service.addSignificantDate('user123', date);

      expect(success).toBe(true);

      const profile = await service.loadProfile('user123');
      expect(profile.significantDates.length).toBe(1);
      expect(profile.significantDates[0].description).toBe("Mom's birthday");
    });

    it('should update existing date if confidence is higher', async () => {
      const date1: SignificantDate = {
        id: 'date1',
        date: '2024-03-15',
        isRecurring: true,
        type: 'birthday',
        description: "Mom's birthday",
        relatedPerson: 'Mom',
        emotionalWeight: 0.5,
        triggerCategories: ['temporal'],
        extractedAt: new Date(),
        confidence: 0.6,
        source: 'inferred',
      };

      const date2: SignificantDate = {
        id: 'date2',
        date: '2024-03-15',
        isRecurring: true,
        type: 'birthday',
        description: "Mom's birthday - important!",
        relatedPerson: 'Mom',
        emotionalWeight: 0.9,
        triggerCategories: ['temporal', 'relational'],
        extractedAt: new Date(),
        confidence: 0.95,
        source: 'explicit',
      };

      await service.addSignificantDate('user123', date1);
      await service.addSignificantDate('user123', date2);

      const profile = await service.loadProfile('user123');
      expect(profile.significantDates.length).toBe(1);
      expect(profile.significantDates[0].confidence).toBe(0.95);
      expect(profile.significantDates[0].emotionalWeight).toBe(0.9);
    });
  });

  describe('addRelationship', () => {
    it('should add a new relationship', async () => {
      const relationship: Relationship = {
        id: 'rel1',
        name: 'Sarah',
        aliases: ['Sarah Smith', 'my wife'],
        type: 'romantic',
        role: 'wife',
        emotionalValence: 'very_positive',
        isDeceased: false,
        triggerCategories: ['relational'],
        mentionFrequency: 5.2,
        associatedTopics: ['family', 'weekend plans'],
        extractedAt: new Date(),
        confidence: 0.9,
      };

      const success = await service.addRelationship('user123', relationship);

      expect(success).toBe(true);

      const profile = await service.loadProfile('user123');
      expect(profile.relationships.length).toBe(1);
      expect(profile.relationships[0].name).toBe('Sarah');
    });

    it('should merge relationships with matching names', async () => {
      const rel1: Relationship = {
        id: 'rel1',
        name: 'Sarah',
        aliases: ['my wife'],
        type: 'romantic',
        role: 'wife',
        emotionalValence: 'positive',
        isDeceased: false,
        triggerCategories: ['relational'],
        mentionFrequency: 2.0,
        associatedTopics: ['family'],
        extractedAt: new Date(),
        confidence: 0.7,
      };

      const rel2: Relationship = {
        id: 'rel2',
        name: 'Sarah',
        aliases: ['Sarah Smith'],
        type: 'romantic',
        role: 'wife',
        emotionalValence: 'very_positive',
        isDeceased: false,
        triggerCategories: ['relational', 'emotional'],
        mentionFrequency: 3.0,
        associatedTopics: ['weekend'],
        extractedAt: new Date(),
        confidence: 0.9,
      };

      await service.addRelationship('user123', rel1);
      await service.addRelationship('user123', rel2);

      const profile = await service.loadProfile('user123');
      expect(profile.relationships.length).toBe(1);
      // Higher confidence update wins
      expect(profile.relationships[0].emotionalValence).toBe('very_positive');
      // Aliases merged
      expect(profile.relationships[0].aliases).toContain('my wife');
      expect(profile.relationships[0].aliases).toContain('Sarah Smith');
      // Topics merged
      expect(profile.relationships[0].associatedTopics).toContain('family');
      expect(profile.relationships[0].associatedTopics).toContain('weekend');
    });
  });

  describe('recordTriggerEffectiveness', () => {
    it('should create new effectiveness record', async () => {
      await service.recordTriggerEffectiveness('user123', 'false_fine', 'positive');

      const profile = await service.loadProfile('user123');
      const record = profile.triggerEffectiveness.find((t) => t.triggerName === 'false_fine');

      expect(record).toBeDefined();
      expect(record?.timesFired).toBe(1);
      expect(record?.positiveEngagements).toBe(1);
    });

    it('should accumulate effectiveness data', async () => {
      await service.recordTriggerEffectiveness('user123', 'grief_moment', 'positive');
      await service.recordTriggerEffectiveness('user123', 'grief_moment', 'positive');
      await service.recordTriggerEffectiveness('user123', 'grief_moment', 'appreciated');
      await service.recordTriggerEffectiveness('user123', 'grief_moment', 'negative');

      const profile = await service.loadProfile('user123');
      const record = profile.triggerEffectiveness.find((t) => t.triggerName === 'grief_moment');

      expect(record?.timesFired).toBe(4);
      expect(record?.positiveEngagements).toBe(3); // 2 positive + 1 appreciated
      expect(record?.negativeEngagements).toBe(1);
      expect(record?.explicitAppreciation).toBe(1);
      expect(record?.effectivenessScore).toBeGreaterThan(0.5);
    });
  });

  describe('mergeExtractionResult', () => {
    it('should merge extraction results into profile', async () => {
      // Use a unique user ID to ensure isolation
      const testUserId = `merge_test_${Date.now()}`;

      // First, get a clean profile baseline
      const baselineProfile = await service.loadProfile(testUserId);
      const baselineDates = baselineProfile.significantDates.length;
      const baselineRelationships = baselineProfile.relationships.length;

      const extraction: ProfileExtractionResult = {
        significantDates: [
          {
            id: 'date1',
            date: '2024-06-20',
            isRecurring: true,
            type: 'anniversary',
            description: 'Wedding anniversary',
            relatedPerson: 'Sarah',
            emotionalWeight: 0.9,
            triggerCategories: ['relational', 'temporal'],
            extractedAt: new Date(),
            confidence: 0.85,
            source: 'inferred',
          },
        ],
        relationships: [
          {
            id: 'rel1',
            name: 'Dad',
            aliases: ['my father'],
            type: 'family',
            role: 'father',
            emotionalValence: 'complicated',
            isDeceased: false,
            triggerCategories: ['relational'],
            mentionFrequency: 1.5,
            associatedTopics: ['childhood'],
            extractedAt: new Date(),
            confidence: 0.7,
          },
        ],
        patternUpdates: {
          deflectionPhrases: [
            {
              phrase: "I'm fine",
              frequency: 3,
              triggerCategory: 'deflection',
              emotionalWeight: 0.8,
              isRegex: false,
              meaning: 'deflection',
              reliability: 0.8,
              observationCount: 3,
              exampleContexts: ['When asked about work stress'],
            },
          ],
          vulnerabilitySignals: [],
          sensitiveTopics: [
            {
              topic: 'childhood',
              keywords: ['growing up', 'when I was young'],
              sensitivity: 0.6,
              explicitlyAvoided: false,
              recommendedApproach: 'gentle',
            },
          ],
        },
        confidence: 0.75,
      };

      await service.mergeExtractionResult(testUserId, extraction);

      const profile = await service.loadProfile(testUserId);

      // Check that we added 1 date from baseline
      expect(profile.significantDates.length).toBe(baselineDates + 1);
      expect(profile.significantDates.some((d) => d.description === 'Wedding anniversary')).toBe(
        true
      );

      // Check that we added 1 relationship from baseline
      expect(profile.relationships.length).toBe(baselineRelationships + 1);
      expect(profile.relationships.some((r) => r.name === 'Dad')).toBe(true);

      expect(profile.communicationPatterns.deflectionPhrases?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(profile.communicationPatterns.sensitiveTopics?.length ?? 0).toBeGreaterThanOrEqual(1);

      expect(profile.conversationsAnalyzed).toBe(1);
      expect(profile.profileConfidence).toBeGreaterThan(0);
    });
  });

  describe('generateContextBoost', () => {
    it('should boost triggers for upcoming significant dates', async () => {
      const testUserId = `boost_test_${Date.now()}`;

      // Add a date that's happening in 3 days (easier to test than today due to timezone issues)
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const dateStr = `${threeDaysFromNow.getFullYear()}-${String(threeDaysFromNow.getMonth() + 1).padStart(2, '0')}-${String(threeDaysFromNow.getDate()).padStart(2, '0')}`;

      const date: SignificantDate = {
        id: 'date1',
        date: dateStr,
        isRecurring: false, // Use non-recurring for simpler testing
        type: 'loss',
        description: 'Anniversary of grandmother passing',
        relatedPerson: 'Grandma',
        emotionalWeight: 0.9,
        triggerCategories: ['grief', 'temporal'],
        extractedAt: new Date(),
        confidence: 0.95,
        source: 'explicit',
      };

      await service.addSignificantDate(testUserId, date);

      const boost = await service.generateContextBoost(testUserId);

      // Should have at least one boost and one context injection
      expect(boost.triggersToBoost.length).toBeGreaterThan(0);
      // Check that any reason mentions days (could be "in 3 days", "3 days", etc.)
      const hasDateRelatedReason = boost.triggersToBoost.some(
        (t) => t.reason.includes('days') || t.reason.includes('tomorrow') || t.reason.includes('today')
      );
      expect(hasDateRelatedReason).toBe(true);
      expect(boost.contextInjections.length).toBeGreaterThan(0);
      expect(boost.contextInjections.some((c) => c.type === 'date')).toBe(true);
    });

    it('should suppress ineffective triggers', async () => {
      // Record multiple negative reactions
      await service.recordTriggerEffectiveness('user123', 'bad_trigger', 'negative');
      await service.recordTriggerEffectiveness('user123', 'bad_trigger', 'negative');
      await service.recordTriggerEffectiveness('user123', 'bad_trigger', 'negative');

      const boost = await service.generateContextBoost('user123');

      expect(boost.triggersToSuppress.length).toBe(1);
      expect(boost.triggersToSuppress[0].triggerName).toBe('bad_trigger');
    });

    it('should add sensitive topic warnings', async () => {
      const profile = await service.loadProfile('user123');
      profile.communicationPatterns.sensitiveTopics = [
        {
          topic: 'divorce',
          keywords: ['ex', 'divorce', 'custody'],
          sensitivity: 0.9,
          explicitlyAvoided: true,
          recommendedApproach: 'avoid',
        },
      ];
      await service.saveProfile('user123', profile);

      const boost = await service.generateContextBoost('user123');

      expect(boost.contextInjections.some((c) => c.content.includes('divorce'))).toBe(true);
      expect(boost.contextInjections.some((c) => c.content.includes('Sensitive topic'))).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should clear cache for user', async () => {
      await service.loadProfile('user123');
      expect(service.getCacheStats().size).toBe(1);

      service.clearCache('user123');
      expect(service.getCacheStats().size).toBe(0);
    });

    it('should clear all cache', async () => {
      await service.loadProfile('user1');
      await service.loadProfile('user2');
      expect(service.getCacheStats().size).toBe(2);

      service.clearAllCache();
      expect(service.getCacheStats().size).toBe(0);
    });

    it('should evict oldest entry when cache is full', async () => {
      const smallCacheService = new UserTriggerProfileService({
        maxCacheSize: 3,
        enablePersistence: false,
      });

      await smallCacheService.loadProfile('user1');
      await smallCacheService.loadProfile('user2');
      await smallCacheService.loadProfile('user3');
      expect(smallCacheService.getCacheStats().size).toBe(3);

      await smallCacheService.loadProfile('user4');
      expect(smallCacheService.getCacheStats().size).toBe(3);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getUserTriggerProfileService();
      const instance2 = getUserTriggerProfileService();

      expect(instance1).toBe(instance2);
    });

    it('should reset correctly', () => {
      const instance1 = getUserTriggerProfileService();
      resetUserTriggerProfileService();
      const instance2 = getUserTriggerProfileService();

      expect(instance1).not.toBe(instance2);
    });
  });
});
