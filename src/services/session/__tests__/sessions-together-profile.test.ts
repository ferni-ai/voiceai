/**
 * One count of "sessions together" reaches the prompt.
 *
 * Before: three counts reached one prompt for the same user (profile 21,
 * relationship engine 17, conversation docs 30). The session's profile now
 * carries the sessions-together count, read from the stored calls.
 */

import { describe, expect, it, vi } from 'vitest';
import { sessionCounter, withSessionsTogether } from '../sessions-together-profile.js';
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

describe('sessionCounter: the stored counter never goes down, and advances', () => {
  const counted = (n: number) => vi.fn(async () => ({ ...summarizeSessions([]), count: n }));

  it.each([
    // Counted below stored: mid-call saves keep 41, the end save moves it to 42 (was [3, 41])
    { name: 'stored 41, counted 3', stored: 41, count: 3, prompt: 3, mid: 41, end: 42 },
    // Counted above stored: the stored counter catches up to the count, then +1
    { name: 'stored 21, counted 30', stored: 21, count: 30, prompt: 30, mid: 30, end: 31 },
    // Nothing counted: the stored counter as before
    { name: 'stored 21, counted 0', stored: 21, count: 0, prompt: 21, mid: 21, end: 22 },
  ])('$name: prompt $prompt, auto-save $mid, end save $end', async (c) => {
    const counter = sessionCounter(counted(c.count));
    const loaded = { totalConversations: c.stored };
    const prompt = await counter.load('u1', loaded);
    expect(prompt?.totalConversations).toBe(c.prompt);
    expect(loaded.totalConversations).toBe(c.stored); // the loaded (cached) object is not changed

    expect(counter.forSave(prompt!).totalConversations).toBe(c.mid);
    const ended = { totalConversations: prompt!.totalConversations + 1 }; // updateProfileFromSession
    expect(counter.forSave(ended).totalConversations).toBe(c.end);
    // A second save (remember-name mid-call, then the end) keeps advancing, never resets
    const again = { totalConversations: ended.totalConversations + 1 };
    expect(counter.forSave(again).totalConversations).toBe(c.end + 1);
  });

  it('a failed read: saves never write below the stored counter', async () => {
    const counter = sessionCounter(
      vi.fn(async () => {
        throw new Error('Firestore unavailable');
      })
    );
    const prompt = await counter.load('u1', { totalConversations: 41 });
    expect(prompt?.totalConversations).toBe(41);
    expect(counter.forSave({ totalConversations: 2 }).totalConversations).toBe(41);
  });
});
