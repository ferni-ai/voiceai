/**
 * Tests for Human Memory Context Builder
 *
 * Validates that human-centric memory is properly surfaced to the LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDateContext,
  buildEmotionalSignatureContext,
  buildAvoidanceContext,
  buildGrowthContext,
  buildInsideJokesContext,
  buildIdentityContext,
  getUpcomingDates,
  isWithinDays,
  isToday,
  getDaysUntil,
} from '../memory/human-memory.js';
import type { HumanMemory, ImportantDate } from '../../../types/human-memory.js';

// ============================================================================
// DATE UTILITY TESTS
// ============================================================================

describe('Date Utilities', () => {
  describe('isToday', () => {
    it("should return true for today's date", () => {
      const today = new Date();
      const date: ImportantDate = {
        id: 'test',
        type: 'birthday',
        label: 'Test',
        month: today.getMonth() + 1,
        day: today.getDate(),
        significance: 'meaningful',
        wantsAcknowledgment: true,
        discoveredAt: new Date(),
      };

      expect(isToday(date)).toBe(true);
    });

    it('should return false for other dates', () => {
      const today = new Date();
      const date: ImportantDate = {
        id: 'test',
        type: 'birthday',
        label: 'Test',
        month: today.getMonth() + 1,
        day: today.getDate() === 1 ? 2 : 1, // Different day
        significance: 'meaningful',
        wantsAcknowledgment: true,
        discoveredAt: new Date(),
      };

      expect(isToday(date)).toBe(false);
    });
  });

  describe('isWithinDays', () => {
    it('should return true for dates within range', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 3);

      const date: ImportantDate = {
        id: 'test',
        type: 'birthday',
        label: 'Test',
        month: futureDate.getMonth() + 1,
        day: futureDate.getDate(),
        significance: 'meaningful',
        wantsAcknowledgment: true,
        discoveredAt: new Date(),
      };

      expect(isWithinDays(date, 7)).toBe(true);
    });

    it('should return false for dates outside range', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 30);

      const date: ImportantDate = {
        id: 'test',
        type: 'birthday',
        label: 'Test',
        month: futureDate.getMonth() + 1,
        day: futureDate.getDate(),
        significance: 'meaningful',
        wantsAcknowledgment: true,
        discoveredAt: new Date(),
      };

      expect(isWithinDays(date, 7)).toBe(false);
    });
  });

  describe('getDaysUntil', () => {
    it('should return correct days for future date', () => {
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 5);

      const date: ImportantDate = {
        id: 'test',
        type: 'birthday',
        label: 'Test',
        month: futureDate.getMonth() + 1,
        day: futureDate.getDate(),
        significance: 'meaningful',
        wantsAcknowledgment: true,
        discoveredAt: new Date(),
      };

      expect(getDaysUntil(date)).toBe(5);
    });
  });

  describe('getUpcomingDates', () => {
    it('should separate today from upcoming', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const humanMemory: Partial<HumanMemory> = {
        importantDates: [
          {
            id: 'today',
            type: 'birthday',
            label: 'Today birthday',
            month: today.getMonth() + 1,
            day: today.getDate(),
            significance: 'meaningful',
            wantsAcknowledgment: true,
            discoveredAt: new Date(),
          },
          {
            id: 'tomorrow',
            type: 'anniversary',
            label: 'Tomorrow anniversary',
            month: tomorrow.getMonth() + 1,
            day: tomorrow.getDate(),
            significance: 'meaningful',
            wantsAcknowledgment: true,
            discoveredAt: new Date(),
          },
        ],
      };

      const { today: todayDates, upcoming } = getUpcomingDates(humanMemory, 7);

      expect(todayDates).toHaveLength(1);
      expect(todayDates[0].label).toBe('Today birthday');
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].label).toBe('Tomorrow anniversary');
    });
  });
});

// ============================================================================
// CONTEXT BUILDER TESTS
// ============================================================================

describe('buildDateContext', () => {
  it('should return null when no dates', () => {
    const humanMemory: Partial<HumanMemory> = {
      importantDates: [],
    };

    const result = buildDateContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should include celebratory message for today birthday', () => {
    const today = new Date();
    const humanMemory: Partial<HumanMemory> = {
      importantDates: [
        {
          id: 'test',
          type: 'birthday',
          label: 'User birthday',
          month: today.getMonth() + 1,
          day: today.getDate(),
          significance: 'meaningful',
          wantsAcknowledgment: true,
          sentiment: 'celebratory',
          discoveredAt: new Date(),
        },
      ],
    };

    const result = buildDateContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('🎉');
    expect(result?.content).toContain('TODAY');
  });
});

describe('buildEmotionalSignatureContext', () => {
  it('should return null when no emotional signature', () => {
    const humanMemory: Partial<HumanMemory> = {};

    const result = buildEmotionalSignatureContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should surface comfort patterns when user is stressed', () => {
    const humanMemory: Partial<HumanMemory> = {
      emotionalSignature: {
        humor: {
          appreciates: [],
          avoids: [],
          successfulMoments: [],
          overallLevel: 'enjoys_moderately',
        },
        comfortPatterns: [
          {
            id: 'c1',
            type: 'validation',
            effectiveFor: 'work stress',
            evidence: 'They said validation helps',
            discoveredAt: new Date(),
          },
        ],
        tells: [],
        stressTriggers: [],
        updatedAt: new Date(),
      },
    };

    const result = buildEmotionalSignatureContext(humanMemory, 'stressed');
    expect(result).not.toBeNull();
    expect(result?.content).toContain('validate');
  });

  it('should surface humor preferences', () => {
    const humanMemory: Partial<HumanMemory> = {
      emotionalSignature: {
        humor: {
          appreciates: ['dry', 'wordplay'],
          avoids: [],
          successfulMoments: [],
          overallLevel: 'loves_it',
        },
        comfortPatterns: [],
        tells: [],
        stressTriggers: [],
        updatedAt: new Date(),
      },
    };

    const result = buildEmotionalSignatureContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('dry');
    expect(result?.content).toContain('love'); // "They love"
  });
});

describe('buildAvoidanceContext', () => {
  it('should return null when no avoidances', () => {
    const humanMemory: Partial<HumanMemory> = {
      unspoken: {
        avoidances: [],
        reachOutPatterns: [],
        energyPatterns: [],
        updatedAt: new Date(),
      },
    };

    const result = buildAvoidanceContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should only surface avoidances with multiple observations', () => {
    const humanMemory: Partial<HumanMemory> = {
      unspoken: {
        avoidances: [
          {
            id: 'a1',
            topic: 'finances',
            avoidanceStyle: 'deflects',
            observations: 3, // Strong signal
            approach: 'only_if_they_do',
            firstNoticed: new Date(),
          },
          {
            id: 'a2',
            topic: 'random topic',
            avoidanceStyle: 'deflects',
            observations: 1, // Weak signal
            approach: 'only_if_they_do',
            firstNoticed: new Date(),
          },
        ],
        reachOutPatterns: [],
        energyPatterns: [],
        updatedAt: new Date(),
      },
    };

    const result = buildAvoidanceContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('finances');
    expect(result?.content).not.toContain('random topic');
  });
});

describe('buildGrowthContext', () => {
  it('should return null when no unacknowledged growth', () => {
    const humanMemory: Partial<HumanMemory> = {
      growthArc: {
        markers: [
          {
            id: 'g1',
            description: 'Became more confident',
            before: 'shy',
            after: 'confident',
            observedAt: new Date(),
            acknowledged: true, // Already acknowledged
          },
        ],
        challenges: [],
        updatedAt: new Date(),
      },
    };

    const result = buildGrowthContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should surface unacknowledged growth', () => {
    const humanMemory: Partial<HumanMemory> = {
      growthArc: {
        markers: [
          {
            id: 'g1',
            description: 'Became more confident in meetings',
            before: 'shy and quiet',
            after: 'speaks up regularly',
            observedAt: new Date(),
            acknowledged: false,
          },
        ],
        challenges: [],
        updatedAt: new Date(),
      },
    };

    const result = buildGrowthContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('confident');
    expect(result?.content).toContain('shy');
  });
});

describe('buildInsideJokesContext', () => {
  it('should return null when no jokes', () => {
    const humanMemory: Partial<HumanMemory> = {
      insideJokes: [],
    };

    const result = buildInsideJokesContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should exclude retired jokes', () => {
    const humanMemory: Partial<HumanMemory> = {
      insideJokes: [
        {
          id: 'j1',
          reference: 'The spreadsheet incident',
          origin: 'When they accidentally deleted everything',
          originatedAt: new Date(),
          usageCount: 10,
          status: 'retired', // Should be excluded
        },
      ],
    };

    const result = buildInsideJokesContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should include fresh and beloved jokes', () => {
    const humanMemory: Partial<HumanMemory> = {
      insideJokes: [
        {
          id: 'j1',
          reference: 'The coffee disaster',
          origin: 'Spilled coffee on keyboard',
          originatedAt: new Date(),
          usageCount: 3,
          status: 'fresh',
        },
        {
          id: 'j2',
          reference: 'Excel wizard',
          origin: 'They called themselves that',
          originatedAt: new Date(),
          usageCount: 8,
          status: 'beloved',
        },
      ],
    };

    const result = buildInsideJokesContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('coffee disaster');
    expect(result?.content).toContain('Excel wizard');
  });
});

describe('buildIdentityContext', () => {
  it('should return null when no identity data', () => {
    const humanMemory: Partial<HumanMemory> = {};

    const result = buildIdentityContext(humanMemory);
    expect(result).toBeNull();
  });

  it('should only surface core identity values', () => {
    const humanMemory: Partial<HumanMemory> = {
      identity: {
        values: [
          {
            id: 'v1',
            value: 'family first',
            evidence: ['multiple mentions'],
            strength: 'core_identity', // Strong
            discoveredAt: new Date(),
          },
          {
            id: 'v2',
            value: 'punctuality',
            evidence: ['mentioned once'],
            strength: 'mentioned', // Weak
            discoveredAt: new Date(),
          },
        ],
        dreams: [],
        fears: [],
        formativeExperiences: [],
        updatedAt: new Date(),
      },
    };

    const result = buildIdentityContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('family first');
    expect(result?.content).not.toContain('punctuality');
  });

  it('should surface active dreams', () => {
    const humanMemory: Partial<HumanMemory> = {
      identity: {
        values: [],
        dreams: [
          {
            id: 'd1',
            description: 'Write a novel',
            category: 'creative',
            sentiment: 'determined',
            status: 'active_pursuit',
            firstMentioned: new Date(),
          },
          {
            id: 'd2',
            description: 'Visit Mars',
            category: 'travel',
            sentiment: 'wistful',
            status: 'someday', // Not active
            firstMentioned: new Date(),
          },
        ],
        fears: [],
        formativeExperiences: [],
        updatedAt: new Date(),
      },
    };

    const result = buildIdentityContext(humanMemory);
    expect(result).not.toBeNull();
    expect(result?.content).toContain('Write a novel');
    expect(result?.content).not.toContain('Mars');
  });
});
