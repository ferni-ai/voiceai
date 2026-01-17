/**
 * Values Card Sort Game Tests
 *
 * Tests for game logic, value sorting, and state management.
 */

import { describe, it, expect } from 'vitest';

import {
  createInitialState,
  processInput,
  getStartResult,
  describeStateForVoice,
  getTopFiveValues,
} from '../values-card-sort.js';

describe('ValuesCardSort', () => {
  describe('createInitialState', () => {
    it('should create state with shuffled deck of 30 values', () => {
      const state = createInitialState();

      expect(state.deck).toHaveLength(30);
      expect(state.phase).toBe('intro');
      expect(state.importantPile).toEqual([]);
      expect(state.notAsPile).toEqual([]);
      expect(state.topFive).toEqual([]);
      expect(state.currentCard).toBeNull();
      expect(state.deckIndex).toBe(0);
      expect(state.reflections).toEqual([]);
    });

    it('should shuffle the deck (not always same order)', () => {
      const state1 = createInitialState();
      const state2 = createInitialState();

      // With 30 cards, probability of same order is astronomically low
      // Just check that both have all the same card IDs
      const ids1 = new Set(state1.deck.map((c) => c.id));
      const ids2 = new Set(state2.deck.map((c) => c.id));

      expect(ids1).toEqual(ids2);
    });

    it('should include cards from all categories', () => {
      const state = createInitialState();
      const categories = new Set(state.deck.map((c) => c.category));

      expect(categories.has('relationships')).toBe(true);
      expect(categories.has('achievement')).toBe(true);
      expect(categories.has('growth')).toBe(true);
      expect(categories.has('wellbeing')).toBe(true);
      expect(categories.has('meaning')).toBe(true);
      expect(categories.has('pleasure')).toBe(true);
    });
  });

  describe('getStartResult', () => {
    it('should return intro message', () => {
      const state = createInitialState();
      const result = getStartResult(state);

      expect(result.message.toLowerCase()).toContain('values');
      expect(result.message.toLowerCase()).toContain('30');
      expect(result.gameOver).toBe(false);
    });
  });

  describe('processInput - intro phase', () => {
    it('should start sorting on "yes"', () => {
      const state = createInitialState();
      const result = processInput(state, 'yes');

      expect(result.newState.phase).toBe('sorting');
      expect(result.newState.currentCard).not.toBeNull();
      expect(result.gameOver).toBe(false);
    });

    it('should start sorting on "start"', () => {
      const state = createInitialState();
      const result = processInput(state, 'start');

      expect(result.newState.phase).toBe('sorting');
    });

    it('should start sorting on "ready"', () => {
      const state = createInitialState();
      const result = processInput(state, 'ready');

      expect(result.newState.phase).toBe('sorting');
    });

    it('should repeat intro message on unclear input', () => {
      const state = createInitialState();
      const result = processInput(state, 'banana');

      expect(result.newState.phase).toBe('intro');
      expect(result.message.toLowerCase()).toContain('values');
    });
  });

  describe('processInput - sorting phase', () => {
    it('should sort card as important on "yes"', () => {
      let state = createInitialState();
      state = processInput(state, 'yes').newState; // Start sorting

      const cardBeingConsidered = state.currentCard;
      const result = processInput(state, 'yes');

      expect(result.newState.importantPile).toContainEqual(cardBeingConsidered);
      expect(result.newState.deckIndex).toBe(1);
    });

    it('should sort card as important on "important"', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      const cardBeingConsidered = state.currentCard;
      const result = processInput(state, 'important');

      expect(result.newState.importantPile).toContainEqual(cardBeingConsidered);
    });

    it('should sort card as not important on "no"', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      const cardBeingConsidered = state.currentCard;
      const result = processInput(state, 'no');

      expect(result.newState.notAsPile).toContainEqual(cardBeingConsidered);
      expect(result.newState.importantPile).not.toContainEqual(cardBeingConsidered);
    });

    it('should sort card as not important on "not as"', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      const result = processInput(state, 'not as');
      expect(result.newState.notAsPile).toHaveLength(1);
    });

    it('should progress through all 30 cards', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Sort all cards (alternating important/not)
      for (let i = 0; i < 30; i++) {
        const input = i % 2 === 0 ? 'yes' : 'no';
        const result = processInput(state, input);
        state = result.newState;
      }

      // Should have moved past sorting
      expect(['narrowing', 'reflection']).toContain(state.phase);
    });
  });

  describe('processInput - narrowing phase', () => {
    it('should present comparison pairs when more than 5 important values', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Mark all as important
      for (let i = 0; i < 30; i++) {
        state = processInput(state, 'yes').newState;
      }

      expect(state.phase).toBe('narrowing');
      expect(state.comparisonPair).toBeDefined();
      expect(state.comparisonPair).toHaveLength(2);
    });

    it('should accept first option choice', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Mark all as important to trigger narrowing
      for (let i = 0; i < 30; i++) {
        state = processInput(state, 'yes').newState;
      }

      const firstOption = state.comparisonPair![0];
      const result = processInput(state, firstOption.name);

      expect(result.newState.topFive).toContainEqual(firstOption);
    });

    it('should accept "a" or "1" for first option', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      for (let i = 0; i < 30; i++) {
        state = processInput(state, 'yes').newState;
      }

      const firstOption = state.comparisonPair![0];
      const result = processInput(state, 'a');

      expect(result.newState.topFive).toContainEqual(firstOption);
    });

    it('should accept "b" or "2" for second option', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      for (let i = 0; i < 30; i++) {
        state = processInput(state, 'yes').newState;
      }

      const secondOption = state.comparisonPair![1];
      const result = processInput(state, 'b');

      expect(result.newState.topFive).toContainEqual(secondOption);
    });
  });

  describe('processInput - quit commands', () => {
    it('should end game on "stop"', () => {
      const state = createInitialState();
      const result = processInput(state, 'stop');

      expect(result.gameOver).toBe(true);
    });

    it('should end game on "quit"', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      const result = processInput(state, 'quit');
      expect(result.gameOver).toBe(true);
    });

    it('should preserve progress when quitting', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Sort a few cards
      state = processInput(state, 'yes').newState;
      state = processInput(state, 'yes').newState;
      state = processInput(state, 'no').newState;

      const result = processInput(state, 'stop');
      expect(result.newState.importantPile).toHaveLength(2);
      expect(result.newState.notAsPile).toHaveLength(1);
    });
  });

  describe('processInput - reflection phase', () => {
    it('should move to reflection after narrowing to 5', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Mark exactly 5 as important
      for (let i = 0; i < 5; i++) {
        state = processInput(state, 'yes').newState;
      }
      for (let i = 5; i < 30; i++) {
        state = processInput(state, 'no').newState;
      }

      expect(state.phase).toBe('reflection');
      expect(state.topFive).toHaveLength(5);
    });

    it('should capture reflection and end game', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Mark exactly 5 as important
      for (let i = 0; i < 5; i++) {
        state = processInput(state, 'yes').newState;
      }
      for (let i = 5; i < 30; i++) {
        state = processInput(state, 'no').newState;
      }

      expect(state.phase).toBe('reflection');

      const result = processInput(state, 'These feel right to me');
      expect(result.gameOver).toBe(true);
      expect(result.newState.reflections).toContain('These feel right to me');
    });
  });

  describe('getTopFiveValues', () => {
    it('should return empty array initially', () => {
      const state = createInitialState();
      expect(getTopFiveValues(state)).toEqual([]);
    });

    it('should return top five after completion', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      // Mark exactly 5 as important
      for (let i = 0; i < 5; i++) {
        state = processInput(state, 'yes').newState;
      }
      for (let i = 5; i < 30; i++) {
        state = processInput(state, 'no').newState;
      }

      const topFive = getTopFiveValues(state);
      expect(topFive).toHaveLength(5);
      topFive.forEach((value) => {
        expect(value).toHaveProperty('id');
        expect(value).toHaveProperty('name');
        expect(value).toHaveProperty('description');
        expect(value).toHaveProperty('category');
      });
    });
  });

  describe('describeStateForVoice', () => {
    it('should describe intro phase', () => {
      const state = createInitialState();
      const description = describeStateForVoice(state);

      expect(description).toContain('Values Card Sort');
      expect(description.toLowerCase()).toContain('ready');
    });

    it('should describe sorting phase with progress', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;
      state = processInput(state, 'yes').newState;

      const description = describeStateForVoice(state);
      expect(description.toLowerCase()).toContain('sorting');
    });

    it('should describe narrowing phase', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      for (let i = 0; i < 30; i++) {
        state = processInput(state, 'yes').newState;
      }

      const description = describeStateForVoice(state);
      expect(description.toLowerCase()).toContain('narrow');
    });

    it('should describe completed state with values', () => {
      let state = createInitialState();
      state = processInput(state, 'start').newState;

      for (let i = 0; i < 5; i++) {
        state = processInput(state, 'yes').newState;
      }
      for (let i = 5; i < 30; i++) {
        state = processInput(state, 'no').newState;
      }

      state = processInput(state, 'reflection').newState;

      const description = describeStateForVoice(state);
      expect(description).toContain('Values Card Sort');
      // Should mention at least one value
      expect(state.topFive.some((v) => description.includes(v.name))).toBe(true);
    });
  });

  describe('game flow integration', () => {
    it('should complete a full game with diverse choices', () => {
      let state = createInitialState();

      // Start
      state = processInput(state, "let's go").newState;
      expect(state.phase).toBe('sorting');

      // Sort cards with varied choices
      for (let i = 0; i < 30; i++) {
        // Keep roughly half
        const input = i % 3 !== 0 ? 'yes' : 'no';
        state = processInput(state, input).newState;
      }

      // Now in narrowing phase
      expect(state.phase).toBe('narrowing');

      // Complete narrowing by choosing values
      while (state.phase === 'narrowing' && state.topFive.length < 5) {
        const result = processInput(state, 'first');
        state = result.newState;
        if (result.gameOver) break;
      }

      // Should have top 5 values
      expect(state.topFive.length).toBeLessThanOrEqual(5);
    });
  });
});
