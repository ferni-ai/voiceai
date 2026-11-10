/**
 * STRANGER_GREETING_EASY (#3668): told to ask "about how they are or what is on their
 * mind", the first-call hello asked what was on their mind or how they were holding up
 * on 5 of 5 dev red-team calls (2026-11-10). On: it asks how it's going. Off: the
 * direction is the same string as before, for first calls and unplaced callers alike.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cue } from '../../../speech/direction/cue.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { directedGreeting, greetingDirection, GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { STRANGER_GREETING_DIRECTION, UNPLACED_GREETING_DIRECTION, EASY_QUESTION } =
  await import('../first-call-stranger.js');

const ON = { STRANGER_GREETING_EASY: 'on' };
const MIND = 'what is on their mind';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('STRANGER_GREETING_EASY off: the hello direction is unchanged', () => {
  it.each([
    ['unset', {}],
    ['off', { STRANGER_GREETING_EASY: 'off' }],
    ['a typo', { STRANGER_GREETING_EASY: 'true' }],
  ])('%s: first call and unplaced caller get the old strings', (_name, env) => {
    expect(greetingDirection('ferni', env, { firstCall: true })).toBe(STRANGER_GREETING_DIRECTION);
    expect(greetingDirection('ferni', env, { unplaced: true })).toBe(UNPLACED_GREETING_DIRECTION);
    expect(STRANGER_GREETING_DIRECTION).toContain(MIND);
  });
});

describe('STRANGER_GREETING_EASY on: a first hello asks how it is going', () => {
  it.each([
    ['first call', { firstCall: true }],
    ['unplaced caller', { unplaced: true }],
  ])('%s: the easy question replaces the on-your-mind one', (_name, last) => {
    const direction = greetingDirection('ferni', ON, last);
    expect(direction).toContain(EASY_QUESTION);
    expect(direction).toContain("how's it going?");
    expect(direction).toMatch(/not "how are you holding up", which assumes something is wrong/);
    expect(direction).not.toContain(MIND);
    // The rest of the stranger's rules stay: no tease, no shared past.
    expect(direction).toContain('no tease');
    expect(direction).toContain('never imply you have talked before');
  });

  it('keeps the first-call intro when FIRST_CALL_INTRO adds one', () => {
    const direction = greetingDirection('ferni', ON, { firstCall: true }, 'Ferni');
    expect(direction).toContain(EASY_QUESTION);
    expect(direction).toContain('"Hi Sam, it\'s Ferni."');
    expect(direction).not.toContain('or introduce yourself');
  });

  it("leaves a returning caller's hello alone", () => {
    expect(greetingDirection('ferni', ON, {})).toBe(GREETING_DIRECTION);
  });

  it('reaches the live hello through process.env', async () => {
    vi.stubEnv('STRANGER_GREETING_EASY', 'on');
    await directedGreeting('sge-1', 'ferni', {
      userId: 'voice-eval-new',
      userName: 'Sam',
      isReturningUser: false,
    });
    const cue = directedText.mock.calls.at(-1)![1] as unknown as Cue;
    expect(cue.direction).toContain(EASY_QUESTION);
    expect(cue.direction).not.toContain(MIND);
  });
});
