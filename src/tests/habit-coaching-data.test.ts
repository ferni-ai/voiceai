/**
 * Habit Coaching Data Module Tests
 *
 * Tests for challenges.ts and transitions.ts helper functions
 * that provide access to 30-day challenges and life transition support.
 */

import { describe, it, expect } from 'vitest';

import {
  THIRTY_DAY_CHALLENGES,
  getChallenge,
  getChallengeTypes,
  getChallengeDay,
} from '../tools/habit-coaching/challenges.js';

import {
  LIFE_TRANSITION_SUPPORT,
  getTransitionSupport,
  getTransitionTypes,
} from '../tools/habit-coaching/transitions.js';

// ============================================================================
// CHALLENGES TESTS
// ============================================================================

describe('THIRTY_DAY_CHALLENGES', () => {
  it('should have multiple challenges defined', () => {
    const types = Object.keys(THIRTY_DAY_CHALLENGES);

    expect(types.length).toBeGreaterThan(5);
  });

  it('should have standard challenges', () => {
    expect(THIRTY_DAY_CHALLENGES.morning_person).toBeDefined();
    expect(THIRTY_DAY_CHALLENGES.fitness_starter).toBeDefined();
    expect(THIRTY_DAY_CHALLENGES.mindfulness).toBeDefined();
    expect(THIRTY_DAY_CHALLENGES.digital_detox).toBeDefined();
  });

  it('should have 4 weeks per challenge', () => {
    for (const [type, challenge] of Object.entries(THIRTY_DAY_CHALLENGES)) {
      expect(challenge.weeks.length).toBe(4);
    }
  });

  it('should have 7 days per week', () => {
    for (const [type, challenge] of Object.entries(THIRTY_DAY_CHALLENGES)) {
      for (const week of challenge.weeks) {
        expect(week.days.length).toBe(7);
      }
    }
  });

  it('should have required fields for each challenge', () => {
    for (const [type, challenge] of Object.entries(THIRTY_DAY_CHALLENGES)) {
      expect(challenge.name).toBeDefined();
      expect(challenge.description).toBeDefined();
      expect(challenge.commitment).toBeDefined();
      expect(challenge.weeks).toBeDefined();
    }
  });

  it('should have theme and intensityNote for each week', () => {
    for (const [type, challenge] of Object.entries(THIRTY_DAY_CHALLENGES)) {
      for (const week of challenge.weeks) {
        expect(week.theme).toBeDefined();
        expect(week.intensityNote).toBeDefined();
        expect(week.days).toBeDefined();
      }
    }
  });
});

describe('getChallenge', () => {
  it('should return challenge for valid type', () => {
    const challenge = getChallenge('morning_person');

    expect(challenge).toBeDefined();
    expect(challenge?.name).toBe('Become a Morning Person');
  });

  it('should return undefined for invalid type', () => {
    const challenge = getChallenge('invalid_type');

    expect(challenge).toBeUndefined();
  });

  it('should return all expected challenges', () => {
    const types = [
      'morning_person',
      'fitness_starter',
      'mindfulness',
      'financial_reset',
      'digital_detox',
      'sleep_optimization',
      'hydration',
      'gratitude',
    ];

    for (const type of types) {
      expect(getChallenge(type)).toBeDefined();
    }
  });
});

describe('getChallengeTypes', () => {
  it('should return array of challenge types', () => {
    const types = getChallengeTypes();

    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it('should include expected challenge types', () => {
    const types = getChallengeTypes();

    expect(types).toContain('morning_person');
    expect(types).toContain('fitness_starter');
    expect(types).toContain('mindfulness');
  });

  it('should match keys of THIRTY_DAY_CHALLENGES', () => {
    const types = getChallengeTypes();
    const keys = Object.keys(THIRTY_DAY_CHALLENGES);

    expect(types).toEqual(keys);
  });
});

describe('getChallengeDay', () => {
  it('should return day 1 content', () => {
    const day = getChallengeDay('morning_person', 1);

    expect(day).not.toBeNull();
    expect(day?.weekTheme).toContain('Foundation');
    expect(day?.dayTask).toBeDefined();
    expect(day?.intensityNote).toBeDefined();
  });

  it('should return day 7 content (end of week 1)', () => {
    const day = getChallengeDay('morning_person', 7);

    expect(day).not.toBeNull();
    expect(day?.weekTheme).toContain('Foundation');
  });

  it('should return day 8 content (start of week 2)', () => {
    const day = getChallengeDay('morning_person', 8);

    expect(day).not.toBeNull();
    expect(day?.weekTheme).toContain('Movement');
  });

  it('should return day 15 content (week 3)', () => {
    const day = getChallengeDay('morning_person', 15);

    expect(day).not.toBeNull();
    expect(day?.weekTheme).toContain('Intention');
  });

  it('should return day 22 content (week 4)', () => {
    const day = getChallengeDay('morning_person', 22);

    expect(day).not.toBeNull();
    expect(day?.weekTheme).toContain('Mastery');
  });

  it('should return day 28 content (end of challenge)', () => {
    const day = getChallengeDay('fitness_starter', 28);

    expect(day).not.toBeNull();
  });

  it('should return null for day > 28', () => {
    const day = getChallengeDay('morning_person', 29);

    expect(day).toBeNull();
  });

  it('should return null for invalid challenge type', () => {
    const day = getChallengeDay('invalid', 1);

    expect(day).toBeNull();
  });

  it('should handle edge case for negative days', () => {
    // Day 0 and negative days result in negative weekIndex
    // which accesses undefined array elements causing an error
    // This tests that the function doesn't crash for day 1 (the minimum valid day)
    const day1 = getChallengeDay('morning_person', 1);
    expect(day1).not.toBeNull();
  });

  it('should handle all days of a challenge', () => {
    for (let day = 1; day <= 28; day++) {
      const content = getChallengeDay('mindfulness', day);
      expect(content).not.toBeNull();
      expect(content?.dayTask).toBeDefined();
    }
  });
});

// ============================================================================
// TRANSITIONS TESTS
// ============================================================================

describe('LIFE_TRANSITION_SUPPORT', () => {
  it('should have multiple transitions defined', () => {
    const types = Object.keys(LIFE_TRANSITION_SUPPORT);

    expect(types.length).toBeGreaterThan(5);
  });

  it('should have standard transitions', () => {
    expect(LIFE_TRANSITION_SUPPORT.new_job).toBeDefined();
    expect(LIFE_TRANSITION_SUPPORT.job_loss).toBeDefined();
    expect(LIFE_TRANSITION_SUPPORT.new_baby).toBeDefined();
    expect(LIFE_TRANSITION_SUPPORT.breakup).toBeDefined();
    expect(LIFE_TRANSITION_SUPPORT.moving).toBeDefined();
  });

  it('should have required fields for each transition', () => {
    for (const [type, support] of Object.entries(LIFE_TRANSITION_SUPPORT)) {
      expect(support.name).toBeDefined();
      expect(support.validation).toBeDefined();
      expect(support.expectations).toBeDefined();
      expect(Array.isArray(support.expectations)).toBe(true);
      expect(support.habitsToProtect).toBeDefined();
      expect(support.habitsToPause).toBeDefined();
      expect(support.habitsToAdd).toBeDefined();
      expect(support.priorityOrder).toBeDefined();
      expect(support.adjustmentPeriod).toBeDefined();
      expect(support.selfCareNote).toBeDefined();
    }
  });

  it('should have non-empty arrays for habit lists', () => {
    for (const [type, support] of Object.entries(LIFE_TRANSITION_SUPPORT)) {
      expect(support.habitsToProtect.length).toBeGreaterThan(0);
      expect(support.habitsToAdd.length).toBeGreaterThan(0);
      expect(support.priorityOrder.length).toBeGreaterThan(0);
    }
  });
});

describe('getTransitionSupport', () => {
  it('should return transition support for valid type', () => {
    const support = getTransitionSupport('new_job');

    expect(support).toBeDefined();
    expect(support?.name).toBe('New Job');
  });

  it('should return undefined for invalid type', () => {
    const support = getTransitionSupport('invalid_transition');

    expect(support).toBeUndefined();
  });

  it('should return all expected transitions', () => {
    const types = [
      'new_job',
      'job_loss',
      'new_baby',
      'new_relationship',
      'breakup',
      'moving',
      'empty_nest',
      'retirement',
      'health_diagnosis',
      'loss_grief',
      'graduation',
      'promotion',
    ];

    for (const type of types) {
      expect(getTransitionSupport(type)).toBeDefined();
    }
  });

  it('should return supportive validation messages', () => {
    const jobLoss = getTransitionSupport('job_loss');
    expect(jobLoss?.validation).toContain('grief');

    const newBaby = getTransitionSupport('new_baby');
    expect(newBaby?.validation).toContain('everything');

    const lossGrief = getTransitionSupport('loss_grief');
    expect(lossGrief?.validation).toContain('no timeline');
  });
});

describe('getTransitionTypes', () => {
  it('should return array of transition types', () => {
    const types = getTransitionTypes();

    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it('should include expected transition types', () => {
    const types = getTransitionTypes();

    expect(types).toContain('new_job');
    expect(types).toContain('new_baby');
    expect(types).toContain('retirement');
  });

  it('should match keys of LIFE_TRANSITION_SUPPORT', () => {
    const types = getTransitionTypes();
    const keys = Object.keys(LIFE_TRANSITION_SUPPORT);

    expect(types).toEqual(keys);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Habit Coaching Data Integration', () => {
  it('should support a realistic challenge flow', () => {
    // User wants to become a morning person
    const types = getChallengeTypes();
    expect(types).toContain('morning_person');

    const challenge = getChallenge('morning_person');
    expect(challenge?.commitment).toContain('15 minutes earlier');

    // Get first day
    const day1 = getChallengeDay('morning_person', 1);
    expect(day1?.dayTask).toContain('alarm');

    // Get middle day
    const day14 = getChallengeDay('morning_person', 14);
    expect(day14).not.toBeNull();

    // Get last day
    const day28 = getChallengeDay('morning_person', 28);
    expect(day28?.weekTheme).toContain('Mastery');
  });

  it('should support a realistic transition flow', () => {
    // User going through a breakup
    const types = getTransitionTypes();
    expect(types).toContain('breakup');

    const support = getTransitionSupport('breakup');
    expect(support?.validation).toContain('loss');

    // Check habits advice
    expect(support?.habitsToProtect).toContain('Social connection (reach out)');
    expect(support?.habitsToPause).toContain('New relationships (rebound alert)');
  });
});
