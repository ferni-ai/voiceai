/**
 * A win (wins.ts) opens the next call once: the greeting names it, it is the
 * call's one opening thread, and it is marked so no later call repeats it.
 */
import { describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
const win = {
  id: 'c1',
  commitmentId: 'c1',
  text: "I'll call my sister Sunday",
  doneAt: '2026-10-11T20:00:00Z',
};
const winForOpener = vi.fn(async (_uid: string) => win as typeof win | undefined);
const markWinSurfaced = vi.fn(async () => undefined);
vi.mock('../../../services/superhuman/wins.js', () => ({ winForOpener, markWinSurfaced }));

const { directedGreeting, GREETING_DIRECTION, WIN_DIRECTION, CHECK_IN_DIRECTION, openingThread } =
  await import('../greeting-direction.js');

type Request = { direction: string; facts: Record<string, string> };
const lastRequest = (): Request => directedText.mock.calls.at(-1)![1] as unknown as Request;

describe('a win in the greeting', () => {
  it('names the win once and marks it surfaced', async () => {
    await directedGreeting('gw-1', 'ferni', { userId: 'voice-eval-u1', userName: 'Sam' });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION + WIN_DIRECTION);
    expect(lastRequest().facts['something they said they would do, and did']).toBe(win.text);
    expect(markWinSurfaced).toHaveBeenCalledWith('voice-eval-u1', 'c1');
  });

  it('without a win the greeting is unchanged and nothing is marked', async () => {
    winForOpener.mockResolvedValueOnce(undefined);
    markWinSurfaced.mockClear();
    await directedGreeting('gw-2', 'ferni', { userId: 'voice-eval-u2' });
    expect(lastRequest().direction).toBe(GREETING_DIRECTION);
    expect(lastRequest().facts['something they said they would do, and did']).toBeUndefined();
    expect(markWinSurfaced).not.toHaveBeenCalled();
  });

  it('one opening thread: a win before a check-in', () => {
    expect(openingThread(win, 'go running')).toEqual({ win });
    expect(openingThread(undefined, 'go running')).toEqual({ checkIn: 'go running' });
    expect(openingThread(undefined, undefined)).toEqual({});
    expect(CHECK_IN_DIRECTION).not.toBe(WIN_DIRECTION);
  });
});
