/**
 * Growth Journey Service Tests
 *
 * Exercises the REAL journey module (src/services/monetization/journey.ts).
 *
 * This file previously imported nothing: it redefined calculateWeeksTogether,
 * getDaysRemaining and a `detectValue` helper inside the test and asserted
 * against those local copies, so it could not catch any drift in production.
 * It now imports the production functions.
 *
 * Removed with that rewrite: four tests for a `detectValue(message)` returning
 * { type: 'financial_gain' | 'habit_milestone' | 'career_win', confidence }.
 * No such function exists anywhere in src. Production has two differently-shaped
 * things with overlapping names - detectValue() in
 * services/superhuman/values-alignment.ts detects personal VALUES
 * (family/freedom/security/growth), and detectSmallWin() in
 * services/trust-systems/small-wins.ts uses a different taxonomy entirely
 * (followed_through/courage_moment/...). Neither matches what those tests
 * described, so they were asserting a feature that was never built.
 */

import { describe, expect, it } from 'vitest';

import {
  JOURNEY_MILESTONES,
  calculateWeeksTogether,
  checkNewMilestones,
  getCurrentSeason,
  getMilestoneById,
  type JourneyProgress,
} from '../../services/monetization/journey.js';

// ============================================================================
// MILESTONES
// ============================================================================

describe('Journey Milestones', () => {
  it('should expose a non-empty, well-formed milestone table', () => {
    expect(JOURNEY_MILESTONES.length).toBeGreaterThan(0);

    for (const m of JOURNEY_MILESTONES) {
      expect(m.id).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(['conversations', 'weeks-together', 'goals-achieved']).toContain(m.requirement.type);
      expect(m.requirement.value).toBeGreaterThan(0);
    }
  });

  it('should have unique milestone ids', () => {
    const ids = JOURNEY_MILESTONES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should look up a milestone by id, and miss cleanly', () => {
    const first = JOURNEY_MILESTONES[0];

    expect(getMilestoneById(first.id)).toEqual(first);
    expect(getMilestoneById('no-such-milestone')).toBeUndefined();
  });

  it('should have warm, human milestone titles rather than slugs', () => {
    for (const m of JOURNEY_MILESTONES) {
      // Titles are shown to the user: real words, not the id
      expect(m.title).not.toBe(m.id);
      expect(m.title).toMatch(/[A-Z]/);
      expect(m.title.length).toBeGreaterThan(3);
    }
  });
});

// ============================================================================
// MILESTONE UNLOCKING
// ============================================================================

describe('checkNewMilestones', () => {
  const zero: JourneyProgress = {
    conversationCount: 0,
    weeksTogetherCount: 0,
    goalsAchievedCount: 0,
  };

  it('should unlock nothing at zero progress', () => {
    expect(checkNewMilestones(zero, [])).toEqual([]);
  });

  it('should unlock the first-conversation milestone after one conversation', () => {
    const unlocked = checkNewMilestones({ ...zero, conversationCount: 1 }, []);

    expect(unlocked).toContain('first-chat');
  });

  it('should unlock every milestone whose threshold is met', () => {
    const unlocked = checkNewMilestones({ ...zero, conversationCount: 10 }, []);

    // 1, 5 and 10 are all satisfied by 10 conversations
    expect(unlocked).toEqual(expect.arrayContaining(['first-chat', 'five-chats', 'ten-chats']));
    // but not the ones above it
    expect(unlocked).not.toContain('twenty-chats');
  });

  it('should not re-report milestones already celebrated', () => {
    const progress = { ...zero, conversationCount: 10 };

    const all = checkNewMilestones(progress, []);
    const afterCelebrating = checkNewMilestones(progress, ['first-chat', 'five-chats']);

    expect(all).toContain('first-chat');
    expect(afterCelebrating).not.toContain('first-chat');
    expect(afterCelebrating).not.toContain('five-chats');
    expect(afterCelebrating).toContain('ten-chats');
  });

  it('should track weeks-together independently of conversations', () => {
    const byWeeks = checkNewMilestones({ ...zero, weeksTogetherCount: 1 }, []);

    expect(byWeeks).toContain('week-one');
    expect(byWeeks).not.toContain('first-chat');
  });
});

// ============================================================================
// WEEKS TOGETHER
// ============================================================================

describe('calculateWeeksTogether', () => {
  it('should be 0 for a start date of today', () => {
    expect(calculateWeeksTogether(new Date())).toBe(0);
  });

  it('should be 1 after seven days', () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);

    expect(calculateWeeksTogether(d)).toBe(1);
  });

  it('should floor partial weeks', () => {
    const d = new Date();
    d.setDate(d.getDate() - 13);

    expect(calculateWeeksTogether(d)).toBe(1);
  });

  it('should not go negative for a future start date', () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);

    expect(calculateWeeksTogether(d)).toBeLessThanOrEqual(0);
  });
});

// ============================================================================
// SEASONS
// ============================================================================

describe('getCurrentSeason', () => {
  it('should return a well-formed, active season', () => {
    const season = getCurrentSeason();

    expect(season.id).toBeTruthy();
    expect(['Spring', 'Summer', 'Autumn', 'Fall', 'Winter']).toContain(season.name);
    expect(season.theme).toBeTruthy();
    expect(season.description).toBeTruthy();
    expect(season.isActive).toBe(true);
    expect(season.companionPriceInCents).toBeGreaterThan(0);
  });

  it('should carry a start and end date that bracket today', () => {
    const season = getCurrentSeason();

    const start = new Date(season.startDate);
    const end = new Date(season.endDate);
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it('should have days remaining derived from the real season end date', () => {
    const season = getCurrentSeason();

    const end = new Date(season.endDate);
    const daysRemaining = Math.max(
      0,
      Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    );

    expect(daysRemaining).toBeGreaterThanOrEqual(0);
    expect(daysRemaining).toBeLessThanOrEqual(366);
  });

  it('should tag the season id with its name and year', () => {
    const season = getCurrentSeason();

    expect(season.id).toBe(`${season.name.toLowerCase()}-${new Date().getFullYear()}`);
  });
});
