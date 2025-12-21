/**
 * Phase 6: Life Context Synthesis Tests
 *
 * Tests for cross-domain life context aggregation and synthesis triggers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SleepDomainData,
  CalendarDomainData,
  FinanceDomainData,
  GoalsDomainData,
  RelationshipDomainData,
  HabitsDomainData,
  LifeContextSnapshot,
  SynthesisTrigger,
} from '../life-context-snapshot.js';
import {
  computeSleepStress,
  computeCalendarStress,
  computeFinanceStress,
  computeGoalsStress,
  computeRelationshipStress,
  computeHabitsStress,
  detectCrossDomainPatterns,
  calculateOverallLoadScore,
  calculateWellbeingScore,
} from '../life-context-aggregator.js';
import {
  generateSynthesisTriggers,
  populateSynthesisTriggers,
  getMostImportantTrigger,
  getTriggersByCategory,
  getTriggersForPersona,
  resetSynthesisAnalytics,
} from '../synthesis-trigger-generator.js';
import { DEFAULT_LIFE_CONTEXT_SNAPSHOT } from '../life-context-snapshot.js';

// ============================================================================
// DOMAIN STRESS COMPUTATION TESTS
// ============================================================================

describe('Domain Stress Computation', () => {
  describe('computeSleepStress', () => {
    it('should return null for low confidence data', () => {
      const data: SleepDomainData = {
        averageSleepHours: 5,
        poorSleepNights: 3,
        trend: 'declining',
        nightsAnalyzed: 0,
        mentionedFatigue: true,
        lastUpdated: new Date(),
        confidence: 0.1, // Below 0.3 threshold
      };
      expect(computeSleepStress(data)).toBeNull();
    });

    it('should detect high stress for severe sleep deficit', () => {
      const data: SleepDomainData = {
        averageSleepHours: 4.5,
        poorSleepNights: 5,
        trend: 'declining',
        nightsAnalyzed: 7,
        mentionedFatigue: true,
        lastUpdated: new Date(),
        confidence: 0.8,
      };
      const stress = computeSleepStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.5);
      expect(stress!.domain).toBe('sleep');
      expect(stress!.sourcePersona).toBe('maya');
    });

    it('should detect low stress for adequate sleep', () => {
      const data: SleepDomainData = {
        averageSleepHours: 7.5,
        poorSleepNights: 0,
        trend: 'stable',
        nightsAnalyzed: 7,
        mentionedFatigue: false,
        lastUpdated: new Date(),
        confidence: 0.8,
      };
      const stress = computeSleepStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeLessThan(0.2);
    });
  });

  describe('computeCalendarStress', () => {
    it('should detect high stress for packed schedule', () => {
      const data: CalendarDomainData = {
        totalEvents: 30,
        backToBackChains: 8,
        scheduleDensity: 95,
        upcomingDeadline: { exists: true, daysUntil: 1 },
        isOverloaded: true,
        freeTimeHours: 0,
        lastUpdated: new Date(),
        confidence: 0.8,
      };
      const stress = computeCalendarStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.7);
      expect(stress!.domain).toBe('calendar');
      expect(stress!.sourcePersona).toBe('alex');
    });

    it('should detect low stress for manageable schedule', () => {
      const data: CalendarDomainData = {
        totalEvents: 5,
        backToBackChains: 0,
        scheduleDensity: 30,
        upcomingDeadline: { exists: false },
        isOverloaded: false,
        freeTimeHours: 4,
        lastUpdated: new Date(),
        confidence: 0.8,
      };
      const stress = computeCalendarStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeLessThan(0.3);
    });
  });

  describe('computeFinanceStress', () => {
    it('should detect high stress for expressed anxiety', () => {
      const data: FinanceDomainData = {
        checkFrequency: 15,
        expressedAnxiety: true,
        stressLevel: 'high',
        pendingDecision: { exists: true, urgency: 'high' },
        concernTopics: ['debt', 'market volatility'],
        lastUpdated: new Date(),
        confidence: 0.7,
      };
      const stress = computeFinanceStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.6);
      expect(stress!.domain).toBe('finance');
      expect(stress!.sourcePersona).toBe('peter');
    });
  });

  describe('computeGoalsStress', () => {
    it('should detect high stress for goals at risk with low motivation', () => {
      const data: GoalsDomainData = {
        activeGoals: 5,
        goalsAtRisk: 3,
        upcomingMilestone: { exists: true, daysUntil: 2 },
        overallProgress: 'behind',
        motivationLevel: 'low',
        recentSetbacks: ['missed deadline', 'failed test'],
        lastUpdated: new Date(),
        confidence: 0.7,
      };
      const stress = computeGoalsStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.6);
      expect(stress!.domain).toBe('goals');
      expect(stress!.sourcePersona).toBe('jordan');
    });
  });

  describe('computeRelationshipStress', () => {
    it('should detect high stress for isolation signals', () => {
      const data: RelationshipDomainData = {
        recentlyMentionedPeople: [],
        relationshipConcerns: ['conflict', 'disconnection'],
        existentialThemes: ['nihilism'],
        relationshipHealth: 'strained',
        isolationSignals: true,
        lastUpdated: new Date(),
        confidence: 0.7,
      };
      const stress = computeRelationshipStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.6);
      expect(stress!.domain).toBe('relationships');
      expect(stress!.sourcePersona).toBe('nayan');
    });
  });

  describe('computeHabitsStress', () => {
    it('should detect stress for habit slump', () => {
      const data: HabitsDomainData = {
        activeHabits: ['exercise', 'meditation', 'reading'],
        streaksAtRisk: 2,
        adherencePercent: 25,
        inSlump: true,
        recentWins: [],
        lastUpdated: new Date(),
        confidence: 0.6,
      };
      const stress = computeHabitsStress(data);
      expect(stress).not.toBeNull();
      expect(stress!.stressLevel).toBeGreaterThan(0.4);
      expect(stress!.domain).toBe('habits');
      expect(stress!.sourcePersona).toBe('maya');
    });
  });
});

// ============================================================================
// CROSS-DOMAIN PATTERN DETECTION TESTS
// ============================================================================

describe('Cross-Domain Pattern Detection', () => {
  it('should detect overwhelm cascade with 3+ high stress domains', () => {
    const domains = {};
    const stressIndicators = [
      { domain: 'sleep' as const, stressLevel: 0.7, reason: 'poor sleep', sourcePersona: 'maya' },
      { domain: 'calendar' as const, stressLevel: 0.8, reason: 'packed', sourcePersona: 'alex' },
      { domain: 'finance' as const, stressLevel: 0.6, reason: 'anxiety', sourcePersona: 'peter' },
    ];

    const patterns = detectCrossDomainPatterns(domains, stressIndicators);
    expect(patterns.some((p) => p.description.includes('Carrying a lot'))).toBe(true);
    expect(patterns.some((p) => p.impact === 'negative')).toBe(true);
  });

  it('should detect sleep + calendar collision', () => {
    const domains: LifeContextSnapshot['domains'] = {
      sleep: {
        averageSleepHours: 5,
        poorSleepNights: 4,
        trend: 'declining',
        nightsAnalyzed: 7,
        mentionedFatigue: true,
        lastUpdated: new Date(),
        confidence: 0.8,
      },
      calendar: {
        totalEvents: 20,
        backToBackChains: 5,
        scheduleDensity: 80,
        upcomingDeadline: { exists: false },
        isOverloaded: true,
        freeTimeHours: 0,
        lastUpdated: new Date(),
        confidence: 0.8,
      },
    };

    const patterns = detectCrossDomainPatterns(domains, []);
    expect(patterns.some((p) => p.domains.includes('sleep') && p.domains.includes('calendar'))).toBe(
      true
    );
  });

  it('should detect positive patterns for good sleep and habits', () => {
    const domains: LifeContextSnapshot['domains'] = {
      sleep: {
        averageSleepHours: 7.5,
        poorSleepNights: 0,
        trend: 'improving',
        nightsAnalyzed: 7,
        mentionedFatigue: false,
        lastUpdated: new Date(),
        confidence: 0.8,
      },
      habits: {
        activeHabits: ['exercise', 'meditation'],
        streaksAtRisk: 0,
        adherencePercent: 85,
        inSlump: false,
        recentWins: ['exercise', 'meditation'],
        lastUpdated: new Date(),
        confidence: 0.8,
      },
    };

    const patterns = detectCrossDomainPatterns(domains, []);
    expect(patterns.some((p) => p.impact === 'positive')).toBe(true);
  });
});

// ============================================================================
// OVERALL SCORE CALCULATION TESTS
// ============================================================================

describe('Overall Score Calculation', () => {
  describe('calculateOverallLoadScore', () => {
    it('should return 0 for empty stress indicators', () => {
      expect(calculateOverallLoadScore([])).toBe(0);
    });

    it('should weight sleep more heavily', () => {
      // When combined with equal stress in another domain, higher-weight domains pull the average up more
      // sleep (1.3 weight) + goals (0.9 weight) at 0.5 stress each:
      // - sleep contributes: 0.5 * 1.3 = 0.65
      // - goals contributes: 0.5 * 0.9 = 0.45
      // - total: 1.1, totalWeight: 2.2, raw: 0.5

      // habits (0.8 weight) + goals (0.9 weight) at 0.5 stress each:
      // - habits contributes: 0.5 * 0.8 = 0.4
      // - goals contributes: 0.5 * 0.9 = 0.45
      // - total: 0.85, totalWeight: 1.7, raw: 0.5

      // Actually, weighted average = (sum of stress*weight) / (sum of weight) = stress
      // So with equal stress levels, the score is the same regardless of weights.

      // The weight affects contribution when stress levels DIFFER.
      // To test this: 0.8 stress in sleep + 0.2 stress in goals vs 0.8 stress in habits + 0.2 stress in goals
      const sleepDominant = [
        { domain: 'sleep' as const, stressLevel: 0.8, reason: 'high', sourcePersona: 'maya' },
        { domain: 'goals' as const, stressLevel: 0.2, reason: 'low', sourcePersona: 'jordan' },
      ];
      const habitDominant = [
        { domain: 'habits' as const, stressLevel: 0.8, reason: 'high', sourcePersona: 'maya' },
        { domain: 'goals' as const, stressLevel: 0.2, reason: 'low', sourcePersona: 'jordan' },
      ];

      const sleepScore = calculateOverallLoadScore(sleepDominant);
      const habitScore = calculateOverallLoadScore(habitDominant);

      // Sleep (weight 1.3) should pull the score UP more than habits (weight 0.8)
      // because the high-stress domain has more influence
      expect(sleepScore).toBeGreaterThan(habitScore);
    });

    it('should compound for multiple high stress domains', () => {
      const singleHigh = [
        { domain: 'sleep' as const, stressLevel: 0.6, reason: 'test', sourcePersona: 'maya' },
      ];
      const multipleHigh = [
        { domain: 'sleep' as const, stressLevel: 0.6, reason: 'test', sourcePersona: 'maya' },
        { domain: 'calendar' as const, stressLevel: 0.6, reason: 'test', sourcePersona: 'alex' },
        { domain: 'finance' as const, stressLevel: 0.6, reason: 'test', sourcePersona: 'peter' },
      ];

      const singleScore = calculateOverallLoadScore(singleHigh);
      const multipleScore = calculateOverallLoadScore(multipleHigh);

      // Multiple high stress should compound
      expect(multipleScore).toBeGreaterThan(singleScore);
    });
  });

  describe('calculateWellbeingScore', () => {
    it('should be inversely related to load', () => {
      const domains = {};
      const lowLoadPatterns: LifeContextSnapshot['patterns'] = [];

      const lowLoadWellbeing = calculateWellbeingScore(domains, 0.2, lowLoadPatterns);
      const highLoadWellbeing = calculateWellbeingScore(domains, 0.8, lowLoadPatterns);

      expect(lowLoadWellbeing).toBeGreaterThan(highLoadWellbeing);
    });

    it('should boost for positive patterns', () => {
      const domains: LifeContextSnapshot['domains'] = {
        sleep: {
          averageSleepHours: 7.5,
          poorSleepNights: 0,
          trend: 'stable',
          nightsAnalyzed: 7,
          mentionedFatigue: false,
          lastUpdated: new Date(),
          confidence: 0.8,
        },
      };

      const noPatterns: LifeContextSnapshot['patterns'] = [];
      const positivePatterns: LifeContextSnapshot['patterns'] = [
        { description: 'Good sleep', domains: ['sleep'], impact: 'positive' },
        { description: 'Strong habits', domains: ['habits'], impact: 'positive' },
      ];

      const scoreNoPatterns = calculateWellbeingScore(domains, 0.3, noPatterns);
      const scoreWithPatterns = calculateWellbeingScore(domains, 0.3, positivePatterns);

      expect(scoreWithPatterns).toBeGreaterThan(scoreNoPatterns);
    });
  });
});

// ============================================================================
// SYNTHESIS TRIGGER GENERATOR TESTS
// ============================================================================

describe('Synthesis Trigger Generator', () => {
  beforeEach(() => {
    resetSynthesisAnalytics();
  });

  describe('generateSynthesisTriggers', () => {
    it('should generate overwhelm cascade trigger for high stress', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        userId: 'test-user',
        overallLoadScore: 0.8,
        stressIndicators: [
          { domain: 'sleep', stressLevel: 0.7, reason: 'poor sleep', sourcePersona: 'maya' },
          { domain: 'calendar', stressLevel: 0.8, reason: 'packed', sourcePersona: 'alex' },
          { domain: 'finance', stressLevel: 0.6, reason: 'anxiety', sourcePersona: 'peter' },
        ],
        domains: {},
        patterns: [],
      };

      const triggers = generateSynthesisTriggers(snapshot);
      expect(triggers.some((t) => t.id === 'overwhelm_cascade')).toBe(true);
    });

    it('should generate celebration triggers for positive state', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        userId: 'test-user',
        overallLoadScore: 0.2,
        wellbeingScore: 0.85,
        stressIndicators: [],
        domains: {
          goals: {
            activeGoals: 3,
            goalsAtRisk: 0,
            upcomingMilestone: { exists: false },
            overallProgress: 'ahead',
            motivationLevel: 'high',
            recentSetbacks: [],
            lastUpdated: new Date(),
            confidence: 0.8,
          },
        },
        patterns: [],
      };

      const triggers = generateSynthesisTriggers(snapshot);
      expect(triggers.some((t) => t.category === 'celebration')).toBe(true);
    });

    it('should limit triggers to maxTriggers config', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        userId: 'test-user',
        overallLoadScore: 0.9,
        stressIndicators: [
          { domain: 'sleep', stressLevel: 0.9, reason: 'test', sourcePersona: 'maya' },
          { domain: 'calendar', stressLevel: 0.9, reason: 'test', sourcePersona: 'alex' },
          { domain: 'finance', stressLevel: 0.9, reason: 'test', sourcePersona: 'peter' },
          { domain: 'goals', stressLevel: 0.9, reason: 'test', sourcePersona: 'jordan' },
          { domain: 'relationships', stressLevel: 0.9, reason: 'test', sourcePersona: 'nayan' },
        ],
        domains: {
          sleep: {
            averageSleepHours: 4,
            poorSleepNights: 5,
            trend: 'declining',
            nightsAnalyzed: 7,
            mentionedFatigue: true,
            lastUpdated: new Date(),
            confidence: 0.9,
          },
          calendar: {
            totalEvents: 30,
            backToBackChains: 10,
            scheduleDensity: 95,
            upcomingDeadline: { exists: true, daysUntil: 1 },
            isOverloaded: true,
            freeTimeHours: 0,
            lastUpdated: new Date(),
            confidence: 0.9,
          },
          habits: {
            activeHabits: ['test'],
            streaksAtRisk: 3,
            adherencePercent: 10,
            inSlump: true,
            recentWins: [],
            lastUpdated: new Date(),
            confidence: 0.9,
          },
        },
        patterns: [],
      };

      const triggers = generateSynthesisTriggers(snapshot, { maxTriggers: 3 });
      expect(triggers.length).toBeLessThanOrEqual(3);
    });

    it('should sort triggers by priority and confidence', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        userId: 'test-user',
        overallLoadScore: 0.8,
        stressIndicators: [
          { domain: 'sleep', stressLevel: 0.7, reason: 'test', sourcePersona: 'maya' },
          { domain: 'calendar', stressLevel: 0.8, reason: 'test', sourcePersona: 'alex' },
          { domain: 'finance', stressLevel: 0.6, reason: 'test', sourcePersona: 'peter' },
        ],
        domains: {},
        patterns: [],
      };

      const triggers = generateSynthesisTriggers(snapshot);
      if (triggers.length >= 2) {
        // First trigger should be higher priority or same priority with higher confidence
        const first = triggers[0];
        const second = triggers[1];
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        expect(
          priorityOrder[first.priority] <= priorityOrder[second.priority] ||
            first.confidence >= second.confidence
        ).toBe(true);
      }
    });
  });

  describe('populateSynthesisTriggers', () => {
    it('should add triggers to snapshot', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        userId: 'test-user',
        overallLoadScore: 0.8,
        stressIndicators: [
          { domain: 'sleep', stressLevel: 0.7, reason: 'test', sourcePersona: 'maya' },
          { domain: 'calendar', stressLevel: 0.8, reason: 'test', sourcePersona: 'alex' },
          { domain: 'finance', stressLevel: 0.6, reason: 'test', sourcePersona: 'peter' },
        ],
        domains: {},
        patterns: [],
        synthesizedTriggers: [],
      };

      const result = populateSynthesisTriggers(snapshot);
      expect(result.synthesizedTriggers.length).toBeGreaterThan(0);
    });
  });

  describe('getMostImportantTrigger', () => {
    it('should return null for empty triggers', () => {
      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        synthesizedTriggers: [],
      };
      expect(getMostImportantTrigger(snapshot)).toBeNull();
    });

    it('should return first trigger (highest priority)', () => {
      const triggers: SynthesisTrigger[] = [
        {
          id: 'urgent-one',
          category: 'support',
          priority: 'urgent',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.9,
          contributingDomains: ['sleep'],
          recommendedPersona: 'ferni',
        },
        {
          id: 'low-one',
          category: 'celebration',
          priority: 'low',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.8,
          contributingDomains: ['goals'],
          recommendedPersona: 'jordan',
        },
      ];

      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        synthesizedTriggers: triggers,
      };

      const result = getMostImportantTrigger(snapshot);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('urgent-one');
    });
  });

  describe('getTriggersByCategory', () => {
    it('should filter triggers by category', () => {
      const triggers: SynthesisTrigger[] = [
        {
          id: 'support-one',
          category: 'support',
          priority: 'high',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.9,
          contributingDomains: ['sleep'],
          recommendedPersona: 'ferni',
        },
        {
          id: 'celebration-one',
          category: 'celebration',
          priority: 'medium',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.8,
          contributingDomains: ['goals'],
          recommendedPersona: 'jordan',
        },
      ];

      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        synthesizedTriggers: triggers,
      };

      const supportTriggers = getTriggersByCategory(snapshot, 'support');
      expect(supportTriggers.length).toBe(1);
      expect(supportTriggers[0].id).toBe('support-one');
    });
  });

  describe('getTriggersForPersona', () => {
    it('should filter triggers by recommended persona', () => {
      const triggers: SynthesisTrigger[] = [
        {
          id: 'ferni-one',
          category: 'support',
          priority: 'high',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.9,
          contributingDomains: ['sleep'],
          recommendedPersona: 'ferni',
        },
        {
          id: 'maya-one',
          category: 'rest',
          priority: 'medium',
          suggestedResponse: 'Test',
          reasoning: 'Test',
          confidence: 0.8,
          contributingDomains: ['sleep'],
          recommendedPersona: 'maya',
        },
      ];

      const snapshot: LifeContextSnapshot = {
        ...DEFAULT_LIFE_CONTEXT_SNAPSHOT,
        synthesizedTriggers: triggers,
      };

      const ferniTriggers = getTriggersForPersona(snapshot, 'ferni');
      expect(ferniTriggers.length).toBe(1);
      expect(ferniTriggers[0].id).toBe('ferni-one');
    });
  });
});
