/**
 * Tests for Human Signal Extractor
 *
 * Validates extraction of human-centric memory signals from conversations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractHumanSignals, mergeSignalsIntoMemory } from '../human-signal-extractor.js';
import type { HumanMemory } from '../../types/human-memory.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

interface TestTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

const createContext = (overrides = {}) => ({
  userId: 'test-user-123',
  personaId: 'ferni',
  userName: 'Test User',
  ...overrides,
});

// ============================================================================
// DATE EXTRACTION TESTS
// ============================================================================

describe('Date Extraction', () => {
  it('should extract birthday with month name format', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'My birthday is March 15' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.importantDates).toHaveLength(1);
    expect(result.importantDates[0]).toMatchObject({
      type: 'birthday',
      month: 3,
      day: 15,
    });
  });

  it('should extract birthday with slash format', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'My birthday is on 7/4' }];

    const result = extractHumanSignals(turns, createContext());

    // May extract multiple dates due to pattern overlaps (e.g., 7/4 as both birthday and general date)
    expect(result.importantDates.length).toBeGreaterThanOrEqual(1);
    const birthdayDates = result.importantDates.filter((d) => d.type === 'birthday');
    expect(birthdayDates.length).toBeGreaterThanOrEqual(1);
    expect(birthdayDates[0]).toMatchObject({
      type: 'birthday',
      month: 7,
      day: 4,
    });
  });

  it('should extract anniversary date', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'Our anniversary is June 20' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.importantDates).toHaveLength(1);
    expect(result.importantDates[0]).toMatchObject({
      type: 'anniversary',
      month: 6,
      day: 20,
    });
  });

  it('should mark loss anniversaries as sensitive', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'She passed away on October 5' }];

    const result = extractHumanSignals(turns, createContext());

    const lossAnniversaries = result.importantDates.filter((d) => d.type === 'loss_anniversary');
    expect(lossAnniversaries.length).toBeGreaterThanOrEqual(1);
    expect(lossAnniversaries[0]).toMatchObject({
      type: 'loss_anniversary',
      sentiment: 'sensitive',
      wantsAcknowledgment: false,
    });
  });

  it('should extract loss anniversary with subject', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'My mom passed away on March 15' }];

    const result = extractHumanSignals(turns, createContext());

    const lossAnniversaries = result.importantDates.filter((d) => d.type === 'loss_anniversary');
    expect(lossAnniversaries.length).toBeGreaterThanOrEqual(1);
    expect(lossAnniversaries[0]).toMatchObject({
      type: 'loss_anniversary',
      sentiment: 'sensitive',
    });
  });

  it('should extract loss anniversary with "I lost"', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'I lost my father in 2019' }];

    const result = extractHumanSignals(turns, createContext());

    const lossAnniversaries = result.importantDates.filter((d) => d.type === 'loss_anniversary');
    expect(lossAnniversaries.length).toBeGreaterThanOrEqual(1);
    expect(lossAnniversaries[0]).toMatchObject({
      type: 'loss_anniversary',
      sentiment: 'sensitive',
    });
  });
});

// ============================================================================
// VALUE EXTRACTION TESTS
// ============================================================================

describe('Value Extraction', () => {
  it('should extract "family first" value', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'For me, family comes first, always.' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toMatchObject({
      value: 'family first',
      strength: 'mentioned',
    });
  });

  it('should extract multiple values from conversation', () => {
    const turns: TestTurn[] = [
      { role: 'user', content: 'I always try to be honest with people.' },
      { role: 'assistant', content: 'That is important.' },
      { role: 'user', content: 'Yeah, and hard work is important to me too.' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.values.length).toBeGreaterThanOrEqual(2);
    expect(result.values.map((v) => v.value)).toContain('honesty');
    expect(result.values.map((v) => v.value)).toContain('hard work');
  });
});

// ============================================================================
// DREAM EXTRACTION TESTS
// ============================================================================

describe('Dream Extraction', () => {
  it('should extract travel dreams', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'I want to travel to Japan' }];

    const result = extractHumanSignals(turns, createContext());

    // Should extract at least one travel dream
    const travelDreams = result.dreams.filter((d) => d.category === 'travel');
    expect(travelDreams.length).toBeGreaterThanOrEqual(1);
    expect(travelDreams[0].description).toContain('Japan');
  });

  it('should extract career dreams', () => {
    const turns: TestTurn[] = [
      { role: 'user', content: 'My dream job would be running my own bakery' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.dreams).toHaveLength(1);
    expect(result.dreams[0]).toMatchObject({
      category: 'career',
    });
  });

  it('should extract learning aspirations', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'I want to learn how to play piano' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.dreams).toHaveLength(1);
    expect(result.dreams[0]).toMatchObject({
      category: 'learning',
    });
  });
});

// ============================================================================
// FEAR EXTRACTION TESTS
// ============================================================================

describe('Fear Extraction', () => {
  it('should extract explicit fears', () => {
    const turns: TestTurn[] = [{ role: 'user', content: "I'm afraid of failing my kids" }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.fears).toHaveLength(1);
    expect(result.fears[0].fear).toContain('failing');
    expect(result.fears[0].sensitivity).toBe('tread_carefully');
  });

  it('should extract worries', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'I worry about money all the time' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.fears).toHaveLength(1);
    expect(result.fears[0].fear).toContain('money');
  });
});

// ============================================================================
// STRESS TRIGGER EXTRACTION TESTS
// ============================================================================

describe('Stress Trigger Extraction', () => {
  it('should extract work stress', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'Work is stressing me out lately' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.stressTriggers).toHaveLength(1);
    expect(result.stressTriggers[0]).toMatchObject({
      category: 'work',
      intensity: 'moderate',
    });
  });

  it('should extract financial stress', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'Money is worrying me right now' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.stressTriggers).toHaveLength(1);
    expect(result.stressTriggers[0].category).toBe('financial');
  });
});

// ============================================================================
// GROWTH MARKER EXTRACTION TESTS
// ============================================================================

describe('Growth Marker Extraction', () => {
  it('should extract before/after growth statements', () => {
    const turns: TestTurn[] = [
      { role: 'user', content: 'I used to be so shy but now I can speak up in meetings' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.growthMarkers).toHaveLength(1);
    expect(result.growthMarkers[0]).toMatchObject({
      acknowledged: false,
    });
    expect(result.growthMarkers[0].before).toBeTruthy();
    expect(result.growthMarkers[0].after).toBeTruthy();
  });

  it('should extract "finally" accomplishments', () => {
    const turns: TestTurn[] = [
      { role: 'user', content: 'I finally ran a marathon for the first time' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.growthMarkers).toHaveLength(1);
  });
});

// ============================================================================
// COMFORT PATTERN EXTRACTION TESTS
// ============================================================================

describe('Comfort Pattern Extraction', () => {
  it('should extract validation as comfort type', () => {
    const turns: TestTurn[] = [
      { role: 'user', content: 'It helps when someone just validates how I feel' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.comfortPatterns).toHaveLength(1);
    expect(result.comfortPatterns[0].type).toBe('validation');
  });

  it('should extract presence/listening as comfort type', () => {
    const turns: TestTurn[] = [{ role: 'user', content: 'I just need someone to listen' }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.comfortPatterns).toHaveLength(1);
    expect(result.comfortPatterns[0].type).toBe('presence');
  });
});

// ============================================================================
// AVOIDANCE DETECTION TESTS
// ============================================================================

describe('Avoidance Detection', () => {
  it('should detect topic avoidance requests', () => {
    const turns: TestTurn[] = [{ role: 'user', content: "I'd rather not talk about my father" }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.avoidances).toHaveLength(1);
    expect(result.avoidances[0]).toMatchObject({
      avoidanceStyle: 'deflects',
      approach: 'only_if_they_do',
    });
  });

  it('should detect "don\'t want to discuss" patterns', () => {
    const turns: TestTurn[] = [{ role: 'user', content: "I don't want to talk about the divorce" }];

    const result = extractHumanSignals(turns, createContext());

    expect(result.avoidances).toHaveLength(1);
    expect(result.avoidances[0].topic).toContain('divorce');
  });
});

// ============================================================================
// MERGE AND DEDUPLICATION TESTS
// ============================================================================

describe('Merge with Deduplication', () => {
  it('should dedupe duplicate dates', () => {
    const existing: Partial<HumanMemory> = {
      importantDates: [
        {
          id: 'existing-1',
          type: 'birthday',
          label: 'My birthday',
          month: 3,
          day: 15,
          significance: 'meaningful',
          wantsAcknowledgment: true,
          discoveredAt: new Date(),
        },
      ],
    };

    const extracted = {
      importantDates: [
        {
          id: 'new-1',
          type: 'birthday' as const,
          label: 'My birthday',
          month: 3,
          day: 15,
          significance: 'meaningful' as const,
          wantsAcknowledgment: true,
          discoveredAt: new Date(),
        },
      ],
      insideJokes: [],
      runningThemes: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      challenges: [],
      avoidances: [],
      comfortPatterns: [],
      stressTriggers: [],
      emotionalTells: [],
    };

    const result = mergeSignalsIntoMemory(existing, extracted);

    // Should still have only 1 date, not 2
    expect(result.importantDates).toHaveLength(1);
  });

  it('should dedupe duplicate values', () => {
    const existing: Partial<HumanMemory> = {
      identity: {
        values: [
          {
            id: 'v1',
            value: 'family first',
            evidence: ['previous mention'],
            strength: 'mentioned',
            discoveredAt: new Date(),
          },
        ],
        dreams: [],
        fears: [],
        formativeExperiences: [],
        updatedAt: new Date(),
      },
    };

    const extracted = {
      importantDates: [],
      insideJokes: [],
      runningThemes: [],
      values: [
        {
          id: 'v2',
          value: 'Family First', // Same value, different case
          evidence: ['new mention'],
          strength: 'mentioned' as const,
          discoveredAt: new Date(),
        },
      ],
      dreams: [],
      fears: [],
      growthMarkers: [],
      challenges: [],
      avoidances: [],
      comfortPatterns: [],
      stressTriggers: [],
      emotionalTells: [],
    };

    const result = mergeSignalsIntoMemory(existing, extracted);

    // Should still have only 1 value
    expect(result.identity?.values).toHaveLength(1);
  });

  it('should merge avoidance observations', () => {
    const existing: Partial<HumanMemory> = {
      unspoken: {
        avoidances: [
          {
            id: 'a1',
            topic: 'my father',
            avoidanceStyle: 'deflects',
            observations: 2,
            approach: 'only_if_they_do',
            firstNoticed: new Date(),
          },
        ],
        reachOutPatterns: [],
        energyPatterns: [],
        updatedAt: new Date(),
      },
    };

    const extracted = {
      importantDates: [],
      insideJokes: [],
      runningThemes: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      challenges: [],
      avoidances: [
        {
          id: 'a2',
          topic: 'my father', // Same topic
          avoidanceStyle: 'deflects' as const,
          observations: 1,
          approach: 'only_if_they_do' as const,
          firstNoticed: new Date(),
        },
      ],
      comfortPatterns: [],
      stressTriggers: [],
      emotionalTells: [],
    };

    const result = mergeSignalsIntoMemory(existing, extracted);

    // Should have 1 avoidance with 3 observations
    expect(result.unspoken?.avoidances).toHaveLength(1);
    expect(result.unspoken?.avoidances?.[0].observations).toBe(3);
  });

  it('should add new items when not duplicates', () => {
    const existing: Partial<HumanMemory> = {
      importantDates: [
        {
          id: 'd1',
          type: 'birthday',
          label: 'My birthday',
          month: 3,
          day: 15,
          significance: 'meaningful',
          wantsAcknowledgment: true,
          discoveredAt: new Date(),
        },
      ],
    };

    const extracted = {
      importantDates: [
        {
          id: 'd2',
          type: 'anniversary' as const, // Different type
          label: 'Wedding anniversary',
          month: 6,
          day: 20,
          significance: 'major' as const,
          wantsAcknowledgment: true,
          discoveredAt: new Date(),
        },
      ],
      insideJokes: [],
      runningThemes: [],
      values: [],
      dreams: [],
      fears: [],
      growthMarkers: [],
      challenges: [],
      avoidances: [],
      comfortPatterns: [],
      stressTriggers: [],
      emotionalTells: [],
    };

    const result = mergeSignalsIntoMemory(existing, extracted);

    // Should have 2 dates now
    expect(result.importantDates).toHaveLength(2);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty conversation', () => {
    const result = extractHumanSignals([], createContext());

    expect(result.importantDates).toHaveLength(0);
    expect(result.values).toHaveLength(0);
    expect(result.fears).toHaveLength(0);
  });

  it('should only extract from user turns', () => {
    const turns: TestTurn[] = [
      { role: 'assistant', content: 'My birthday is March 15' }, // Should be ignored
      { role: 'user', content: 'That is nice' },
    ];

    const result = extractHumanSignals(turns, createContext());

    expect(result.importantDates).toHaveLength(0);
  });

  it('should handle undefined existing memory', () => {
    const extracted = {
      importantDates: [],
      insideJokes: [],
      runningThemes: [],
      values: [
        {
          id: 'v1',
          value: 'honesty',
          evidence: ['test'],
          strength: 'mentioned' as const,
          discoveredAt: new Date(),
        },
      ],
      dreams: [],
      fears: [],
      growthMarkers: [],
      challenges: [],
      avoidances: [],
      comfortPatterns: [],
      stressTriggers: [],
      emotionalTells: [],
    };

    const result = mergeSignalsIntoMemory(undefined, extracted);

    expect(result.identity?.values).toHaveLength(1);
  });
});
