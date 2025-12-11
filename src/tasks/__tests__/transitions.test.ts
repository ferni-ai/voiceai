/**
 * Transitions Tests
 *
 * Tests for natural conversation transitions:
 * - Transition phrase selection
 * - Contextual transitions
 * - Wrap with transitions helper
 */

import { describe, expect, it } from 'vitest';
import {
  EMOTIONAL_TRANSITIONS,
  TASK_TRANSITIONS,
  TOPIC_ENTRY_TRANSITIONS,
  TOPIC_EXIT_TRANSITIONS,
  getContextualTransition,
  getTransition,
  isValidTransitionKey,
  wrapWithTransitions,
  type TransitionKey,
} from '../transitions.js';

describe('Transition Constants', () => {
  describe('TOPIC_ENTRY_TRANSITIONS', () => {
    it('should have gentle transitions', () => {
      expect(TOPIC_ENTRY_TRANSITIONS.gentle).toBeDefined();
      expect(TOPIC_ENTRY_TRANSITIONS.gentle.length).toBeGreaterThan(0);
    });

    it('should have curious transitions', () => {
      expect(TOPIC_ENTRY_TRANSITIONS.curious).toBeDefined();
      expect(TOPIC_ENTRY_TRANSITIONS.curious.length).toBeGreaterThan(0);
    });

    it('should have important transitions', () => {
      expect(TOPIC_ENTRY_TRANSITIONS.important).toBeDefined();
      expect(TOPIC_ENTRY_TRANSITIONS.important.length).toBeGreaterThan(0);
    });

    it('should have returning transitions', () => {
      expect(TOPIC_ENTRY_TRANSITIONS.returning).toBeDefined();
      expect(TOPIC_ENTRY_TRANSITIONS.returning.length).toBeGreaterThan(0);
    });

    it('should have story transitions', () => {
      expect(TOPIC_ENTRY_TRANSITIONS.story).toBeDefined();
      expect(TOPIC_ENTRY_TRANSITIONS.story.length).toBeGreaterThan(0);
    });
  });

  describe('TOPIC_EXIT_TRANSITIONS', () => {
    it('should have wrapUp transitions', () => {
      expect(TOPIC_EXIT_TRANSITIONS.wrapUp).toBeDefined();
      expect(TOPIC_EXIT_TRANSITIONS.wrapUp.length).toBeGreaterThan(0);
    });

    it('should have checkIn transitions', () => {
      expect(TOPIC_EXIT_TRANSITIONS.checkIn).toBeDefined();
      expect(TOPIC_EXIT_TRANSITIONS.checkIn.length).toBeGreaterThan(0);
    });

    it('should have moveOn transitions', () => {
      expect(TOPIC_EXIT_TRANSITIONS.moveOn).toBeDefined();
      expect(TOPIC_EXIT_TRANSITIONS.moveOn.length).toBeGreaterThan(0);
    });

    it('should have openEnded transitions', () => {
      expect(TOPIC_EXIT_TRANSITIONS.openEnded).toBeDefined();
      expect(TOPIC_EXIT_TRANSITIONS.openEnded.length).toBeGreaterThan(0);
    });
  });

  describe('EMOTIONAL_TRANSITIONS', () => {
    it('should have lightToSerious transitions', () => {
      expect(EMOTIONAL_TRANSITIONS.lightToSerious).toBeDefined();
      expect(EMOTIONAL_TRANSITIONS.lightToSerious.length).toBeGreaterThan(0);
    });

    it('should have seriousToLight transitions', () => {
      expect(EMOTIONAL_TRANSITIONS.seriousToLight).toBeDefined();
      expect(EMOTIONAL_TRANSITIONS.seriousToLight.length).toBeGreaterThan(0);
    });

    it('should have supportToPractical transitions', () => {
      expect(EMOTIONAL_TRANSITIONS.supportToPractical).toBeDefined();
      expect(EMOTIONAL_TRANSITIONS.supportToPractical.length).toBeGreaterThan(0);
    });

    it('should have practicalToSupport transitions', () => {
      expect(EMOTIONAL_TRANSITIONS.practicalToSupport).toBeDefined();
      expect(EMOTIONAL_TRANSITIONS.practicalToSupport.length).toBeGreaterThan(0);
    });
  });

  describe('TASK_TRANSITIONS', () => {
    it('should have toGoals transitions', () => {
      expect(TASK_TRANSITIONS.toGoals).toBeDefined();
      expect(TASK_TRANSITIONS.toGoals.length).toBeGreaterThan(0);
    });

    it('should have toWisdom transitions', () => {
      expect(TASK_TRANSITIONS.toWisdom).toBeDefined();
      expect(TASK_TRANSITIONS.toWisdom.length).toBeGreaterThan(0);
    });

    it('should have toFear transitions', () => {
      expect(TASK_TRANSITIONS.toFear).toBeDefined();
      expect(TASK_TRANSITIONS.toFear.length).toBeGreaterThan(0);
    });

    it('should have toCelebration transitions', () => {
      expect(TASK_TRANSITIONS.toCelebration).toBeDefined();
      expect(TASK_TRANSITIONS.toCelebration.length).toBeGreaterThan(0);
    });

    it('should have toGoodbye transitions', () => {
      expect(TASK_TRANSITIONS.toGoodbye).toBeDefined();
      expect(TASK_TRANSITIONS.toGoodbye.length).toBeGreaterThan(0);
    });
  });
});

describe('isValidTransitionKey', () => {
  it('should return true for valid topic entry keys', () => {
    expect(isValidTransitionKey('gentle')).toBe(true);
    expect(isValidTransitionKey('curious')).toBe(true);
    expect(isValidTransitionKey('important')).toBe(true);
    expect(isValidTransitionKey('returning')).toBe(true);
    expect(isValidTransitionKey('story')).toBe(true);
  });

  it('should return true for valid topic exit keys', () => {
    expect(isValidTransitionKey('wrapUp')).toBe(true);
    expect(isValidTransitionKey('checkIn')).toBe(true);
    expect(isValidTransitionKey('moveOn')).toBe(true);
    expect(isValidTransitionKey('openEnded')).toBe(true);
  });

  it('should return true for valid emotional transition keys', () => {
    expect(isValidTransitionKey('lightToSerious')).toBe(true);
    expect(isValidTransitionKey('seriousToLight')).toBe(true);
    expect(isValidTransitionKey('supportToPractical')).toBe(true);
    expect(isValidTransitionKey('practicalToSupport')).toBe(true);
  });

  it('should return true for valid task transition keys', () => {
    expect(isValidTransitionKey('toGoals')).toBe(true);
    expect(isValidTransitionKey('toWisdom')).toBe(true);
    expect(isValidTransitionKey('toFear')).toBe(true);
    expect(isValidTransitionKey('toCelebration')).toBe(true);
    expect(isValidTransitionKey('toGoodbye')).toBe(true);
  });

  it('should return false for invalid keys', () => {
    expect(isValidTransitionKey('invalid')).toBe(false);
    expect(isValidTransitionKey('notAKey')).toBe(false);
    expect(isValidTransitionKey('')).toBe(false);
    expect(isValidTransitionKey('toNonExistent')).toBe(false);
  });
});

describe('getTransition', () => {
  it('should return a string from the specified category', () => {
    const transition = getTransition('gentle');
    expect(typeof transition).toBe('string');
    expect(TOPIC_ENTRY_TRANSITIONS.gentle).toContain(transition);
  });

  it('should return random transitions over multiple calls', () => {
    const results = new Set<string>();

    // Call multiple times - should eventually get different results
    for (let i = 0; i < 50; i++) {
      results.add(getTransition('gentle'));
    }

    // With 6+ options, should get at least 2 different ones
    expect(results.size).toBeGreaterThan(1);
  });

  it('should work with topic exit transitions', () => {
    const transition = getTransition('wrapUp');
    expect(TOPIC_EXIT_TRANSITIONS.wrapUp).toContain(transition);
  });

  it('should work with emotional transitions', () => {
    const transition = getTransition('lightToSerious');
    expect(EMOTIONAL_TRANSITIONS.lightToSerious).toContain(transition);
  });

  it('should work with task transitions', () => {
    const transition = getTransition('toGoals');
    expect(TASK_TRANSITIONS.toGoals).toContain(transition);
  });

  it('should return fallback for invalid key', () => {
    // Type assertion needed since we're testing invalid input
    const transition = getTransition('invalidKey' as TransitionKey);
    expect(transition).toBe('Anyway...');
  });
});

describe('getContextualTransition', () => {
  it('should return mood transition when moving between moods', () => {
    const transition = getContextualTransition({
      fromMood: 'light',
      toMood: 'serious',
    });

    expect(typeof transition).toBe('string');
    // Should be from lightToSerious category
    expect(EMOTIONAL_TRANSITIONS.lightToSerious).toContain(transition);
  });

  it('should return task transition when going to specific task', () => {
    const transition = getContextualTransition({
      toTask: 'goals',
    });

    expect(TASK_TRANSITIONS.toGoals).toContain(transition);
  });

  it('should handle celebration task', () => {
    const transition = getContextualTransition({
      toTask: 'celebration',
    });

    expect(TASK_TRANSITIONS.toCelebration).toContain(transition);
  });

  it('should handle goodbye task', () => {
    const transition = getContextualTransition({
      toTask: 'goodbye',
    });

    expect(TASK_TRANSITIONS.toGoodbye).toContain(transition);
  });

  it('should include topic when returning to it', () => {
    const transition = getContextualTransition({
      topicMentioned: 'your career goals',
    });

    expect(transition).toContain('your career goals');
  });

  it('should return gentle transition as default', () => {
    const transition = getContextualTransition({});

    expect(TOPIC_ENTRY_TRANSITIONS.gentle).toContain(transition);
  });

  it('should not apply mood transition when moods are the same', () => {
    // When from and to mood are the same, should fall through to default
    const transition = getContextualTransition({
      fromMood: 'light',
      toMood: 'light',
    });

    // Should get gentle default, not mood transition
    expect(TOPIC_ENTRY_TRANSITIONS.gentle).toContain(transition);
  });

  it('should prioritize mood transition over task transition', () => {
    // Mood takes precedence
    const transition = getContextualTransition({
      fromMood: 'serious',
      toMood: 'light',
      toTask: 'goals',
    });

    expect(EMOTIONAL_TRANSITIONS.seriousToLight).toContain(transition);
  });
});

describe('wrapWithTransitions', () => {
  it('should add entry transition before message', () => {
    const result = wrapWithTransitions('This is my message', {
      entry: 'gentle',
    });

    // Should start with a gentle transition phrase
    const startsWithGentleTransition = TOPIC_ENTRY_TRANSITIONS.gentle.some((phrase) =>
      result.startsWith(phrase)
    );
    expect(startsWithGentleTransition).toBe(true);
    expect(result).toContain('This is my message');
  });

  it('should add exit transition after message', () => {
    const result = wrapWithTransitions('This is my message', {
      exit: 'checkIn',
    });

    // Should end with a checkIn transition phrase
    const endsWithCheckInTransition = TOPIC_EXIT_TRANSITIONS.checkIn.some((phrase) =>
      result.endsWith(phrase)
    );
    expect(endsWithCheckInTransition).toBe(true);
    expect(result).toContain('This is my message');
  });

  it('should add both entry and exit transitions', () => {
    const result = wrapWithTransitions('Middle content', {
      entry: 'story',
      exit: 'wrapUp',
    });

    const hasEntryTransition = TOPIC_ENTRY_TRANSITIONS.story.some((phrase) =>
      result.includes(phrase)
    );
    const hasExitTransition = TOPIC_EXIT_TRANSITIONS.wrapUp.some((phrase) =>
      result.includes(phrase)
    );

    expect(hasEntryTransition).toBe(true);
    expect(hasExitTransition).toBe(true);
    expect(result).toContain('Middle content');
  });

  it('should return original message when no options provided', () => {
    const result = wrapWithTransitions('Original message');
    expect(result).toBe('Original message');
  });

  it('should return original message when options are empty', () => {
    const result = wrapWithTransitions('Original message', {});
    expect(result).toBe('Original message');
  });

  it('should handle only entry transition', () => {
    const result = wrapWithTransitions('Content', { entry: 'curious' });

    expect(result).toContain('Content');
    const hasEntry = TOPIC_ENTRY_TRANSITIONS.curious.some((p) => result.includes(p));
    expect(hasEntry).toBe(true);
  });

  it('should handle only exit transition', () => {
    const result = wrapWithTransitions('Content', { exit: 'moveOn' });

    expect(result).toContain('Content');
    const hasExit = TOPIC_EXIT_TRANSITIONS.moveOn.some((p) => result.includes(p));
    expect(hasExit).toBe(true);
  });
});

describe('Transition Phrase Quality', () => {
  it('all gentle transitions should sound conversational', () => {
    for (const phrase of TOPIC_ENTRY_TRANSITIONS.gentle) {
      // Should not be formal or robotic
      expect(phrase).not.toMatch(/^TASK:|^STEP:|^PHASE:/);
      expect(phrase).not.toMatch(/^Now beginning/);
      expect(phrase).not.toMatch(/^Initiating/);
    }
  });

  it('all exit transitions should feel natural', () => {
    for (const phrase of TOPIC_EXIT_TRANSITIONS.wrapUp) {
      expect(phrase).not.toMatch(/^Task complete/);
      expect(phrase).not.toMatch(/^End of/);
    }
  });

  it('emotional transitions should be empathetic', () => {
    for (const phrase of EMOTIONAL_TRANSITIONS.supportToPractical) {
      // Should acknowledge the user's pace
      expect(phrase.toLowerCase()).not.toMatch(/^now let's|^we must/);
    }
  });

  it('task transitions should be inviting, not demanding', () => {
    for (const phrase of TASK_TRANSITIONS.toGoals) {
      expect(phrase).not.toMatch(/^You must|^You should/);
    }
  });
});
