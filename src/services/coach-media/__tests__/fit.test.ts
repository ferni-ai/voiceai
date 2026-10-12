import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserPreferences = vi.fn();
vi.mock('../../user-preferences-store.js', () => ({ getUserPreferences }));

const { fitContext } = await import('../fit.js');

const pref = (category: string, value: string, day: number, extra: object = {}) => [
  `${category}:${value}`,
  { category, value, isActive: true, lastConfirmedAt: new Date(2026, 9, day), ...extra },
];

beforeEach(() => getUserPreferences.mockReset());

describe('fitContext', () => {
  it('joins what the model said with stored learning and wellness preferences, newest first', async () => {
    getUserPreferences.mockResolvedValue({
      preferences: new Map([
        pref('exercise_routine', 'morning runs', 3),
        pref('health_condition', 'asthma', 9),
        pref('learning_goal', 'run a 10k', 8),
        pref('coaching_media', 'long lectures', 5, { isNegative: true }),
        pref('music_genre', 'jazz', 10),
        pref('skill_building', 'old', 1, { isActive: false }),
      ] as never),
    });
    const fit = await fitContext('user-1', 'beginner, Seth has 10 minutes', ['Seth']);
    expect(fit).toBe('beginner, has 10 minutes; run a 10k; not long lectures; morning runs');
    expect(fit).not.toContain('asthma');
    expect(fit).not.toContain('jazz');
  });

  it('skips the store for an anonymous caller and survives a store failure', async () => {
    expect(await fitContext('anonymous', 'beginner', [])).toBe('beginner');
    expect(getUserPreferences).not.toHaveBeenCalled();
    getUserPreferences.mockRejectedValueOnce(new Error('firestore down'));
    expect(await fitContext('user-1', undefined, [])).toBe('');
  });
});
