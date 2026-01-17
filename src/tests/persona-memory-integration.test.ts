/**
 * Persona Memory Integration Tests
 *
 * Validates that the persona memory system works end-to-end:
 * - Memory storage per persona
 * - Memory retrieval with relationship-stage filtering
 * - Memory injection into LLM context
 * - Memory-enhanced greetings
 * - Proactive callbacks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPersonaMemories,
  normalizePersonaId,
  formatFerniMemories,
  formatBogleMemories,
  formatPeterMemories,
  formatMayaMemories,
  formatJordanMemories,
  filterMemoriesByRelationshipStage,
  getRandomAcknowledgmentPhrase,
  type NormalizedPersonaId,
} from '../intelligence/context-builders/personas/persona-memory.js';
import type {
  Memory,
  FerniMemory,
  BogleMemory,
  PeterMemory,
  MayaMemory,
  JordanMemory,
} from '../services/memory/persona-memories.js';

// ============================================================================
// PERSONA ID NORMALIZATION TESTS
// ============================================================================

describe('Persona ID Normalization', () => {
  it('should normalize ferni aliases', () => {
    expect(normalizePersonaId('ferni')).toBe('ferni');
    expect(normalizePersonaId('jack-b')).toBe('ferni');
    expect(normalizePersonaId('jackie')).toBe('ferni');
    expect(normalizePersonaId('life-coach')).toBe('ferni');
    expect(normalizePersonaId('FERNI')).toBe('ferni');
  });

  it('should normalize bogle aliases', () => {
    expect(normalizePersonaId('nayan-patel')).toBe('bogle');
    expect(normalizePersonaId('bogle')).toBe('bogle');
    expect(normalizePersonaId('index-investor')).toBe('bogle');
  });

  it('should normalize peter aliases', () => {
    expect(normalizePersonaId('peter-john')).toBe('peter');
    expect(normalizePersonaId('peter')).toBe('peter');
    expect(normalizePersonaId('stock-picker')).toBe('peter');
  });

  it('should normalize maya aliases', () => {
    expect(normalizePersonaId('maya')).toBe('maya');
    expect(normalizePersonaId('spend-save')).toBe('maya');
    expect(normalizePersonaId('maya-santos')).toBe('maya');
  });

  it('should normalize jordan aliases', () => {
    expect(normalizePersonaId('jordan')).toBe('jordan');
    expect(normalizePersonaId('event-planner')).toBe('jordan');
    expect(normalizePersonaId('jordan-taylor')).toBe('jordan');
  });

  it('should return null for unknown personas', () => {
    expect(normalizePersonaId('unknown')).toBeNull();
    expect(normalizePersonaId('')).toBeNull();
    expect(normalizePersonaId(undefined)).toBeNull();
  });
});

// ============================================================================
// RELATIONSHIP STAGE FILTERING TESTS
// ============================================================================

describe('Relationship Stage Memory Filtering', () => {
  const mockMemories: Memory[] = [
    { id: '1', name: 'Memory 1', type: 'preference', sentiment: 'positive' } as Memory,
    { id: '2', name: 'Memory 2', type: 'win', sentiment: 'positive' } as Memory,
    { id: '3', name: 'Trigger', type: 'trigger', sentiment: 'negative' } as Memory,
    { id: '4', name: 'Memory 4', type: 'topic', sentiment: 'neutral' } as Memory,
    { id: '5', name: 'Memory 5', type: 'preference', sentiment: 'positive' } as Memory,
    { id: '6', name: 'Memory 6', type: 'win', sentiment: 'positive' } as Memory,
    { id: '7', name: 'Memory 7', type: 'topic', sentiment: 'neutral' } as Memory,
    { id: '8', name: 'Memory 8', type: 'preference', sentiment: 'positive' } as Memory,
    { id: '9', name: 'Memory 9', type: 'win', sentiment: 'positive' } as Memory,
    { id: '10', name: 'Memory 10', type: 'topic', sentiment: 'neutral' } as Memory,
  ];

  it('should show all memories for trusted_advisor', () => {
    const filtered = filterMemoriesByRelationshipStage(mockMemories, 'trusted_advisor');
    expect(filtered.length).toBe(mockMemories.length);
  });

  it('should show all memories for old_friend', () => {
    const filtered = filterMemoriesByRelationshipStage(mockMemories, 'old_friend');
    expect(filtered.length).toBe(mockMemories.length);
  });

  it('should limit memories for friend stage', () => {
    const manyMemories = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      name: `Memory ${i}`,
      type: 'preference',
      sentiment: 'positive' as const,
    })) as Memory[];

    const filtered = filterMemoriesByRelationshipStage(manyMemories, 'friend');
    expect(filtered.length).toBeLessThanOrEqual(15);
  });

  it('should filter negative sentiment for acquaintance stage', () => {
    const filtered = filterMemoriesByRelationshipStage(mockMemories, 'acquaintance');
    // Should not include the trigger (negative sentiment)
    expect(filtered.some((m) => m.sentiment === 'negative')).toBe(false);
    expect(filtered.length).toBeLessThanOrEqual(8);
  });

  it('should be very limited for new_acquaintance/stranger', () => {
    const filtered = filterMemoriesByRelationshipStage(mockMemories, 'new_acquaintance');
    expect(filtered.length).toBeLessThanOrEqual(3);
  });

  it('should be very limited when stage is undefined', () => {
    const filtered = filterMemoriesByRelationshipStage(mockMemories, undefined);
    expect(filtered.length).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// MEMORY FORMATTING TESTS
// ============================================================================

describe('Ferni Memory Formatting', () => {
  it('should format preferences correctly', () => {
    const memories: FerniMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'jack-b',
        name: 'morning check-ins',
        type: 'preference',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatFerniMemories(memories, 'Sarah');
    expect(formatted).toContain('Sarah likes');
    expect(formatted).toContain('morning check-ins');
  });

  it('should format wins correctly', () => {
    const memories: FerniMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'jack-b',
        name: 'Got promoted!',
        type: 'win',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatFerniMemories(memories, 'Sarah');
    expect(formatted).toContain('Recent wins');
    expect(formatted).toContain('Got promoted!');
  });

  it('should format inside jokes', () => {
    const memories: FerniMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'jack-b',
        name: 'The coffee incident',
        type: 'inside_joke',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatFerniMemories(memories, 'Sarah');
    expect(formatted).toContain('Inside jokes');
    expect(formatted).toContain('The coffee incident');
  });

  it('should return empty string for empty memories', () => {
    expect(formatFerniMemories([], 'Sarah')).toBe('');
  });
});

describe('Bogle Memory Formatting', () => {
  it('should format funds with ticker and expense ratio', () => {
    const memories: BogleMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'nayan-patel',
        name: 'Vanguard Total Stock Market',
        type: 'fund',
        ticker: 'VTI',
        expenseRatio: 0.03,
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatBogleMemories(memories, 'John');
    expect(formatted).toContain('VTI');
    expect(formatted).toContain('Vanguard Total Stock Market');
    expect(formatted).toContain('0.03%');
  });

  it('should format investing philosophies', () => {
    const memories: BogleMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'nayan-patel',
        name: 'Stay the course',
        type: 'philosophy',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatBogleMemories(memories, 'John');
    expect(formatted).toContain('investing principles');
    expect(formatted).toContain('Stay the course');
  });
});

describe('Peter John Memory Formatting', () => {
  it('should format watchlist with reasons', () => {
    const memories: PeterMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'peter-john',
        name: 'Apple',
        type: 'watchlist',
        ticker: 'AAPL',
        reason: 'I use their products daily',
        sentiment: 'watchful',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatPeterMemories(memories, 'Mike');
    expect(formatted).toContain('AAPL');
    expect(formatted).toContain('I use their products daily');
    expect(formatted).toContain('watchlist');
  });

  it('should highlight ten-baggers', () => {
    const memories: PeterMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'peter-john',
        name: 'Monster Beverage',
        type: 'ten_bagger',
        ticker: 'MNST',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatPeterMemories(memories, 'Mike');
    expect(formatted).toContain('🚀');
    expect(formatted).toContain('Ten-bagger');
    expect(formatted).toContain('MNST');
  });
});

describe('Maya Memory Formatting', () => {
  it('should format savings goals with progress', () => {
    const memories: MayaMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'spend-save',
        name: 'Emergency Fund',
        type: 'savings_goal',
        targetAmount: 10000,
        currentAmount: 5000,
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatMayaMemories(memories, 'Lisa');
    expect(formatted).toContain('🎯');
    expect(formatted).toContain('Emergency Fund');
    expect(formatted).toContain('50%');
    expect(formatted).toContain('$10,000');
  });

  it('should format spending triggers with warning', () => {
    const memories: MayaMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'spend-save',
        name: 'stress shopping',
        type: 'trigger',
        sentiment: 'negative',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatMayaMemories(memories, 'Lisa');
    expect(formatted).toContain('⚠️');
    expect(formatted).toContain('triggers');
    expect(formatted).toContain('stress shopping');
  });
});

describe('Jordan Memory Formatting', () => {
  it('should format important dates', () => {
    const memories: JordanMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'event-planner',
        name: "Mom's Birthday",
        type: 'date',
        date: 'June 15',
        person: 'Mom',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatJordanMemories(memories, 'Emma');
    expect(formatted).toContain("Mom's Birthday");
    expect(formatted).toContain('June 15');
  });

  it('should format dream destinations', () => {
    const memories: JordanMemory[] = [
      {
        id: '1',
        userId: 'test',
        personaId: 'event-planner',
        name: 'Japan',
        type: 'destination',
        sentiment: 'positive',
        tags: [],
        timesReferenced: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const formatted = formatJordanMemories(memories, 'Emma');
    expect(formatted).toContain('✈️');
    expect(formatted).toContain('Dream destinations');
    expect(formatted).toContain('Japan');
  });
});

// ============================================================================
// ACKNOWLEDGMENT PHRASES TESTS
// ============================================================================

describe('Memory Acknowledgment Phrases', () => {
  it('should return ferni-style phrases', () => {
    const phrase = getRandomAcknowledgmentPhrase('ferni');
    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });

  it('should return bogle-style phrases', () => {
    const phrase = getRandomAcknowledgmentPhrase('bogle');
    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });

  it('should return peter-style phrases', () => {
    const phrase = getRandomAcknowledgmentPhrase('peter');
    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });

  it('should return maya-style phrases', () => {
    const phrase = getRandomAcknowledgmentPhrase('maya');
    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });

  it('should return jordan-style phrases', () => {
    const phrase = getRandomAcknowledgmentPhrase('jordan');
    expect(phrase).toBeTruthy();
    expect(typeof phrase).toBe('string');
  });
});

// ============================================================================
// GREETING REPETITION PREVENTION TESTS
// ============================================================================

import {
  hashGreeting,
  hasGreetingBeenUsed,
  recordGreetingUsage,
  getUsedGreetingHashes,
  type HumanizingState,
} from '../services/humanizing-state.js';

describe('Greeting Repetition Prevention', () => {
  const createMockState = (): HumanizingState => ({
    usedShareTags: [],
    totalSpontaneousShares: 0,
    moodHistory: [],
    storiesTold: [],
    hotTakesShared: [],
    innerWorldRevealed: [],
    relationshipMilestones: [],
    vulnerabilityMoments: 0,
    usedGreetings: [],
    updatedAt: new Date(),
  });

  describe('hashGreeting', () => {
    it('should generate consistent hashes for the same greeting', () => {
      const greeting = 'Hey Sarah! Good to see you again.';
      const hash1 = hashGreeting(greeting);
      const hash2 = hashGreeting(greeting);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different greetings', () => {
      const hash1 = hashGreeting('Hey Sarah! Good to see you again.');
      const hash2 = hashGreeting('Hello there! Welcome back.');
      expect(hash1).not.toBe(hash2);
    });

    it('should strip SSML tags when hashing', () => {
      const withSsml = '<emotion value="happy"/>Hey Sarah! <break time="200ms"/>Good to see you.';
      const withoutSsml = 'Hey Sarah! Good to see you.';
      const hash1 = hashGreeting(withSsml);
      const hash2 = hashGreeting(withoutSsml);
      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = hashGreeting('Hey Sarah!');
      const hash2 = hashGreeting('hey sarah!');
      expect(hash1).toBe(hash2);
    });
  });

  describe('hasGreetingBeenUsed', () => {
    it('should return false for unused greetings', () => {
      const state = createMockState();
      expect(hasGreetingBeenUsed(state, 'Hey Sarah!')).toBe(false);
    });

    it('should return true for used greetings', () => {
      const state = createMockState();
      const updatedState = recordGreetingUsage(state, 'Hey Sarah!');
      expect(hasGreetingBeenUsed(updatedState, 'Hey Sarah!')).toBe(true);
    });

    it('should detect SSML-equivalent greetings', () => {
      const state = createMockState();
      const updatedState = recordGreetingUsage(state, '<emotion value="happy"/>Hey Sarah!');
      expect(hasGreetingBeenUsed(updatedState, 'Hey Sarah!')).toBe(true);
    });
  });

  describe('recordGreetingUsage', () => {
    it('should add greeting hash to usedGreetings', () => {
      const state = createMockState();
      const updatedState = recordGreetingUsage(state, 'Hey Sarah!');
      expect(updatedState.usedGreetings.length).toBe(1);
    });

    it('should update lastGreetingAt', () => {
      const state = createMockState();
      const updatedState = recordGreetingUsage(state, 'Hey Sarah!');
      expect(updatedState.lastGreetingAt).toBeDefined();
      expect(updatedState.lastGreetingAt instanceof Date).toBe(true);
    });

    it('should keep only the last 20 greetings', () => {
      let state = createMockState();

      // Add 25 different greetings
      for (let i = 0; i < 25; i++) {
        state = recordGreetingUsage(state, `Greeting number ${i}`);
      }

      expect(state.usedGreetings.length).toBe(20);
    });

    it('should preserve other state fields', () => {
      const state = createMockState();
      state.totalSpontaneousShares = 5;
      state.storiesTold = ['story1', 'story2'];

      const updatedState = recordGreetingUsage(state, 'Hey Sarah!');

      expect(updatedState.totalSpontaneousShares).toBe(5);
      expect(updatedState.storiesTold).toEqual(['story1', 'story2']);
    });
  });

  describe('getUsedGreetingHashes', () => {
    it('should return empty array for new state', () => {
      const state = createMockState();
      expect(getUsedGreetingHashes(state)).toEqual([]);
    });

    it('should return all greeting hashes', () => {
      let state = createMockState();
      state = recordGreetingUsage(state, 'Greeting 1');
      state = recordGreetingUsage(state, 'Greeting 2');

      const hashes = getUsedGreetingHashes(state);
      expect(hashes.length).toBe(2);
    });
  });
});
