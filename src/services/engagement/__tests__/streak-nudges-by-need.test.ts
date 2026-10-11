/**
 * TEAM_BY_NEED=on: no "don't break your streak" nudges (product decision, 2026-10-11):
 * not the spoken streak alert, not Maya's streak-at-risk SMS, not the proactive
 * streak_at_risk trigger. Off: all three as before. Other engagement copy is untouched.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import MayaNotificationService from '../engagement-notification-service.js';
import { MemoryEngagementEngine } from '../../../intelligence/tracking/memory-engagement.js';
import { detectProactiveTriggers } from '../../../tools/domains/proactive/coaching/proactive-coaching.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const byNeed = (on: boolean) => vi.stubEnv('TEAM_BY_NEED', on ? 'on' : '');

describe('streak nudges', () => {
  it('the spoken streak-at-risk alert', () => {
    const engine = new MemoryEngagementEngine();
    byNeed(false);
    expect(engine.generateStreakAlert('meditation', 9)).toMatch(/streak/);
    byNeed(true);
    expect(engine.generateStreakAlert('meditation', 9)).toBe('');
  });

  it("Maya's streak-at-risk SMS", async () => {
    vi.useFakeTimers();
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    vi.setSystemTime(morning);
    const service = new MayaNotificationService();
    const schedule = vi.spyOn(service, 'scheduleNotification').mockResolvedValue('n1');

    byNeed(false);
    await service.scheduleStreakAlert('u1', 'h1', 'meditate', 9);
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ type: 'streak_at_risk' }));

    schedule.mockClear();
    byNeed(true);
    await service.scheduleStreakAlert('u1', 'h1', 'meditate', 9);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('the proactive streak_at_risk trigger', () => {
    const context = {
      userId: 'u1',
      activeHabits: [
        {
          id: 'h1',
          name: 'meditate',
          currentStreak: 9,
          lastCompletion: new Date(Date.now() - 22 * 60 * 60 * 1000),
          level: 1,
          successRate: 0.9,
        },
      ],
      recentMoods: [],
      weeklyReflectionsDue: false,
    } as unknown as Parameters<typeof detectProactiveTriggers>[0];
    const streakTriggers = () =>
      detectProactiveTriggers(context).filter((t) => t.type === 'streak_at_risk');

    byNeed(false);
    expect(streakTriggers()).toHaveLength(1);
    byNeed(true);
    expect(streakTriggers()).toHaveLength(0);
  });
});
