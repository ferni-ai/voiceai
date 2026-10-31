/**
 * One count of "sessions together" reaches the prompt.
 *
 * Before: three counts reached one prompt for the same user (profile 21,
 * relationship engine 17, conversation docs 30). The session's profile now
 * carries the sessions-together count, read from the stored calls.
 */

import { describe, expect, it, vi } from 'vitest';
import { neverLowerSessionCount, withSessionsTogether } from '../sessions-together-profile.js';
import { summarizeSessions } from '../../stores/sessions-together.js';

const DAY = 24 * 60 * 60 * 1000;
const call = (daysAgo: number, extra: Record<string, unknown> = {}) => {
  const start = Date.now() - daysAgo * DAY;
  return { startedAt: new Date(start), endedAt: new Date(start + 600_000), turnCount: 8, ...extra };
};

describe('withSessionsTogether', () => {
  it.each([
    { name: 'n=1 counted, stored 21', calls: [call(1)], stored: 21, expected: 1 },
    {
      name: 'n=3 counted (a greeting-only call is not one), stored 21',
      calls: [call(1), call(2), call(3), call(4, { turnCount: 1 })],
      stored: 21,
      expected: 3,
    },
    // Never turn a returning user into a first-timer on a count of 0
    { name: 'n=0 counted, stored 21', calls: [], stored: 21, expected: 21 },
  ])('$name: totalConversations $expected', async ({ calls, stored, expected }) => {
    const read = vi.fn(async () => summarizeSessions(calls));
    const profile = await withSessionsTogether('u1', { totalConversations: stored }, read);
    expect(profile?.totalConversations).toBe(expected);
  });

  it('keeps the stored counter when the read fails or is slow', async () => {
    const failing = vi.fn(async () => {
      throw new Error('Firestore unavailable');
    });
    expect(
      (await withSessionsTogether('u1', { totalConversations: 7 }, failing))?.totalConversations
    ).toBe(7);

    vi.useFakeTimers();
    try {
      const slow = vi.fn(() => new Promise<never>(() => {}));
      const pending = withSessionsTogether('u1', { totalConversations: 7 }, slow);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending)?.totalConversations).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a missing profile through', async () => {
    expect(await withSessionsTogether('u1', null, vi.fn())).toBeNull();
  });
});

describe('neverLowerSessionCount (the end-of-session save)', () => {
  it.each([
    { name: 'counted 3 then +1, stored 21', stored: 21, counted: 3, saved: 21 },
    { name: 'counted 30 then +1, stored 21', stored: 21, counted: 30, saved: 31 },
  ])('$name: saves $saved', async ({ stored, counted, saved }) => {
    const userId = `save-${stored}-${counted}`;
    const read = vi.fn(async () => ({ ...summarizeSessions([]), count: counted }));
    const profile = await withSessionsTogether(userId, { totalConversations: stored }, read);
    const afterSession = { totalConversations: profile!.totalConversations + 1 };
    neverLowerSessionCount(userId, afterSession);
    expect(afterSession.totalConversations).toBe(saved);
  });

  it('leaves a profile alone when nothing was replaced', () => {
    const profile = { totalConversations: 4 };
    neverLowerSessionCount('untouched-user', profile);
    expect(profile.totalConversations).toBe(4);
  });
});
