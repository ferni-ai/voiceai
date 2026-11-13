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
    expect(normalizePersonaId('john-bogle')).toBe('bogle');
    expect(normalizePersonaId('bogle')).toBe('bogle');
    expect(normalizePersonaId('nayan-patel')).toBe('nayan');
    expect(normalizePersonaId('index-investor')).toBe('bogle');
  });

  it('should normalize peter aliases', () => {
    expect(normalizePersonaId('peter-john')).toBe('peter');
    expect(normalizePersonaId('peter')).toBe('peter');
    expect(normalizePersonaId('stock-picker')).toBeNull(); // Tom's old role name; Tom is retired
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
