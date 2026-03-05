/**
 * Personal Context Integrator Tests
 *
 * Tests for Phase 2 personal context boost generation and application.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generatePersonalContextBoost,
  applyPersonalContextBoost,
  DEFAULT_PERSONAL_CONTEXT_CONFIG,
  type PersonalContextConfig,
} from '../personal-context-integrator.js';
import { DEFAULT_USER_TRIGGER_PROFILE } from '../user-trigger-profile.types.js';
import type {
  UserTriggerProfile,
  SignificantDate,
  Relationship,
} from '../user-trigger-profile.types.js';
import type { HybridMatchResult, TriggerContext } from '../types.js';

describe('Personal Context Integrator', () => {
  let baseProfile: UserTriggerProfile;
  let baseContext: TriggerContext;

  beforeEach(() => {
    baseProfile = {
      ...DEFAULT_USER_TRIGGER_PROFILE,
      userId: 'test_user',
      significantDates: [],
      relationships: [],
      updatedAt: new Date(),
    };

    // Use fixed noon to avoid temporal boosts (late_night etc.) that would change multiplier
    baseContext = {
      userId: 'test_user',
      currentTime: new Date('2025-06-15T12:00:00Z'),
    };
  });

  describe('generatePersonalContextBoost', () => {
    it('should return multiplier of 1.0 for empty profile', () => {
      const result = generatePersonalContextBoost('Hello', baseProfile, baseContext);

      expect(result.overallMultiplier).toBe(1.0);
      expect(result.triggerBoosts).toHaveLength(0);
      expect(result.appliedContext.upcomingDates).toHaveLength(0);
    });

    it('should return multiplier of 1.0 when disabled', () => {
      const config: PersonalContextConfig = {
        ...DEFAULT_PERSONAL_CONTEXT_CONFIG,
        enabled: false,
      };

      const result = generatePersonalContextBoost(
        'I feel terrible',
        baseProfile,
        baseContext,
        config
      );

      expect(result.overallMultiplier).toBe(1.0);
    });

    it('should boost for upcoming birthday', () => {
      // Set up a birthday 3 days from now
      const now = new Date();
      const upcomingDate = new Date(now);
      upcomingDate.setDate(upcomingDate.getDate() + 3);

      const birthday: SignificantDate = {
        id: 'date_1',
        date: `YYYY-${String(upcomingDate.getMonth() + 1).padStart(2, '0')}-${String(upcomingDate.getDate()).padStart(2, '0')}`,
        type: 'birthday',
        description: "Mom's birthday",
        isRecurring: true,
        emotionalWeight: 0.7,
        triggerCategories: ['temporal', 'relational'],
        relatedPerson: 'Mom',
        extractedAt: new Date(),
        confidence: 0.9,
        source: 'explicit',
      };

      baseProfile.significantDates = [birthday];

      const result = generatePersonalContextBoost('I should get a gift', baseProfile, baseContext);

      expect(result.appliedContext.upcomingDates).toHaveLength(1);
      expect(result.triggerBoosts.some((t) => t.triggerName === 'celebration_prompt')).toBe(true);
      expect(result.overallMultiplier).toBeGreaterThan(1.0);
    });

    it('should boost for upcoming loss anniversary', () => {
      // Set up a loss anniversary 5 days from now
      const now = new Date();
      const upcomingDate = new Date(now);
      upcomingDate.setDate(upcomingDate.getDate() + 5);

      const lossDate: SignificantDate = {
        id: 'date_2',
        date: `YYYY-${String(upcomingDate.getMonth() + 1).padStart(2, '0')}-${String(upcomingDate.getDate()).padStart(2, '0')}`,
        type: 'loss',
        description: "Anniversary of Dad's passing",
        isRecurring: true,
        emotionalWeight: 0.95,
        triggerCategories: ['temporal', 'grief'],
        relatedPerson: 'Dad',
        extractedAt: new Date(),
        confidence: 0.95,
        source: 'explicit',
      };

      baseProfile.significantDates = [lossDate];

      const result = generatePersonalContextBoost(
        'Thinking about the past',
        baseProfile,
        baseContext
      );

      expect(result.appliedContext.upcomingDates).toHaveLength(1);
      expect(result.triggerBoosts.some((t) => t.triggerName === 'grief_trigger')).toBe(true);
      expect(result.categoryBoosts['grief']).toBeGreaterThan(0);
    });

    it('should boost when mentioning a known relationship', () => {
      const mom: Relationship = {
        id: 'rel_1',
        name: 'Mom',
        aliases: ['Mother', 'Mama'],
        type: 'family',
        role: 'mother',
        emotionalValence: 'positive',
        isDeceased: false,
        triggerCategories: ['relational', 'family'],
        mentionFrequency: 5,
        associatedTopics: ['family'],
        extractedAt: new Date(),
        confidence: 0.9,
      };

      baseProfile.relationships = [mom];

      const result = generatePersonalContextBoost(
        'My mom called me today',
        baseProfile,
        baseContext
      );

      expect(result.appliedContext.mentionedRelationships).toHaveLength(1);
      expect(result.appliedContext.mentionedRelationships[0].name).toBe('Mom');
    });

    it('should boost grief triggers for deceased relationship mentions', () => {
      const deceasedGrandma: Relationship = {
        id: 'rel_2',
        name: 'Grandma',
        aliases: ['Grandmother'],
        type: 'deceased',
        role: 'grandmother',
        emotionalValence: 'positive',
        isDeceased: true,
        triggerCategories: ['relational', 'grief'],
        mentionFrequency: 2,
        associatedTopics: [],
        extractedAt: new Date(),
        confidence: 0.9,
      };

      baseProfile.relationships = [deceasedGrandma];

      const result = generatePersonalContextBoost(
        "I've been thinking about my grandma lately",
        baseProfile,
        baseContext
      );

      expect(result.triggerBoosts.some((t) => t.triggerName === 'grief_trigger')).toBe(true);
      expect(result.categoryBoosts['grief']).toBeGreaterThan(0);
    });

    it('should boost for complicated relationship mentions', () => {
      const complicatedDad: Relationship = {
        id: 'rel_3',
        name: 'Dad',
        aliases: ['Father'],
        type: 'family',
        role: 'father',
        emotionalValence: 'complicated',
        isDeceased: false,
        triggerCategories: ['relational', 'emotional'],
        mentionFrequency: 3,
        associatedTopics: [],
        extractedAt: new Date(),
        confidence: 0.85,
      };

      baseProfile.relationships = [complicatedDad];

      const result = generatePersonalContextBoost(
        'My dad wants to talk this weekend',
        baseProfile,
        baseContext
      );

      expect(result.triggerBoosts.some((t) => t.triggerName === 'emotional_support')).toBe(true);
    });

    it('should detect and boost for distress signals', () => {
      const result = generatePersonalContextBoost(
        "I can't do this anymore. Everything is too much.",
        baseProfile,
        baseContext
      );

      expect(result.appliedContext.detectedPatterns).toContain('distress');
      expect(result.appliedContext.detectedPatterns).toContain('distress_signal');
      expect(result.triggerBoosts.some((t) => t.triggerName === 'immediate_support')).toBe(true);
      expect(result.categoryBoosts['emotional']).toBeGreaterThan(0);
    });

    it('should detect and boost for deflection signals', () => {
      const result = generatePersonalContextBoost(
        "I'm fine. It's not a big deal.",
        baseProfile,
        baseContext
      );

      expect(result.appliedContext.detectedPatterns).toContain('deflection');
      expect(result.appliedContext.detectedPatterns).toContain('deflection_signal');
      expect(result.triggerBoosts.some((t) => t.triggerName === 'gentle_check_in')).toBe(true);
    });

    it('should boost for late night conversations', () => {
      const lateNight = new Date();
      lateNight.setHours(2, 30, 0, 0);

      const lateContext: TriggerContext = {
        ...baseContext,
        currentTime: lateNight,
      };

      const result = generatePersonalContextBoost(
        'Just thinking about life',
        baseProfile,
        lateContext
      );

      expect(result.appliedContext.temporalFlags).toContain('late_night');
      expect(result.triggerBoosts.some((t) => t.triggerName === 'late_night_presence')).toBe(true);
    });

    it('should boost for returning users', () => {
      const returningContext: TriggerContext = {
        ...baseContext,
        isReturningUser: true,
      };

      const result = generatePersonalContextBoost(
        "Hey, it's been a while",
        baseProfile,
        returningContext
      );

      expect(result.appliedContext.temporalFlags).toContain('returning');
      expect(result.triggerBoosts.some((t) => t.triggerName === 'warm_welcome_back')).toBe(true);
    });

    it('should respect maxBoostMultiplier', () => {
      const config: PersonalContextConfig = {
        ...DEFAULT_PERSONAL_CONTEXT_CONFIG,
        maxBoostMultiplier: 1.2,
      };

      // Add lots of boost conditions
      const lateNight = new Date();
      lateNight.setHours(2, 30, 0, 0);

      const context: TriggerContext = {
        ...baseContext,
        currentTime: lateNight,
        isReturningUser: true,
      };

      const result = generatePersonalContextBoost(
        "I can't sleep. I'm so tired of everything.",
        baseProfile,
        context,
        config
      );

      expect(result.overallMultiplier).toBeLessThanOrEqual(1.2);
    });

    it('should include processing metadata', () => {
      const result = generatePersonalContextBoost('Hello', baseProfile, baseContext);

      expect(result.metadata.profileAge).toBeGreaterThanOrEqual(0);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyPersonalContextBoost', () => {
    it('should not modify results when multiplier is 1.0', () => {
      const matchResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'test_trigger',
          trigger: 'test trigger text',
          combinedScore: 0.7,
          semanticScore: 0.65,
          patternScore: 0.75,
          behavior: 'Test behavior',
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 10,
        analytics: {
          processingTimeMs: 10,
          embeddingsUsed: true,
        },
      };

      const boost = generatePersonalContextBoost('Hello', baseProfile, baseContext);

      const result = applyPersonalContextBoost(matchResult, boost);

      expect(result.bestMatch?.combinedScore).toBe(0.7);
    });

    it('should boost scores when multiplier is greater than 1.0', () => {
      const matchResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'test_trigger',
          trigger: 'test trigger text',
          combinedScore: 0.5,
          semanticScore: 0.5,
          patternScore: 0.5,
          behavior: 'Test behavior',
          category: 'emotional',
        },
        allMatches: [
          {
            triggerName: 'other_trigger',
            trigger: 'other trigger text',
            combinedScore: 0.4,
            semanticScore: 0.4,
            patternScore: 0.4,
            behavior: 'Other behavior',
            category: 'emotional',
          },
        ],
        matchingStrategy: 'hybrid',
        processingTimeMs: 10,
        analytics: {
          processingTimeMs: 10,
          embeddingsUsed: true,
        },
      };

      // Create a boost with distress signals
      const boost = generatePersonalContextBoost(
        "I can't take it anymore",
        baseProfile,
        baseContext
      );

      const result = applyPersonalContextBoost(matchResult, boost);

      // Scores should be increased
      expect(result.bestMatch?.combinedScore).toBeGreaterThan(0.5);
      expect(result.allMatches[0].combinedScore).toBeGreaterThan(0.4);
    });

    it('should apply specific trigger boosts', () => {
      const matchResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'immediate_support',
          trigger: 'immediate support trigger',
          combinedScore: 0.5,
          semanticScore: 0.5,
          patternScore: 0.5,
          behavior: 'Support behavior',
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 10,
        analytics: {
          processingTimeMs: 10,
          embeddingsUsed: true,
        },
      };

      // Create a boost with distress signals that targets 'immediate_support'
      const boost = generatePersonalContextBoost(
        "Everything is falling apart. I can't do this.",
        baseProfile,
        baseContext
      );

      // Verify the boost includes immediate_support trigger
      expect(boost.triggerBoosts.some((t) => t.triggerName === 'immediate_support')).toBe(true);

      const result = applyPersonalContextBoost(matchResult, boost);

      // The specific boost should be applied
      expect(result.bestMatch?.combinedScore).toBeGreaterThan(0.5);
    });

    it('should cap scores at 1.0', () => {
      const matchResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'test_trigger',
          trigger: 'test trigger text',
          combinedScore: 0.95,
          semanticScore: 0.95,
          patternScore: 0.95,
          behavior: 'Test behavior',
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 10,
        analytics: {
          processingTimeMs: 10,
          embeddingsUsed: true,
        },
      };

      // Create a boost with many signals
      const lateNight = new Date();
      lateNight.setHours(2, 30, 0, 0);

      const context: TriggerContext = {
        ...baseContext,
        currentTime: lateNight,
        isReturningUser: true,
      };

      const boost = generatePersonalContextBoost(
        "I can't sleep. Everything is too much.",
        baseProfile,
        context
      );

      const result = applyPersonalContextBoost(matchResult, boost);

      expect(result.bestMatch?.combinedScore).toBeLessThanOrEqual(1.0);
    });

    it('should add personal context flag to analytics', () => {
      const matchResult: HybridMatchResult = {
        bestMatch: {
          triggerName: 'test_trigger',
          trigger: 'test trigger text',
          combinedScore: 0.5,
          semanticScore: 0.5,
          patternScore: 0.5,
          behavior: 'Test behavior',
          category: 'emotional',
        },
        allMatches: [],
        matchingStrategy: 'hybrid',
        processingTimeMs: 10,
        analytics: {
          processingTimeMs: 10,
          embeddingsUsed: true,
        },
      };

      // Create a boost with distress signals
      const boost = generatePersonalContextBoost(
        "I can't take it anymore",
        baseProfile,
        baseContext
      );

      const result = applyPersonalContextBoost(matchResult, boost);

      expect(result.analytics?.personalContextApplied).toBe(true);
      expect(result.analytics?.personalContextMultiplier).toBeDefined();
    });
  });
});
