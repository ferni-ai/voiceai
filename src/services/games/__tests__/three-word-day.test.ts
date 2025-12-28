/**
 * Three Word Day Game Tests
 *
 * Tests for game logic, input parsing, and state management.
 */

import { describe, it, expect } from 'vitest';

import {
  createInitialState,
  processInput,
  getStartResult,
  describeStateForVoice,
} from '../three-word-day.js';

describe('ThreeWordDay', () => {
  describe('createInitialState', () => {
    it('should create state with default prompt type "day"', () => {
      const state = createInitialState();

      expect(state.promptType).toBe('day');
      expect(state.words).toEqual([]);
      expect(state.explorationPhase).toBe(0);
      expect(state.insights).toEqual([]);
      expect(state.concluded).toBe(false);
    });

    it('should accept custom prompt types', () => {
      expect(createInitialState('mood').promptType).toBe('mood');
      expect(createInitialState('week').promptType).toBe('week');
      expect(createInitialState('moment').promptType).toBe('moment');
      expect(createInitialState('year').promptType).toBe('year');
    });

    it('should accept custom prompt with custom type', () => {
      const state = createInitialState('custom', 'What three words describe your ideal life?');

      expect(state.promptType).toBe('custom');
      expect(state.customPrompt).toBe('What three words describe your ideal life?');
    });
  });

  describe('getStartResult', () => {
    it('should return introductory message for day prompt', () => {
      const state = createInitialState('day');
      const result = getStartResult(state);

      expect(result.message).toContain('day');
      expect(result.gameOver).toBe(false);
    });

    it('should return appropriate message for mood prompt', () => {
      const state = createInitialState('mood');
      const result = getStartResult(state);

      expect(result.message.toLowerCase()).toContain('feeling');
      expect(result.gameOver).toBe(false);
    });

    it('should use custom prompt when provided', () => {
      const customPrompt = 'Describe your perfect weekend';
      const state = createInitialState('custom', customPrompt);
      const result = getStartResult(state);

      expect(result.message).toContain(customPrompt);
    });
  });

  describe('processInput', () => {
    describe('word collection phase', () => {
      it('should accept three valid words', () => {
        const state = createInitialState();
        const result = processInput(state, 'happy grateful excited');

        expect(result.newState.words).toHaveLength(3);
        expect(result.newState.words).toEqual(['happy', 'grateful', 'excited']);
        expect(result.gameOver).toBe(false);
      });

      it('should accept comma-separated words', () => {
        const state = createInitialState();
        const result = processInput(state, 'peaceful, content, loved');

        expect(result.newState.words).toHaveLength(3);
        expect(result.newState.words).toContain('peaceful');
        expect(result.newState.words).toContain('content');
        expect(result.newState.words).toContain('loved');
      });

      it('should handle fewer than three words by taking what we have', () => {
        const state = createInitialState();
        const result = processInput(state, 'just two');

        // With 2-4 words, takes first 3 (or what's available)
        expect(result.newState.words).toEqual(['just', 'two']);
        expect(result.newState.explorationPhase).toBe(0);
      });

      it('should handle four words by taking first three', () => {
        const state = createInitialState();
        const result = processInput(state, 'one two three four');

        expect(result.newState.words).toHaveLength(3);
        expect(result.newState.words).toEqual(['one', 'two', 'three']);
      });

      it('should reject more than four words', () => {
        const state = createInitialState();
        const result = processInput(state, 'one two three four five');

        // 5+ words returns null from parser, prompts for exactly three
        expect(result.newState.words).toEqual([]);
        expect(result.message.toLowerCase()).toContain('three');
      });

      it('should clean up words (trim, lowercase)', () => {
        const state = createInitialState();
        const result = processInput(state, '  HAPPY   Calm   peaceful  ');

        expect(result.newState.words).toEqual(['happy', 'calm', 'peaceful']);
      });
    });

    describe('exploration phase', () => {
      it('should move to exploration after collecting words', () => {
        const state = createInitialState();
        const result = processInput(state, 'happy grateful excited');

        expect(result.newState.explorationPhase).toBe(0);
        expect(result.message.toLowerCase()).toContain('happy');
      });

      it('should explore each word in sequence', () => {
        let state = createInitialState();
        state = processInput(state, 'hope peace joy').newState;

        // Should be exploring first word
        expect(state.explorationPhase).toBe(0);

        // After responding, should move to next word
        const result = processInput(state, 'Hope means everything to me');
        expect(result.newState.explorationPhase).toBe(1);
      });

      it('should complete after exploring all words and final response', () => {
        let state = createInitialState();
        state = processInput(state, 'one two three').newState;

        // Explore first word
        state = processInput(state, 'First word reflection').newState;
        expect(state.explorationPhase).toBe(1);

        // Explore second word
        state = processInput(state, 'Second word reflection').newState;
        expect(state.explorationPhase).toBe(2);

        // Explore third word - moves to 'complete' phase but not gameOver
        const afterThird = processInput(state, 'Third word reflection');
        expect(afterThird.newState.explorationPhase).toBe('complete');
        expect(afterThird.gameOver).toBe(false);

        // Final response ends the game
        const finalResult = processInput(afterThird.newState, 'Nothing else to add');
        expect(finalResult.gameOver).toBe(true);
      });
    });

    describe('quit commands', () => {
      it('should end game on "stop"', () => {
        const state = createInitialState();
        const result = processInput(state, 'stop');

        expect(result.gameOver).toBe(true);
      });

      it('should end game on "quit"', () => {
        const state = createInitialState();
        const result = processInput(state, 'quit');

        expect(result.gameOver).toBe(true);
      });

      it('should end game on "done"', () => {
        const state = createInitialState();
        const result = processInput(state, 'done');

        expect(result.gameOver).toBe(true);
      });

      it('should end game on "end"', () => {
        const state = createInitialState();
        const result = processInput(state, 'end');

        expect(result.gameOver).toBe(true);
      });

      it('should preserve words when quitting mid-game', () => {
        let state = createInitialState();
        state = processInput(state, 'hope peace joy').newState;

        const result = processInput(state, 'quit');
        expect(result.gameOver).toBe(true);
        expect(result.newState.words).toEqual(['hope', 'peace', 'joy']);
      });
    });
  });

  describe('describeStateForVoice', () => {
    it('should describe collecting phase', () => {
      const state = createInitialState();
      const description = describeStateForVoice(state);

      expect(description).toContain('Three Word Day');
    });

    it('should describe exploration phase', () => {
      let state = createInitialState();
      state = processInput(state, 'hope peace joy').newState;

      const description = describeStateForVoice(state);
      expect(description).toContain('exploring');
    });

    it('should describe completed state', () => {
      let state = createInitialState();
      state = processInput(state, 'a b c').newState;
      state = processInput(state, 'reflection 1').newState;
      state = processInput(state, 'reflection 2').newState;
      state = processInput(state, 'reflection 3').newState;

      const description = describeStateForVoice(state);
      expect(description).toContain('explored');
    });
  });

  describe('game flow integration', () => {
    it('should complete a full game session', () => {
      let state = createInitialState('day');

      // Start
      const startResult = getStartResult(state);
      expect(startResult.gameOver).toBe(false);

      // Provide words
      state = processInput(state, 'productive grateful inspired').newState;
      expect(state.words).toHaveLength(3);

      // Explore each word
      const reflections = ['This day felt productive', 'Gratitude for small things', 'Inspired to keep going'];

      for (const reflection of reflections) {
        const result = processInput(state, reflection);
        state = result.newState;
      }

      // After all explorations, we're in 'complete' phase but game isn't over
      expect(state.explorationPhase).toBe('complete');

      // Final response ends the game
      const finalResult = processInput(state, 'Thanks for listening');
      expect(finalResult.gameOver).toBe(true);
      expect(finalResult.newState.concluded).toBe(true);
    });

    it('should track insights through exploration', () => {
      let state = createInitialState();
      state = processInput(state, 'growth learning change').newState;

      state = processInput(state, 'Growth has been huge for me this year').newState;
      expect(state.insights.length).toBeGreaterThan(0);
    });
  });
});
