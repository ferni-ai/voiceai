/**
 * Headline Writer Game Tests
 *
 * Tests for game logic, headline writing, and state management.
 */

import { describe, it, expect } from 'vitest';

import {
  createInitialState,
  processInput,
  getStartResult,
  describeStateForVoice,
  getSessionHeadlines,
} from '../headline-writer.js';

describe('HeadlineWriter', () => {
  describe('createInitialState', () => {
    it('should create state with random timeframe by default', () => {
      const state = createInitialState();

      expect(['today', 'this_week', 'this_month', 'this_year', 'past', 'future', 'dream']).toContain(
        state.currentTimeframe
      );
      expect(state.phase).toBe('prompt');
      expect(state.headlines).toEqual([]);
      expect(state.round).toBe(1);
    });

    it('should accept custom timeframe', () => {
      expect(createInitialState('today').currentTimeframe).toBe('today');
      expect(createInitialState('future').currentTimeframe).toBe('future');
      expect(createInitialState('dream').currentTimeframe).toBe('dream');
      expect(createInitialState('past').currentTimeframe).toBe('past');
    });

    it('should accept custom tone', () => {
      expect(createInitialState('today', 'triumphant').suggestedTone).toBe('triumphant');
      expect(createInitialState('today', 'honest').suggestedTone).toBe('honest');
      expect(createInitialState('today', 'humorous').suggestedTone).toBe('humorous');
      expect(createInitialState('today', 'hopeful').suggestedTone).toBe('hopeful');
    });

    it('should default to "any" tone', () => {
      const state = createInitialState('today');
      expect(state.suggestedTone).toBe('any');
    });
  });

  describe('getStartResult', () => {
    it('should return timeframe-specific prompt', () => {
      const stateToday = createInitialState('today');
      const resultToday = getStartResult(stateToday);

      expect(resultToday.message.toLowerCase()).toContain('today');
      expect(resultToday.gameOver).toBe(false);
    });

    it('should include tone suggestion when provided', () => {
      const state = createInitialState('today', 'humorous');
      const result = getStartResult(state);

      expect(result.message.toLowerCase()).toContain('laugh');
    });

    it('should move to writing phase', () => {
      const state = createInitialState('today');
      const result = getStartResult(state);

      expect(result.newState.phase).toBe('writing');
    });
  });

  describe('processInput - prompt phase', () => {
    it('should accept headline directly in prompt phase', () => {
      const state = createInitialState('today');
      const result = processInput(state, 'Local Developer Finally Gets Tests Passing');

      expect(result.newState.currentHeadline?.text).toBe('Local Developer Finally Gets Tests Passing');
      expect(result.newState.phase).toBe('subheadline');
    });

    it('should allow timeframe selection in prompt phase', () => {
      const state = createInitialState('today');
      const result = processInput(state, 'future');

      expect(result.newState.currentTimeframe).toBe('future');
      expect(result.newState.phase).toBe('writing');
    });

    it('should accept number selection for timeframe', () => {
      const state = createInitialState('today');

      const result1 = processInput(state, '1');
      expect(result1.newState.currentTimeframe).toBe('today');

      const result7 = processInput(state, '7');
      expect(result7.newState.currentTimeframe).toBe('dream');
    });
  });

  describe('processInput - writing phase', () => {
    it('should accept valid headline', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState; // Move to writing phase

      const result = processInput(state, 'Tech Worker Discovers Joy in Small Things');

      expect(result.newState.currentHeadline?.text).toBe('Tech Worker Discovers Joy in Small Things');
      expect(result.newState.phase).toBe('subheadline');
      expect(result.message).toContain('subheadline');
    });

    it('should reject too-short headlines', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;

      const result = processInput(state, 'Hi');

      expect(result.newState.phase).toBe('writing');
      expect(result.message.toLowerCase()).toContain('headline');
    });

    it('should provide encouraging feedback for good headline', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;

      const result = processInput(state, 'Breaking: Human Being Does Thing');

      expect(result.message.length).toBeGreaterThan(0);
    });
  });

  describe('processInput - subheadline phase', () => {
    it('should accept subheadline and move to reflection', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;

      const result = processInput(state, 'Friends and family express mild surprise');

      expect(result.newState.phase).toBe('reflection');
      expect(result.newState.headlines).toHaveLength(1);
      expect(result.newState.headlines[0].subheadline).toBe('Friends and family express mild surprise');
    });

    it('should allow skipping subheadline', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;

      const result = processInput(state, 'skip');

      expect(result.newState.phase).toBe('reflection');
      expect(result.newState.headlines[0].subheadline).toBeUndefined();
    });

    it('should allow "no" to skip subheadline', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;

      const result = processInput(state, 'no');

      expect(result.newState.headlines[0].subheadline).toBeUndefined();
    });
  });

  describe('processInput - reflection phase', () => {
    it('should ask about writing another after reflection', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;
      state = processInput(state, 'skip').newState;

      const result = processInput(state, 'This really captures how I feel');

      expect(result.newState.phase).toBe('another');
      expect(result.message.toLowerCase()).toContain('another');
    });
  });

  describe('processInput - another phase', () => {
    it('should start new round on "yes"', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'reflection').newState;

      const result = processInput(state, 'yes');

      expect(result.newState.phase).toBe('prompt');
      expect(result.newState.round).toBe(2);
      expect(result.gameOver).toBe(false);
    });

    it('should end game on "no"', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'reflection').newState;

      const result = processInput(state, 'no');

      expect(result.gameOver).toBe(true);
      expect(result.newState.phase).toBe('complete');
    });

    it('should include summary in final message', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'reflection').newState;

      const result = processInput(state, 'done');

      expect(result.message).toContain('Person Achieves Goal');
    });

    it('should allow direct timeframe selection for next round', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'Person Achieves Goal').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'reflection').newState;

      const result = processInput(state, 'future');

      expect(result.newState.currentTimeframe).toBe('future');
      expect(result.newState.phase).toBe('writing');
    });
  });

  describe('processInput - quit commands', () => {
    it('should end game on "stop"', () => {
      const state = createInitialState();
      const result = processInput(state, 'stop');

      expect(result.gameOver).toBe(true);
    });

    it('should end game on "quit"', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;

      const result = processInput(state, 'quit');
      expect(result.gameOver).toBe(true);
    });

    it('should include summary when quitting with headlines', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'My First Headline').newState;
      state = processInput(state, 'skip').newState;

      const result = processInput(state, 'stop');

      expect(result.gameOver).toBe(true);
      expect(result.message).toContain('My First Headline');
    });
  });

  describe('getSessionHeadlines', () => {
    it('should return empty array initially', () => {
      const state = createInitialState();
      expect(getSessionHeadlines(state)).toEqual([]);
    });

    it('should return all written headlines', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;

      // Write first headline
      state = processInput(state, 'First Headline').newState;
      state = processInput(state, 'First subheadline').newState;
      state = processInput(state, 'reflection').newState;

      // Write second headline
      state = processInput(state, 'yes').newState;
      state = processInput(state, 'future').newState;
      state = processInput(state, 'Second Headline').newState;
      state = processInput(state, 'skip').newState;

      const headlines = getSessionHeadlines(state);
      expect(headlines).toHaveLength(2);
      expect(headlines[0].text).toBe('First Headline');
      expect(headlines[1].text).toBe('Second Headline');
    });
  });

  describe('describeStateForVoice', () => {
    it('should describe current round and timeframe', () => {
      const state = createInitialState('today');
      const description = describeStateForVoice(state);

      expect(description).toContain('Headline Writer');
      expect(description).toContain('1');
      expect(description.toLowerCase()).toContain('today');
    });

    it('should describe completed state with headline count', () => {
      let state = createInitialState('today');
      state = getStartResult(state).newState;
      state = processInput(state, 'A Headline').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'reflection').newState;
      state = processInput(state, 'no').newState;

      const description = describeStateForVoice(state);
      expect(description).toContain('1');
      expect(description.toLowerCase()).toContain('headline');
    });
  });

  describe('timeframe variety', () => {
    const timeframes = ['today', 'this_week', 'this_month', 'this_year', 'past', 'future', 'dream'] as const;

    timeframes.forEach((timeframe) => {
      it(`should provide appropriate prompt for ${timeframe}`, () => {
        const state = createInitialState(timeframe);
        const result = getStartResult(state);

        // Each timeframe should have a non-empty prompt
        expect(result.message.length).toBeGreaterThan(20);
        expect(result.gameOver).toBe(false);
      });
    });
  });

  describe('game flow integration', () => {
    it('should complete multiple rounds', () => {
      let state = createInitialState('today');

      // Round 1
      state = getStartResult(state).newState;
      state = processInput(state, 'Breaking: Local Person Has Great Day').newState;
      state = processInput(state, 'Experts baffled by sudden outbreak of contentment').newState;
      state = processInput(state, 'It felt really good to write that').newState;

      expect(state.headlines).toHaveLength(1);
      expect(state.phase).toBe('another');

      // Round 2
      state = processInput(state, 'future').newState;
      state = processInput(state, 'Dreamer Achieves Impossible Goal').newState;
      state = processInput(state, 'skip').newState;
      state = processInput(state, 'The future looks bright').newState;

      expect(state.headlines).toHaveLength(2);

      // End game (use "no" or "done" - "I'm done" doesn't parse)
      const result = processInput(state, 'no');
      expect(result.gameOver).toBe(true);
      expect(result.message).toContain('Breaking: Local Person Has Great Day');
      expect(result.message).toContain('Dreamer Achieves Impossible Goal');
    });
  });
});
