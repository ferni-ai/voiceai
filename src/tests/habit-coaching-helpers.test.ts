/**
 * Habit Coaching Helpers Tests
 *
 * Tests for the helper functions used in habit coaching:
 * friction tips, setback detection, diagnosis, motivation, mood analysis.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  generateFrictionTips,
  detectSetbackPattern,
  diagnoseHabitFailure,
  getMotivationalContent,
  analyzeMoodPatterns,
  getEncouragement,
  getMoodBasedTip,
  getChallengeDayEncouragement,
  checkChallengeMilestones,
} from '../tools/habit-coaching/helpers.js';

import type { SetbackLog, MoodLog } from '../tools/habit-coaching/types.js';

// ============================================================================
// FRICTION TIPS TESTS
// ============================================================================

describe('generateFrictionTips', () => {
  it('should return phone-specific tips for scrolling habits', () => {
    const tips = generateFrictionTips('scrolling social media');

    expect(tips.length).toBeGreaterThan(0);
    expect(tips.some((t) => t.toLowerCase().includes('app'))).toBe(true);
  });

  it('should return phone tips for phone checking', () => {
    const tips = generateFrictionTips('checking my phone constantly');

    expect(tips).toContain('Charge phone in another room');
    expect(tips).toContain('Enable grayscale mode on phone');
  });

  it('should return snacking tips for eating habits', () => {
    const tips = generateFrictionTips('snacking late at night');

    expect(tips.length).toBeGreaterThan(0);
    expect(
      tips.some((t) => t.toLowerCase().includes('snack') || t.toLowerCase().includes('eat'))
    ).toBe(true);
  });

  it('should return snacking tips for junk food', () => {
    const tips = generateFrictionTips('eating junk food');

    expect(tips).toContain("Don't buy it - if it's not in the house, you can't eat it");
  });

  it('should return procrastination tips', () => {
    const tips = generateFrictionTips('procrastinating on work');

    expect(tips.length).toBeGreaterThan(0);
    expect(
      tips.some((t) => t.toLowerCase().includes('2-minute') || t.toLowerCase().includes('blocker'))
    ).toBe(true);
  });

  it('should return distraction tips', () => {
    const tips = generateFrictionTips('getting distracted easily');

    expect(tips).toContain('Put phone in another room');
  });

  it('should return generic tips for unknown habits', () => {
    const tips = generateFrictionTips('biting my nails');

    expect(tips.length).toBeGreaterThan(0);
    expect(tips).toContain('Add steps between you and the bad habit');
    expect(tips).toContain('Remove cues from your environment');
  });

  it('should be case-insensitive', () => {
    const tips1 = generateFrictionTips('PHONE checking');
    const tips2 = generateFrictionTips('phone CHECKING');

    expect(tips1).toEqual(tips2);
  });
});

// ============================================================================
// SETBACK PATTERN TESTS
// ============================================================================

describe('detectSetbackPattern', () => {
  it('should return null for less than 2 setbacks', () => {
    const setbacks: SetbackLog[] = [{ trigger: 'stress', date: new Date(), habitId: 'h1' }];

    expect(detectSetbackPattern(setbacks)).toBeNull();
  });

  it('should return null for empty array', () => {
    expect(detectSetbackPattern([])).toBeNull();
  });

  it('should detect stress/tiredness pattern', () => {
    const setbacks: SetbackLog[] = [
      { trigger: 'feeling stressed from work', date: new Date(), habitId: 'h1' },
      { trigger: 'tired after long day', date: new Date(), habitId: 'h1' },
      { trigger: 'stressed about deadline', date: new Date(), habitId: 'h1' },
    ];

    expect(detectSetbackPattern(setbacks)).toBe('stress or tiredness');
  });

  it('should detect weekend pattern', () => {
    const setbacks: SetbackLog[] = [
      { trigger: 'weekend relaxation mode', date: new Date(), habitId: 'h1' },
      { trigger: 'sunday laziness', date: new Date(), habitId: 'h1' },
      { trigger: 'saturday plans disrupted', date: new Date(), habitId: 'h1' },
    ];

    expect(detectSetbackPattern(setbacks)).toBe('weekends (less structure)');
  });

  it('should detect evening pattern', () => {
    const setbacks: SetbackLog[] = [
      { trigger: 'evening after dinner', date: new Date(), habitId: 'h1' },
      { trigger: 'late night tv', date: new Date(), habitId: 'h1' },
      { trigger: 'night time snacking', date: new Date(), habitId: 'h1' },
    ];

    expect(detectSetbackPattern(setbacks)).toBe('evenings (willpower depletion)');
  });

  it('should detect boredom/alone pattern', () => {
    const setbacks: SetbackLog[] = [
      { trigger: 'bored at home', date: new Date(), habitId: 'h1' },
      { trigger: 'alone with nothing to do', date: new Date(), habitId: 'h1' },
      { trigger: 'feeling bored', date: new Date(), habitId: 'h1' },
    ];

    expect(detectSetbackPattern(setbacks)).toBe('boredom or being alone');
  });

  it('should return null for mixed triggers', () => {
    const setbacks: SetbackLog[] = [
      { trigger: 'stressed', date: new Date(), habitId: 'h1' },
      { trigger: 'weekend', date: new Date(), habitId: 'h1' },
      { trigger: 'evening', date: new Date(), habitId: 'h1' },
      { trigger: 'bored', date: new Date(), habitId: 'h1' },
    ];

    expect(detectSetbackPattern(setbacks)).toBeNull();
  });
});

// ============================================================================
// HABIT DIAGNOSIS TESTS
// ============================================================================

describe('diagnoseHabitFailure', () => {
  it('should diagnose never_start correctly', () => {
    const diagnosis = diagnoseHabitFailure('never_start');

    expect(diagnosis.issue).toContain('too big');
    expect(diagnosis.fixes.length).toBeGreaterThan(0);
    expect(diagnosis.science).toBeDefined();
    expect(diagnosis.reframe).toBeDefined();
    expect(diagnosis.nextStep).toBeDefined();
  });

  it('should diagnose start_then_stop correctly', () => {
    const diagnosis = diagnoseHabitFailure('start_then_stop');

    expect(diagnosis.issue).toContain('reward');
    expect(diagnosis.fixes).toContain('Add an immediate reward after the habit');
  });

  it('should diagnose inconsistent correctly', () => {
    const diagnosis = diagnoseHabitFailure('inconsistent');

    expect(diagnosis.issue).toContain('cue');
    expect(diagnosis.fixes.some((f) => f.includes('habit stacking'))).toBe(true);
  });

  it('should personalize nextStep with currentCue for inconsistent', () => {
    const diagnosis = diagnoseHabitFailure('inconsistent', 'after breakfast');

    expect(diagnosis.nextStep).toContain('after breakfast');
  });

  it('should diagnose hate_it correctly', () => {
    const diagnosis = diagnoseHabitFailure('hate_it');

    expect(diagnosis.issue).toContain('values');
    expect(diagnosis.fixes).toContain('Find a version that matches your personality');
  });

  it('should diagnose forget correctly', () => {
    const diagnosis = diagnoseHabitFailure('forget');

    expect(diagnosis.issue).toContain('environmental');
    expect(diagnosis.fixes).toContain("Put visual reminders where you'll see them");
  });

  it('should fall back to inconsistent for unknown failure point', () => {
    // @ts-expect-error Testing invalid input
    const diagnosis = diagnoseHabitFailure('unknown_type');

    expect(diagnosis.issue).toContain('cue');
  });
});

// ============================================================================
// MOTIVATIONAL CONTENT TESTS
// ============================================================================

describe('getMotivationalContent', () => {
  it('should return content with required fields', () => {
    const content = getMotivationalContent('science_fact');

    expect(content.message).toBeDefined();
    expect(content.action).toBeDefined();
    expect(content.followUp).toBeDefined();
  });

  it('should include source for science facts', () => {
    // Run multiple times to check all options
    for (let i = 0; i < 10; i++) {
      const content = getMotivationalContent('science_fact');
      expect(content.source).toBeDefined();
    }
  });

  it('should return success_story content', () => {
    const content = getMotivationalContent('success_story');

    expect(content.message.length).toBeGreaterThan(50);
  });

  it('should return pep_talk content', () => {
    const content = getMotivationalContent('pep_talk');

    expect(content.message).toBeDefined();
    expect(content.followUp).toBeDefined();
  });

  it('should return reframe content', () => {
    const content = getMotivationalContent('reframe');

    expect(content.message).toBeDefined();
    expect(content.action).toBeDefined();
    // Both reframe options have action with "failure" or "starting"
    expect(content.action.includes('failure') || content.action.includes('Starting')).toBe(true);
  });

  it('should return why_reminder content', () => {
    const content = getMotivationalContent('why_reminder');

    expect(content.message).toContain('why');
  });

  it('should return future_self content', () => {
    const content = getMotivationalContent('future_self');

    expect(content.message).toBeDefined();
    expect(content.followUp).toBeDefined();
  });

  it('should personalize followUp with context', () => {
    const content = getMotivationalContent('pep_talk', 'exercise');

    expect(content.followUp.toLowerCase()).toContain('exercise');
  });

  it('should fall back to pep_talk for unknown type', () => {
    const content = getMotivationalContent('unknown_type');

    expect(content.message).toBeDefined();
    expect(content.followUp).toBeDefined();
  });
});

// ============================================================================
// MOOD ANALYSIS TESTS
// ============================================================================

describe('analyzeMoodPatterns', () => {
  it('should return empty results for less than 3 logs', () => {
    const logs: MoodLog[] = [
      { mood: 'good', timeOfDay: 'morning', date: new Date() },
      { mood: 'okay', timeOfDay: 'evening', date: new Date() },
    ];

    const result = analyzeMoodPatterns(logs);

    expect(result.insights).toEqual([]);
    expect(result.habitCorrelations).toEqual({});
  });

  it('should detect morning person pattern', () => {
    const logs: MoodLog[] = [
      { mood: 'great', timeOfDay: 'morning', date: new Date() },
      { mood: 'great', timeOfDay: 'morning', date: new Date() },
      { mood: 'low', timeOfDay: 'evening', date: new Date() },
      { mood: 'okay', timeOfDay: 'evening', date: new Date() },
    ];

    const result = analyzeMoodPatterns(logs);

    expect(result.insights.some((i) => i.includes('morning'))).toBe(true);
  });

  it('should detect evening person pattern', () => {
    const logs: MoodLog[] = [
      { mood: 'low', timeOfDay: 'morning', date: new Date() },
      { mood: 'okay', timeOfDay: 'morning', date: new Date() },
      { mood: 'great', timeOfDay: 'evening', date: new Date() },
      { mood: 'great', timeOfDay: 'evening', date: new Date() },
    ];

    const result = analyzeMoodPatterns(logs);

    expect(result.insights.some((i) => i.includes('improves'))).toBe(true);
  });

  it('should detect positive habit correlations', () => {
    const logs: MoodLog[] = [
      { mood: 'great', timeOfDay: 'morning', date: new Date(), habitsCompleted: ['exercise'] },
      { mood: 'great', timeOfDay: 'morning', date: new Date(), habitsCompleted: ['exercise'] },
      { mood: 'low', timeOfDay: 'morning', date: new Date(), habitsCompleted: [] },
      { mood: 'okay', timeOfDay: 'morning', date: new Date(), habitsCompleted: [] },
    ];

    const result = analyzeMoodPatterns(logs);

    expect(result.habitCorrelations['exercise']).toBe('positive');
    expect(result.insights.some((i) => i.includes('exercise'))).toBe(true);
  });

  it('should handle logs without habitsCompleted', () => {
    const logs: MoodLog[] = [
      { mood: 'good', timeOfDay: 'morning', date: new Date() },
      { mood: 'good', timeOfDay: 'morning', date: new Date() },
      { mood: 'good', timeOfDay: 'morning', date: new Date() },
    ];

    const result = analyzeMoodPatterns(logs);

    expect(result.habitCorrelations).toEqual({});
  });
});

// ============================================================================
// ENCOURAGEMENT TESTS
// ============================================================================

describe('getEncouragement', () => {
  it('should return fire message for high streak and wins', () => {
    const msg = getEncouragement(15, 4);

    expect(msg).toContain('fire');
  });

  it('should return momentum message for week+ streak', () => {
    const msg = getEncouragement(8, 1);

    expect(msg).toContain('momentum');
  });

  it('should return starting message for small streak', () => {
    const msg = getEncouragement(3, 0);

    expect(msg).toContain('streak starts at one');
  });

  it('should return beginning message for zero streak', () => {
    const msg = getEncouragement(0, 0);

    expect(msg).toContain('change begins');
  });
});

// ============================================================================
// MOOD-BASED TIPS TESTS
// ============================================================================

describe('getMoodBasedTip', () => {
  it('should return rest tip for depleted energy', () => {
    const tip = getMoodBasedTip('okay', 'depleted', 'morning');

    expect(tip).toContain('Low energy day');
    expect(tip).toContain('Rest');
  });

  it('should return rest tip for struggling mood', () => {
    const tip = getMoodBasedTip('struggling', 'normal', 'afternoon');

    expect(tip).toContain('Low energy day');
  });

  it('should return challenge tip for high energy and great mood', () => {
    const tip = getMoodBasedTip('great', 'high', 'morning');

    expect(tip).toContain('High energy');
    expect(tip).toContain('challenging');
  });

  it('should return energy-focused tip for low energy', () => {
    const tip = getMoodBasedTip('good', 'low', 'afternoon');

    expect(tip).toContain('Low energy');
    expect(tip).toContain('give you energy');
  });

  it('should return steady tip for normal state', () => {
    const tip = getMoodBasedTip('good', 'normal', 'morning');

    expect(tip).toContain('Steady state');
    expect(tip).toContain('consistency');
  });
});

// ============================================================================
// CHALLENGE DAY ENCOURAGEMENT TESTS
// ============================================================================

describe('getChallengeDayEncouragement', () => {
  it('should return special message for day 1', () => {
    const msg = getChallengeDayEncouragement(1);

    expect(msg).toContain('Day 1');
    expect(msg).toContain('hardest');
  });

  it('should return special message for day 7', () => {
    const msg = getChallengeDayEncouragement(7);

    expect(msg).toContain('ONE WEEK');
  });

  it('should return special message for day 14', () => {
    const msg = getChallengeDayEncouragement(14);

    expect(msg).toContain('Two weeks');
  });

  it('should return special message for day 21', () => {
    const msg = getChallengeDayEncouragement(21);

    expect(msg).toContain('THREE WEEKS');
    expect(msg).toContain('stick');
  });

  it('should return special message for day 30', () => {
    const msg = getChallengeDayEncouragement(30);

    expect(msg).toContain('30 DAYS');
    expect(msg).toContain('transformed');
  });

  it('should return week message for other week milestones', () => {
    const msg = getChallengeDayEncouragement(28);

    expect(msg).toContain('Week 4');
  });

  it('should return generic message for other days', () => {
    const msg = getChallengeDayEncouragement(5);

    expect(msg).toContain('vote');
  });
});

// ============================================================================
// CHALLENGE MILESTONES TESTS
// ============================================================================

describe('checkChallengeMilestones', () => {
  it('should return first week champion for day 7 with 5+ days', () => {
    const msg = checkChallengeMilestones(7, 5);

    expect(msg).toContain('First Week Champion');
  });

  it('should return null for day 7 with less than 5 days', () => {
    const msg = checkChallengeMilestones(7, 4);

    expect(msg).toBeNull();
  });

  it('should return two week warrior for day 14 with 10+ days', () => {
    const msg = checkChallengeMilestones(14, 10);

    expect(msg).toContain('Two Week Warrior');
  });

  it('should return three week titan for day 21 with 15+ days', () => {
    const msg = checkChallengeMilestones(21, 15);

    expect(msg).toContain('Three Week Titan');
  });

  it('should return 30-day master for day 30 with 25+ days', () => {
    const msg = checkChallengeMilestones(30, 25);

    expect(msg).toContain('30-Day Master');
  });

  it('should return 7-day streak message', () => {
    const msg = checkChallengeMilestones(10, 7);

    expect(msg).toContain('7-day completion streak');
  });

  it('should return 14-day streak message', () => {
    const msg = checkChallengeMilestones(20, 14);

    expect(msg).toContain('14-day completion streak');
  });

  it('should return 21-day streak message', () => {
    const msg = checkChallengeMilestones(25, 21);

    expect(msg).toContain('21-day streak');
    expect(msg).toContain('unstoppable');
  });

  it('should return null for no milestone', () => {
    const msg = checkChallengeMilestones(5, 3);

    expect(msg).toBeNull();
  });
});
